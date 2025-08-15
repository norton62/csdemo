import http from 'http';
import { URL } from 'url';
import { exec, ExecOptions } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// ========================================================================================
// SECURITY: RATE LIMITING
// ========================================================================================
// This is a simple in-memory rate limiter to prevent abuse.
// For a production environment, a more robust solution like a Redis-backed
// limiter would be better, but this is a great starting point.

const rateLimitStore: { [ip: string]: number[] } = {};
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 15; // Allow 15 requests per minute per IP

const isRateLimited = (ip: string): boolean => {
    const now = Date.now();
    const userRequests = rateLimitStore[ip] || [];

    // Filter out requests that are outside the time window
    const requestsInWindow = userRequests.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW_MS);

    if (requestsInWindow.length >= MAX_REQUESTS_PER_WINDOW) {
        return true; // User has exceeded the rate limit
    }

    // Add the current request timestamp and update the store
    requestsInWindow.push(now);
    rateLimitStore[ip] = requestsInWindow;
    return false;
};


// ========================================================================================
// HTTP SERVER LOGIC
// ========================================================================================

const server = http.createServer(async (req, res) => {
    // SECURITY: Replace wildcard CORS with a specific origin for your frontend
    // When you deploy your frontend, change 'http://localhost:8080' (or wherever you test)
    // to your actual public domain (e.g., 'https://www.mycs2site.com').
    const allowedOrigin = 'https://csreplay.xyz'; // For now, keep it open for local testing. CHANGE THIS FOR PRODUCTION.
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle pre-flight requests for CORS
    if (req.method === 'OPTIONS') {
        res.writeHead(204); // No Content
        res.end();
        return;
    }

    // SECURITY: Apply the rate limiter
    const clientIp = req.socket.remoteAddress || 'unknown';
    if (isRateLimited(clientIp)) {
        res.writeHead(429, { 'Content-Type': 'application/json' }); // 429 Too Many Requests
        res.end(JSON.stringify({ error: 'Too many requests. Please try again later.' }));
        return;
    }

    // We only want to handle POST requests to the /decode endpoint
    const requestUrl = new URL(req.url || '', `http://${req.headers.host}`);
    if (requestUrl.pathname === '/decode' && req.method === 'POST') {
        let body = '';
        
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => { // No longer needs to be async here
            try {
                const { shareCode } = JSON.parse(body);
                if (!shareCode) {
                    throw new Error('Missing shareCode in request body.');
                }
                
                // --- EXECUTE THE WORKING COMMAND-LINE SCRIPT ---
                const __filename = fileURLToPath(import.meta.url);
                const __dirname = path.dirname(__filename);
                const projectRoot = path.join(__dirname, '..'); // The root directory of your project
                const scriptPath = path.join(projectRoot, 'dist', 'index.js');

                // Sanitize the share code to prevent command injection vulnerabilities.
                const sanitizedShareCode = shareCode.replace(/[^a-zA-Z0-9-]/g, '');
                const command = `node "${scriptPath}" demo-url ${sanitizedShareCode}`;
                
                // CRITICAL FIX: Set the Current Working Directory (cwd) for the command.
                const execOptions: ExecOptions = {
                    cwd: projectRoot
                };

                console.log(`Executing command: ${command} in ${projectRoot}`);

                exec(command, execOptions, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Execution error: ${error.message}`);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: `Server error: ${stderr || error.message}` }));
                        return;
                    }
                    if (stderr) {
                        console.error(`Standard error: ${stderr}`);
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: stderr.trim() }));
                        return;
                    }

                    // --- PARSE THE COMMAND OUTPUT TO EXTRACT ONLY THE URL ---
                    const urlMatch = stdout.match(/https?:\/\/[^\s]+/);
                    
                    if (!urlMatch || !urlMatch[0]) {
                        console.error(`Could not find a URL in the script output. Full output: ${stdout}`);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Server error: Could not parse the demo link from the script output.' }));
                        return;
                    }

                    const downloadLink = urlMatch[0];
                    console.log(`Successfully parsed link: ${downloadLink}`);

                    // Send the successful response
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
// Listen on all available network interfaces, not just localhost.
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CS2 Share Code Decoder API is running on http://localhost:${PORT}`);
    console.log(`   Accepting connections from your local network and the internet.`);
    console.log(`Listening for POST requests on /decode`);
});
