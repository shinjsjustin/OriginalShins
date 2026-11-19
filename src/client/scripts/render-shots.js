// Headless screenshots of a phase's changed states.
//   node src/client/scripts/render-shots.js <phase>
// Builds the client against a local fixture API, serves it, drives headless
// Chrome over CDP and writes render-shots/<phase>/<state>-<phone|desktop>.png
// at the repo root. Exits 1 if any state fails.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { createFixtureApi } = require('./render-fixtures');

const CLIENT_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(CLIENT_DIR, '..', '..');
const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEWPORTS = {
    phone: { width: 390, height: 844, mobile: true },
    desktop: { width: 1440, height: 900, mobile: false },
};
const WAIT_TIMEOUT_MS = 10000;
const POLL_MS = 50;
const SECONDS_PER_DAY = 86400;

// Steps: { click: sel } | { type: [sel, text] } | { wait: sel }.
// Each phase is a table of states; P3 adds its own key.
const PHASES = {
    p2: [
        { name: 'settings-keys', url: '/settings', steps: [{ wait: '.settings-key' }] },
        {
            name: 'settings-new-key',
            url: '/settings',
            steps: [
                { wait: '.settings-key' },
                { type: ['#key-name', 'Reading group'] },
                { click: 'button[type="submit"]' },
                { wait: '.settings-secret' },
            ],
        },
        { name: 'scrolls-list', url: '/scrolls', steps: [{ wait: '.scrolls-row' }] },
        { name: 'scrolls-open', url: '/scrolls?scroll=1', steps: [{ wait: '.scrolls-block--question' }] },
        {
            name: 'scrolls-answered',
            url: '/scrolls?scroll=1',
            steps: [
                { wait: '.scrolls-block--question' },
                { type: ['.scrolls-answer-input', 'Because new life is given, not earned.'] },
                { click: '.scrolls-answer-actions button' },
                { wait: '.scrolls-status' },
            ],
        },
    ],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const freePort = () => new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        server.close(() => resolve(port));
    });
});

const unsignedToken = () => {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + SECONDS_PER_DAY;
    return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ id: 1, access: 1, exp })}.`;
};

const CONTENT_TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.map': 'application/json',
};

const startServer = (buildDir, port) => {
    const api = createFixtureApi();
    const server = http.createServer((req, res) => {
        const { pathname } = new URL(req.url, 'http://localhost');
        if (pathname.startsWith('/api/')) {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                const raw = Buffer.concat(chunks).toString();
                const { status, body } = api(req.method, pathname.slice('/api'.length), raw ? JSON.parse(raw) : undefined);
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(body));
            });
            return;
        }
        const requested = path.join(buildDir, path.normalize(pathname));
        const isFile = requested.startsWith(buildDir) && fs.existsSync(requested) && fs.statSync(requested).isFile();
        const file = isFile ? requested : path.join(buildDir, 'index.html');
        res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
};

const buildClient = (buildDir, port) => {
    const result = spawnSync('npx', ['react-scripts', 'build'], {
        cwd: CLIENT_DIR,
        env: { ...process.env, REACT_APP_URL: `http://127.0.0.1:${port}/api`, BUILD_PATH: buildDir, CI: 'false' },
        stdio: ['ignore', 'ignore', 'inherit'],
    });
    if (result.status !== 0) throw new Error('client build failed');
};

// A minimal CDP client over the browser's websocket; commands carry a sessionId.
const connect = (url) => new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    let nextId = 0;
    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const waiter = pending.get(message.id);
        if (!waiter) return;
        pending.delete(message.id);
        if (message.error) waiter.reject(new Error(`${waiter.method}: ${message.error.message}`));
        else waiter.resolve(message.result);
    };
    ws.onerror = () => reject(new Error('could not connect to Chrome'));
    ws.onopen = () => resolve({
        send: (method, params = {}, sessionId) => new Promise((res, rej) => {
            nextId += 1;
            pending.set(nextId, { resolve: res, reject: rej, method });
            ws.send(JSON.stringify({ id: nextId, method, params, sessionId }));
        }),
        close: () => ws.close(),
    });
});

const launchChrome = async (debugPort, profileDir) => {
    const chrome = spawn(process.env.CHROME || DEFAULT_CHROME, [
        '--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`,
        '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank',
    ], { stdio: 'ignore' });
    for (let i = 0; i < WAIT_TIMEOUT_MS / 100; i += 1) {
        try {
            const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
            const { webSocketDebuggerUrl } = await response.json();
            return { chrome, cdp: await connect(webSocketDebuggerUrl) };
        } catch {
            await sleep(100);
        }
    }
    chrome.kill();
    throw new Error('Chrome did not start');
};

const evaluate = async (cdp, sessionId, expression) => {
    const { result, exceptionDetails } = await cdp.send(
        'Runtime.evaluate', { expression, returnByValue: true }, sessionId,
    );
    if (exceptionDetails) throw new Error(`evaluate failed: ${exceptionDetails.text}`);
    return result.value;
};

const waitFor = async (cdp, sessionId, selector) => {
    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (await evaluate(cdp, sessionId, `!!document.querySelector(${JSON.stringify(selector)})`)) return;
        await sleep(POLL_MS);
    }
    throw new Error(`timed out waiting for ${selector}`);
};

const runStep = async (cdp, sessionId, step) => {
    if (step.wait) return waitFor(cdp, sessionId, step.wait);
    if (step.click) {
        await waitFor(cdp, sessionId, step.click);
        return evaluate(cdp, sessionId, `document.querySelector(${JSON.stringify(step.click)}).click()`);
    }
    const [selector, text] = step.type;
    await waitFor(cdp, sessionId, selector);
    await evaluate(cdp, sessionId, `document.querySelector(${JSON.stringify(selector)}).focus()`);
    return cdp.send('Input.insertText', { text }, sessionId);
};

const shoot = async (cdp, origin, state, viewportName, outDir) => {
    const viewport = VIEWPORTS[viewportName];
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    try {
        await cdp.send('Page.enable', {}, sessionId);
        await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile,
        }, sessionId);
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
            source: `localStorage.setItem('token', ${JSON.stringify(unsignedToken())});`,
        }, sessionId);
        await cdp.send('Page.navigate', { url: `${origin}${state.url}` }, sessionId);
        for (const step of state.steps) await runStep(cdp, sessionId, step);
        await sleep(300);

        const height = await evaluate(cdp, sessionId, 'Math.ceil(document.documentElement.scrollHeight)');
        const { data } = await cdp.send('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: true,
            clip: { x: 0, y: 0, width: viewport.width, height: Math.max(height, viewport.height), scale: 1 },
        }, sessionId);
        fs.writeFileSync(path.join(outDir, `${state.name}-${viewportName}.png`), Buffer.from(data, 'base64'));
    } finally {
        await cdp.send('Target.closeTarget', { targetId });
    }
};

const main = async () => {
    const phase = process.argv[2];
    const states = PHASES[phase];
    if (!states) {
        console.error(`Unknown phase "${phase}". Known: ${Object.keys(PHASES).join(', ')}`);
        return 1;
    }

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-shots-'));
    const outDir = path.join(REPO_ROOT, 'render-shots', phase);
    fs.mkdirSync(outDir, { recursive: true });
    const port = await freePort();
    let server;
    let browser;
    let failures = 0;
    try {
        buildClient(path.join(workDir, 'build'), port);
        server = await startServer(path.join(workDir, 'build'), port);
        browser = await launchChrome(await freePort(), path.join(workDir, 'profile'));
        for (const state of states) {
            for (const viewportName of Object.keys(VIEWPORTS)) {
                try {
                    await shoot(browser.cdp, `http://127.0.0.1:${port}`, state, viewportName, outDir);
                    console.log(`ok   ${state.name}-${viewportName}`);
                } catch (err) {
                    failures += 1;
                    console.error(`FAIL ${state.name}-${viewportName}: ${err.message}`);
                }
            }
        }
    } catch (err) {
        console.error(err.message);
        failures += 1;
    } finally {
        if (browser) {
            browser.cdp.close();
            const hasExited = new Promise((resolve) => browser.chrome.once('exit', resolve));
            browser.chrome.kill();
            await hasExited;
        }
        if (server) server.close();
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
    return failures === 0 ? 0 : 1;
};

main().then((code) => process.exit(code));
