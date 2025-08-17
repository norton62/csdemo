import http from 'http';
import https from 'https';
import { URL } from 'url';
import { exec, ExecOptions } from 'child_process';
import path from 'path';
import fs from 'fs';
import puppeteer from 'puppeteer';

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
// CSSTATS.GG LINK RESOLVER (using Headless Browser) - REWRITTEN
// ========================================================================================
async function resolveCsStatsLink(url: string): Promise<string> {
    let browser;
    try {
        console.log('Launching headless browser...');
        browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();

        // Make the headless browser look more like a real browser
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });

        // Create a promise that resolves only when the correct redirect is found
        const shareCodePromise = new Promise<string>((resolve, reject) => {
            page.on('response', response => {
                if (response.status() >= 300 && response.status() < 400) {
                    const location = response.headers()['location'];
                    if (location && location.startsWith('steam://')) {
                        const match = location.match(/(CSGO-[a-zA-Z0-9]{5}-[a-zA-Z0-9]{5}-[a-zA-Z0-9]{5}-[a-zA-Z0-9]{5}-[a-zA-Z0-9]{5})/);
                        if (match && match[0]) {
                            resolve(match[0]);
                        }
                    }
                }
            });
        });

        console.log(`Navigating to ${url}...`);
        // Navigate to the page but don't wait forever
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

        // Wait for either the redirect to be found or a 15-second timeout
        const shareCode = await Promise.race([
            shareCodePromise,
            new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for redirect from csstats.gg')), 15000))
        ]);
        
        await browser.close();
        return shareCode;

    } catch (error) {
        if (browser) {
            await browser.close();
        }
        console.error('Puppeteer failed:', error);
        throw new Error('Failed to resolve CSstats.gg link.');
    }
}


// ========================================================================================
// HTTP SERVER LOGIC
// ========================================================================================
const server = http.createServer(async (req, res) => {
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

        if (requestUrl.pathname === '/count' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ count: successfulParses }));
            return;
        }

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

        if (requestUrl.pathname === '/decode' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', async () => {
                try {
                    let { shareCode } = JSON.parse(body);
                    if (!shareCode) throw new Error('Missing shareCode.');

                    if (shareCode.includes('csstats.gg/match/')) {
                        shareCode = await resolveCsStatsLink(shareCode);
                    }

                    const projectRoot = process.cwd();
                    const scriptPath = path.join(projectRoot, 'dist', 'index.js');
                    const command = `node "${scriptPath}" demo-url ${shareCode.replace(/[^a-zA-Z0-9-]/g, '')}`;
                    const execOptions: ExecOptions = { cwd: projectRoot, timeout: 30000 };

                    exec(command, execOptions, (error, stdout, stderr) => {
                        if (error) {
                            const errorMessage = error.signal === 'SIGTERM' ? 'Decoding timed out.' : (stderr || error.message).trim();
                            return res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: `Server error: ${errorMessage}` }));
                        }
                        const urlMatch = stdout.match(/https?:\/\/[^\s]+/);
                        if (!urlMatch || !urlMatch[0]) {
                            return res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Could not parse demo link.' }));
                        }
                        successfulParses++;
                        saveCount();
                        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ downloadLink: urlMatch[0], newCount: successfulParses }));
                    });
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Invalid request.';
                    res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: errorMessage }));
                }
            });
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Not Found' }));
        }
    } catch (e) {
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Internal server error.' }));
        }
    }
});

const PORT = 3000;
loadCount();
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API is running on port ${PORT}`);
});