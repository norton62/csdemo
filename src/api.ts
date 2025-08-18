import 'dotenv/config'; // Loads variables from .env file
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { exec, ExecOptions } from 'child_process';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';

// ========================================================================================
// FIREBASE SETUP
// ========================================================================================
// The configuration is now loaded securely from environment variables.
// You must set these variables on each of your server machines.
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// Check if the Firebase config is valid before initializing
if (!firebaseConfig.projectId) {
    console.error("Firebase configuration is missing. Make sure environment variables are set.");
    // Exit gracefully if config is missing, to prevent crashes.
    // In a real app, you might handle this differently.
    process.exit(1); 
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const statsDocRef = doc(db, 'stats', 'global');
const cacheCollectionRef = 'shareCodeCache';

// ========================================================================================
// SECURITY: RATE LIMITING
// ========================================================================================
const rateLimitStore: { [ip: string]: number[] } = {};
const RATE_LIMIT_WINDOW_MS = 60000;
const MAX_REQUESTS_PER_WINDOW = 15;

const isRateLimited = (ip: string): boolean => {
    const now = Date.now();
    const userRequests = rateLimitStore[ip] || [];
    const requestsInWindow = userRequests.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW_MS);
    if (requestsInWindow.length >= MAX_REQUESTS_PER_WINDOW) {
        return true;
    }
    requestsInWindow.push(now);
    rateLimitStore[ip] = requestsInWindow;
    return false;
};

// ========================================================================================
// HTTP SERVER LOGIC
// ========================================================================================
const server = http.createServer(async (req, res) => {
    const allowedOrigin = 'https://csreplay.xyz';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204).end();
        return;
    }

    const clientIp = req.socket.remoteAddress || 'unknown';
    const requestUrl = new URL(req.url || '', `http://${req.headers.host}`);

    // --- Endpoint for getting the count (NO RATE LIMIT) ---
    if (requestUrl.pathname === '/count' && req.method === 'GET') {
        try {
            const docSnap = await getDoc(statsDocRef);
            const count = docSnap.exists() ? docSnap.data().totalParses : 0;
            res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ count }));
        } catch (error) {
            res.writeHead(500).end(JSON.stringify({ error: 'Could not fetch count.' }));
        }
        return;
    }

    // --- Apply rate limiting to all other endpoints ---
    if (isRateLimited(clientIp)) {
        res.writeHead(429, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Too many requests.' }));
        return;
    }

    // --- Endpoint for proxying the download ---
    if (requestUrl.pathname === '/download' && (req.method === 'GET' || req.method === 'HEAD')) {
        const demoUrl = requestUrl.searchParams.get('url');
        if (!demoUrl || !demoUrl.startsWith('http://replay')) {
            res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Invalid or missing demo URL.' }));
            return;
        }
        http.get(demoUrl, (proxyRes) => {
            const filename = demoUrl.split('/').pop() || 'cs2-demo.dem.bz2';
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            if (proxyRes.headers['content-type']) res.setHeader('Content-Type', proxyRes.headers['content-type']);
            if (proxyRes.headers['content-length']) res.setHeader('Content-Length', proxyRes.headers['content-length']);
            if (req.method === 'HEAD') {
                res.writeHead(proxyRes.statusCode || 200).end();
            } else {
                res.writeHead(proxyRes.statusCode || 200);
                proxyRes.pipe(res);
            }
        }).on('error', (err) => res.writeHead(500).end());
        return;
    }

    // --- Endpoint for decoding the share code ---
    if (requestUrl.pathname === '/decode' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const { shareCode } = JSON.parse(body);
                if (!shareCode) throw new Error('Missing shareCode.');

                const cacheDocRef = doc(db, cacheCollectionRef, shareCode);
                const cacheSnap = await getDoc(cacheDocRef);

                if (cacheSnap.exists()) {
                    console.log(`Cache hit for: ${shareCode}`);
                    const downloadLink = cacheSnap.data().downloadLink;
                    // We don't increment the main counter on a cache hit to avoid double counting
                    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ downloadLink }));
                    return;
                }
                
                console.log(`Cache miss for: ${shareCode}. Decoding...`);
                const projectRoot = process.cwd();
                const scriptPath = path.join(projectRoot, 'dist', 'index.js');
                const command = `node "${scriptPath}" demo-url ${shareCode.replace(/[^a-zA-Z0-9-]/g, '')}`;
                const execOptions: ExecOptions = { cwd: projectRoot, timeout: 30000 };

                exec(command, execOptions, async (error, stdout, stderr) => {
                    if (error) {
                        const errorMessage = error.signal === 'SIGTERM' ? 'Decoding timed out.' : (stderr || error.message).trim();
                        return res.writeHead(500).end(JSON.stringify({ error: `Server error: ${errorMessage}` }));
                    }
                    const urlMatch = stdout.match(/https?:\/\/[^\s]+/);
                    if (!urlMatch || !urlMatch[0]) {
                        return res.writeHead(500).end(JSON.stringify({ error: 'Could not parse demo link.' }));
                    }

                    const downloadLink = urlMatch[0];
                    
                    // Save to cache and increment counter in Firestore
                    await setDoc(cacheDocRef, { downloadLink, resolvedAt: new Date() });
                    await setDoc(statsDocRef, { totalParses: increment(1) }, { merge: true });

                    console.log(`Success: ${downloadLink}. Saved to cache.`);
                    const docSnap = await getDoc(statsDocRef);
                    const newCount = docSnap.exists() ? docSnap.data().totalParses : 0;
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ downloadLink, newCount }));
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Invalid request.';
                res.writeHead(400).end(JSON.stringify({ error: errorMessage }));
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Not Found' }));
    }
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API is running on port ${PORT}`);
});
