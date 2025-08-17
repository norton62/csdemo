import http from 'http';
import https from 'https';
import { URL } from 'url';
import { exec, ExecOptions } from 'child_process';
import path from 'path';
import fs from 'fs';

// ========================================================================================
// COUNTER LOGIC WITH PERSISTENCE
// ========================================================================================
const countFilePath = path.join(process.cwd(), 'count.json');
let successfulParses = 0;

function loadCount() {
    try {
        if (fs.existsSync(countFilePath)) {
            const data = fs.readFileSync(countFilePath, 'utf-8');
            successfulParses = JSON.parse(data).count || 0;
            console.log(`Successfully loaded count: ${successfulParses}`);
        } else {
            console.log('count.json not found, starting count at 0.');
        }
    } catch (error) {
        console.error('Error loading count from file:', error);
    }
}

function saveCount() {
    try {
        fs.writeFileSync(countFilePath, JSON.stringify({ count: successfulParses }, null, 2), 'utf-8');
    } catch (error) {
        console.error('Error saving count to file:', error);
    }
}

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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204).end();
        return;
    }

    const clientIp = req.socket.remoteAddress || 'unknown';
    if (isRateLimited(clientIp)) {
        res.writeHead(429, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Too many requests.' }));
        return;
    }

    const requestUrl = new URL(req.url || '', `http://${req.headers.host}`);

    // --- Endpoint for getting the count ---
    if (requestUrl.pathname === '/count' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ count: successfulParses }));
        return;
    }

    // --- Endpoint for proxying the download ---
    if (requestUrl.pathname === '/download' && req.method === 'GET') {
        const demoUrl = requestUrl.searchParams.get('url');
        if (!demoUrl || !demoUrl.startsWith('http://replay')) {
            res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Invalid or missing demo URL.' }));
            return;
        }

        console.log(`Proxying download for: ${demoUrl}`);
        
        http.get(demoUrl, (proxyRes) => {
            const filename = demoUrl.split('/').pop() || 'cs2-demo.dem.bz2';
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            if (proxyRes.headers['content-type']) {
                res.setHeader('Content-Type', proxyRes.headers['content-type']);
            }
            if (proxyRes.headers['content-length']) {
                res.setHeader('Content-Length', proxyRes.headers['content-length']);
            }
            proxyRes.pipe(res);
        }).on('error', (err) => {
            console.error('Proxy request failed:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Failed to fetch the demo file.' }));
        });
        return;
    }

    // --- Endpoint for decoding the share code ---
    if (requestUrl.pathname === '/decode' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const { shareCode } = JSON.parse(body);
                if (!shareCode) throw new Error('Missing shareCode.');

                const projectRoot = process.cwd();
                const scriptPath = path.join(projectRoot, 'dist', 'index.js');
                const command = `node "${scriptPath}" demo-url ${shareCode.replace(/[^a-zA-Z0-9-]/g, '')}`;
                const execOptions: ExecOptions = { cwd: projectRoot, timeout: 30000 };

                console.log(`Executing: ${command}`);
                exec(command, execOptions, (error, stdout, stderr) => {
                    if (error) {
                        if (error.signal === 'SIGTERM') {
                            console.error('Execution timed out.');
                            res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Server error: Decoding timed out. The Steam client may not be running.' }));
                            return;
                        }
                        const errorMessage = stderr || error.message;
                        console.error(`Exec error: ${errorMessage}`);
                        res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: `Server error: ${errorMessage.trim()}` }));
                        return;
                    }

                    const urlMatch = stdout.match(/https?:\/\/[^\s]+/);
                    if (!urlMatch || !urlMatch[0]) {
                        res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Could not parse demo link.' }));
                        return;
                    }

                    successfulParses++;
                    saveCount();
                    const downloadLink = urlMatch[0];
                    console.log(`Success: ${downloadLink}. Total: ${successfulParses}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ downloadLink, newCount: successfulParses }));
                });
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Invalid request.' }));
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Not Found' }));
    }
});

const PORT = 3000;
loadCount();
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API is running on port ${PORT}`);
});
