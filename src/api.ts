import http from 'http';
import { URL } from 'url';
import { exec, ExecOptions } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

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

        req.on('end', () => {
            try {
                const { shareCode } = JSON.parse(body);
                if (!shareCode) {
                    throw new Error('Missing shareCode in request body.');
                }

                // --- EXECUTE THE COMMAND-LINE SCRIPT FROM THE CORRECT DIRECTORY ---
                // Render's root directory for projects is /opt/render/project/src
                // We will use this as the base for our paths.
                const projectRoot = '/opt/render/project/src';
                const scriptPath = path.join(projectRoot, 'dist', 'index.js');
                const sanitizedShareCode = shareCode.replace(/[^a-zA-Z0-9-]/g, '');
                const command = `node "${scriptPath}" demo-url ${sanitizedShareCode}`;

                // CRITICAL FIX: Set the Current Working Directory (cwd) for the command.
                // This forces the script to run from the project root, allowing it
                // to correctly locate the node_modules folder.
                const execOptions: ExecOptions = {
                    cwd: projectRoot
                };

                console.log(`Executing command: ${command} in ${projectRoot}`);

                exec(command, execOptions, (error, stdout, stderr) => {
                    if (error || stderr) {
                        const errorMessage = stderr || (error ? error.message : 'Unknown execution error');
                        console.error(`Execution error: ${errorMessage}`);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: `Server error: ${errorMessage}` }));
                        return;
                    }

                    const urlMatch = stdout.match(/https?:\/\/[^\s]+/);
                    if (!urlMatch || !urlMatch[0]) {
                        console.error(`Could not find a URL in the script output. Full output: ${stdout}`);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Server error: Could not parse the demo link.' }));
                        return;
                    }

                    const downloadLink = urlMatch[0];
                    console.log(`Successfully parsed link: ${downloadLink}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ downloadLink: downloadLink }));
                });

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

const PORT = 3000;
// Render provides the port to use via an environment variable.
// We should use that, but fall back to 3000 for local development.
const listenPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

server.listen(listenPort, '0.0.0.0', () => {
    console.log(`🚀 CS2 Share Code Decoder API is running on port ${listenPort}`);
    console.log(`   Accepting connections from any IP.`);
});
