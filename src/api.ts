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
// CSSTATS.GG LINK RESOLVER
// ========================================================================================
function resolveCsStatsLink(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                // Add a full set of browser headers to avoid being blocked
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Connection': 'keep-alive',
            }
        };

        https.get(url, options, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                const location = res.headers.location;
                if (location && location.includes('CSGO-')) {
                    const match = location.match(/(CSGO-[a-zA-Z0-9]{5}-[a-zA-Z0-9]{5}-[a-zA-Z0-9]{5}-[a-zA-Z0-9]{5}-[a-zA-Z0-9]{5})/);
                    if (match && match[0]) {
                        resolve(match[0]);
                    } else {
                        reject(new Error('Could not extract share code from redirect URL.'));
                    }
                } else {
                    reject(new Error('Redirect URL did not contain a valid share code.'));
                }
            } else {
                reject(new Error(`CSstats.gg did not redirect as expected. Status: ${res.statusCode}`));
            }
        }).on('error', (err) => {
            reject(err);
        });
    });
}


// ========================================================================================
// HTTP SERVER LOGIC
// ========================================================================================
const server = http.createServer((req, res) => {
    // Added a top-level try-catch to prevent the server from ever crashing
    try {
        const allowedOrigin = 'https://csreplay.xyz';
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
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
        if (requestUrl.pathname === '/download' && (req.method === 'GET' || req.method === 'HEAD')) {
            const demoUrl = requestUrl.searchParams.get('url');
            if (!demoUrl || !demoUrl.startsWith('http://replay')) {
                res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Invalid or missing demo URL.' }));
                return;
            }

            console.log(`Proxying ${req.method} for: ${demoUrl}`);
            
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
            req.on('end', async () => {
                try {
                    let { shareCode } = JSON.parse(body);
                    if (!shareCode) throw new Error('Missing shareCode.');

                    if (shareCode.includes('csstats.gg/match/')) {
                        console.log(`Resolving CSstats.gg link: ${shareCode}`);
                        shareCode = await resolveCsStatsLink(shareCode);
                        console.log(`Resolved to share code: ${shareCode}`);
                    }

                    const projectRoot = process.cwd();
                    const scriptPath = path.join(projectRoot, 'dist', 'index.js');
                    const command = `node "${scriptPath}" demo-url ${shareCode.replace(/[^a-zA-Z0-9-]/g, '')}`;
                    const execOptions: ExecOptions = { cwd: projectRoot, timeout: 30000 };

                    console.log(`Executing: ${command}`);
                    exec(command, execOptions, (error, stdout, stderr) => {
                        if (error) {
                            if (error.signal === 'SIGTERM') {
                                return res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Server error: Decoding timed out.' }));
                            }
                            return res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: `Server error: ${(stderr || error.message).trim()}` }));
                        }

                        const urlMatch = stdout.match(/https?:\/\/[^\s]+/);
                        if (!urlMatch || !urlMatch[0]) {
                            return res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Could not parse demo link from script output.' }));
                        }

                        successfulParses++;
                        saveCount();
                        const downloadLink = urlMatch[0];
                        console.log(`Success: ${downloadLink}. Total: ${successfulParses}`);
                        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ downloadLink, newCount: successfulParses }));
                    });
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Invalid request.';
                    console.error(`Request failed: ${errorMessage}`);
                    res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: errorMessage }));
                }
            });
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Not Found' }));
        }
    } catch (e) {
        console.error("Unhandled error in server handler:", e);
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'An internal server error occurred.' }));
        }
    }
});

const PORT = 3000;
loadCount();
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API is running on port ${PORT}`);
});
