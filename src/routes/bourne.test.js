const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const jwt = require('jsonwebtoken');
const isReadKey = require('../middleware/isReadKey');
const isAuth = require('../middleware/isAuth');
const { createBourneRouter } = require('./bourne');

const KEY = 'bourne-test-key';
const ENV_NAMES = ['BOURNE_API_KEY', 'BOURNE_USER_ID', 'JWT_SECRET'];
const PASSAGE = { bookId: 43, bookName: 'John', chapter: 3, savedAt: '2026-01-02T03:04:05.000Z' };

// Runs fn with a live server, restoring the env afterwards.
async function withServer(deps, fn, mount = (app, router) => app.use('/api/bourne', isReadKey, router)) {
    const saved = ENV_NAMES.map((k) => [k, process.env[k]]);
    process.env.BOURNE_API_KEY = KEY;
    process.env.BOURNE_USER_ID = '7';
    process.env.JWT_SECRET = 'jwt-test-secret';
    const app = express();
    mount(app, createBourneRouter(deps));
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    try {
        return await fn(`http://127.0.0.1:${server.address().port}`);
    } finally {
        await new Promise((resolve) => server.close(resolve));
        for (const [k, v] of saved) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    }
}

const bearer = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

test('GET /location answers 200 with the passage for the key user', async () => {
    const calls = [];
    const deps = { findCurrentPassage: async (id) => { calls.push(id); return PASSAGE; } };
    await withServer(deps, async (base) => {
        const res = await fetch(`${base}/api/bourne/location`, bearer(KEY));
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), { location: PASSAGE });
        assert.deepStrictEqual(calls, [7]);
    });
});

test('GET /location answers location null when nothing is saved', async () => {
    await withServer({ findCurrentPassage: async () => null }, async (base) => {
        const res = await fetch(`${base}/api/bourne/location`, bearer(KEY));
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), { location: null });
    });
});

test('GET /location answers 500 when the read throws', async () => {
    await withServer({ findCurrentPassage: async () => { throw new Error('db down'); } }, async (base) => {
        const origError = console.error;
        console.error = () => {};
        try {
            const res = await fetch(`${base}/api/bourne/location`, bearer(KEY));
            assert.strictEqual(res.status, 500);
            assert.ok((await res.json()).error);
        } finally {
            console.error = origError;
        }
    });
});

test('writes answer 405 with Allow GET on any path when keyed, 401 without', async () => {
    await withServer({ findCurrentPassage: async () => PASSAGE }, async (base) => {
        for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
            for (const p of ['/location', '/anything/else']) {
                const keyed = await fetch(`${base}/api/bourne${p}`, { method, ...bearer(KEY) });
                assert.strictEqual(keyed.status, 405, `${method} ${p}`);
                assert.strictEqual(keyed.headers.get('allow'), 'GET');
                assert.ok((await keyed.json()).error);
                const bare = await fetch(`${base}/api/bourne${p}`, { method });
                assert.strictEqual(bare.status, 401, `${method} ${p} bare`);
            }
        }
    });
});

test('a JWT sent to /api/bourne is refused', async () => {
    await withServer({ findCurrentPassage: async () => PASSAGE }, async (base) => {
        const token = jwt.sign({ id: 7 }, process.env.JWT_SECRET);
        const res = await fetch(`${base}/api/bourne/location`, bearer(token));
        assert.strictEqual(res.status, 403);
    });
});

test('the Bourne key sent through isAuth answers 403', async () => {
    await withServer({}, async (base) => {
        const res = await fetch(`${base}/protected`, bearer(KEY));
        assert.strictEqual(res.status, 403);
    }, (app) => app.get('/protected', isAuth, (req, res) => res.json({ ok: true })));
});
