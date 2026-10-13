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

const HISTORY = { from: '2026-01-01', to: '2026-01-02', loggingBegan: null, days: [] };

async function quietly(fn) {
    const origError = console.error;
    console.error = () => {};
    try {
        return await fn();
    } finally {
        console.error = origError;
    }
}

test('GET /history reads the requested range in the reading zone for the key user', async () => {
    const calls = [];
    const deps = { findReadingHistory: async (id, args) => { calls.push([id, args]); return HISTORY; } };
    const saved = process.env.READING_TIME_ZONE;
    process.env.READING_TIME_ZONE = 'Asia/Tokyo';
    try {
        await withServer(deps, async (base) => {
            const res = await fetch(`${base}/api/bourne/history?from=2026-01-01&to=2026-01-02`, bearer(KEY));
            assert.strictEqual(res.status, 200);
            assert.deepStrictEqual(await res.json(), HISTORY);
            assert.deepStrictEqual(calls, [[7, { from: '2026-01-01', to: '2026-01-02', timeZone: 'Asia/Tokyo' }]]);
        });
    } finally {
        if (saved === undefined) delete process.env.READING_TIME_ZONE;
        else process.env.READING_TIME_ZONE = saved;
    }
});

test('GET /history answers 400 for a bad range without reading', async () => {
    let read = false;
    await withServer({ findReadingHistory: async () => { read = true; } }, async (base) => {
        const res = await fetch(`${base}/api/bourne/history?from=nope`, bearer(KEY));
        assert.strictEqual(res.status, 400);
        assert.ok((await res.json()).error);
        assert.strictEqual(read, false);
    });
});

test('GET /notes answers the page with its paging fields and converts since to an instant', async () => {
    const calls = [];
    const deps = {
        findNotesForBourne: async (id, args) => { calls.push([id, args]); return { notes: [{ id: 1 }], hasMore: true }; },
    };
    const saved = process.env.READING_TIME_ZONE;
    process.env.READING_TIME_ZONE = 'UTC';
    try {
        await withServer(deps, async (base) => {
            const res = await fetch(`${base}/api/bourne/notes?since=2026-03-05&book=43&chapter=3&limit=10&offset=20`, bearer(KEY));
            assert.strictEqual(res.status, 200);
            assert.deepStrictEqual(await res.json(), { notes: [{ id: 1 }], hasMore: true, limit: 10, offset: 20 });
            assert.strictEqual(calls[0][0], 7);
            assert.deepStrictEqual(calls[0][1], {
                sinceInstant: new Date('2026-03-05T00:00:00.000Z'),
                bookId: 43,
                chapter: 3,
                limit: 10,
                offset: 20,
            });
        });
    } finally {
        if (saved === undefined) delete process.env.READING_TIME_ZONE;
        else process.env.READING_TIME_ZONE = saved;
    }
});

test('GET /notes without since passes a null instant and the defaults', async () => {
    const calls = [];
    const deps = { findNotesForBourne: async (id, args) => { calls.push(args); return { notes: [], hasMore: false }; } };
    await withServer(deps, async (base) => {
        const res = await fetch(`${base}/api/bourne/notes`, bearer(KEY));
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), { notes: [], hasMore: false, limit: 50, offset: 0 });
        assert.strictEqual(calls[0].sinceInstant, null);
    });
});

test('GET /notes answers 400 for bad params without reading', async () => {
    let read = false;
    await withServer({ findNotesForBourne: async () => { read = true; } }, async (base) => {
        const res = await fetch(`${base}/api/bourne/notes?chapter=3`, bearer(KEY));
        assert.strictEqual(res.status, 400);
        assert.ok((await res.json()).error);
        assert.strictEqual(read, false);
    });
});

test('GET /history and /notes answer 500 when the read throws, 401 without the key', async () => {
    const deps = {
        findReadingHistory: async () => { throw new Error('db down'); },
        findNotesForBourne: async () => { throw new Error('db down'); },
    };
    await withServer(deps, async (base) => {
        for (const p of ['/history', '/notes']) {
            const res = await quietly(() => fetch(`${base}/api/bourne${p}`, bearer(KEY)));
            assert.strictEqual(res.status, 500, p);
            assert.ok((await res.json()).error);
            const bare = await fetch(`${base}/api/bourne${p}`);
            assert.strictEqual(bare.status, 401, `${p} bare`);
        }
    });
});

test('POST /history and /notes still answer 405', async () => {
    await withServer({}, async (base) => {
        for (const p of ['/history', '/notes']) {
            const res = await fetch(`${base}/api/bourne${p}`, { method: 'POST', ...bearer(KEY) });
            assert.strictEqual(res.status, 405, p);
            assert.strictEqual(res.headers.get('allow'), 'GET');
        }
    });
});
