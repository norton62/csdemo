import http from 'http';
import { URL } from 'url';
import path from 'path';
// We are going back to importing the function directly
import { getDownloadLinkFromShareCode } from './lib/sharecode-handler.js';

// ========================================================================================
// SECURITY: RATE LIMITING
// ========================================================================================
const rateLimitStore: { [ip: string]: number[] } = {};
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 15; // Allow 15 requests per minute per IP

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
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const clientIp = req.socket.remoteAddress || 'unknown';
    if (isRateLimited(clientIp)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Too many requests. Please try again later.' }));
        return;
    }

    const requestUrl = new URL(req.url || '', `http://${req.headers.host}`);
    if (requestUrl.pathname === '/decode' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => { // Note: this is now an async function
            try {
                const { shareCode } = JSON.parse(body);
                if (!shareCode) {
                    throw new Error('Missing shareCode in request body.');
                }

                // --- DEFINITIVE FIX: PROVIDE THE EXPLICIT PATH TO THE EXECUTABLE ---
                // On Render, the project root is the current working directory.
                const projectRoot = process.cwd();
                // We construct the exact path to the Linux executable based on the error logs.
                const boilerPath = path.join(
                    projectRoot,
                    'node_modules',
                    '@akiver',
                    'boiler-writter',
                    'bin',
                    'linux-x64', // Specify the correct Linux executable
                    'boiler-writter'
                );

                console.log(`Attempting to use boiler executable at: ${boilerPath}`);

                // We now call your function directly and pass the explicit path.
                // This bypasses the library's faulty auto-detection.
                const result = await getDownloadLinkFromShareCode(shareCode, { boilerPath });

                if (!result || !result.demoUrl) {
                    throw new Error('Decoding failed: The result did not contain a demoUrl.');
                }
                
                const downloadLink = result.demoUrl;
                console.log(`Successfully retrieved link: ${downloadLink}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ downloadLink }));

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
                console.error('Error processing request:', errorMessage);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: errorMessage }));
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
    }
});

// Render provides the port to use via an environment variable.
const PORT = process.env.PORT || 3000;

server.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 CS2 Share Code Decoder API is running on port ${PORT}`);
    console.log(`   Accepting connections from any IP.`);
});
