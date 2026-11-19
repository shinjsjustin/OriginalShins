const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { createApiKeysRouter } = require('./apiKeys');

const CREATED = new Date('2026-01-02T03:04:05.000Z');

async function withServer(deps, fn) {
    const app = express();
    app.use('/api/keys', (req, res, next) => { req.user = { id: 7 }; next(); }, createApiKeysRouter(deps));
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    try {
        return await fn(`http://127.0.0.1:${server.address().port}/api/keys`);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

const quiet = async (fn) => {
    const orig = console.error;
    console.error = () => {};
    try { return await fn(); } finally { console.error = orig; }
};

const post = (base, body) => fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

test('POST / creates a key and answers 201 with the secret', async () => {
    const calls = [];
    const deps = {
        generateKey: () => ({ secret: 'scr_deadbeef', hash: 'h', hint: 'beef' }),
        insertKey: async (userId, name, gen) => { calls.push([userId, name, gen]); return 5; },
        listKeys: async () => [{ id: 5, name: 'Phone', hint: 'beef', created_at: CREATED, last_used_at: null }],
    };
    await withServer(deps, async (base) => {
        const res = await post(base, { name: '  Phone ' });
        assert.strictEqual(res.status, 201);
        assert.deepStrictEqual(await res.json(), {
            key: { id: 5, name: 'Phone', hint: 'beef', createdAt: CREATED.toISOString(), lastUsedAt: null },
            secret: 'scr_deadbeef',
        });
        assert.deepStrictEqual(calls, [[7, 'Phone', { secret: 'scr_deadbeef', hash: 'h', hint: 'beef' }]]);
    });
});

test('POST / answers 400 for a bad name and writes nothing', async () => {
    let inserted = false;
    const deps = { insertKey: async () => { inserted = true; } };
    await withServer(deps, async (base) => {
        for (const body of [{}, { name: '   ' }, { name: 5 }, { name: 'x'.repeat(61) }]) {
            const res = await post(base, body);
            assert.strictEqual(res.status, 400);
            assert.ok((await res.json()).error);
        }
        assert.strictEqual(inserted, false);
    });
});

test('GET / lists the caller keys with no secret or hash', async () => {
    const calls = [];
    const deps = {
        listKeys: async (id) => {
            calls.push(id);
            return [{ id: 2, name: 'A', hint: 'abcd', key_hash: 'h', created_at: CREATED, last_used_at: CREATED }];
        },
    };
    await withServer(deps, async (base) => {
        const res = await fetch(base);
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), {
            keys: [{ id: 2, name: 'A', hint: 'abcd', createdAt: CREATED.toISOString(), lastUsedAt: CREATED.toISOString() }],
        });
        assert.deepStrictEqual(calls, [7]);
    });
});

test('DELETE /:id answers 204, scoped to the caller', async () => {
    const calls = [];
    await withServer({ deleteKey: async (u, k) => { calls.push([u, k]); return true; } }, async (base) => {
        const res = await fetch(`${base}/9`, { method: 'DELETE' });
        assert.strictEqual(res.status, 204);
        assert.deepStrictEqual(calls, [[7, 9]]);
    });
});

test('DELETE /:id answers 404 when nothing matched and 400 for a malformed id', async () => {
    await withServer({ deleteKey: async () => false }, async (base) => {
        assert.strictEqual((await fetch(`${base}/9`, { method: 'DELETE' })).status, 404);
        assert.strictEqual((await fetch(`${base}/abc`, { method: 'DELETE' })).status, 400);
        assert.strictEqual((await fetch(`${base}/0`, { method: 'DELETE' })).status, 400);
    });
});

test('every handler answers 500 when a dep throws', async () => {
    const boom = async () => { throw new Error('db down'); };
    const deps = { listKeys: boom, insertKey: boom, deleteKey: boom };
    await withServer(deps, async (base) => {
        await quiet(async () => {
            assert.strictEqual((await fetch(base)).status, 500);
            assert.strictEqual((await post(base, { name: 'k' })).status, 500);
            assert.strictEqual((await fetch(`${base}/1`, { method: 'DELETE' })).status, 500);
        });
    });
});

test('POST / behind a body parser mounted first, as server.js does, still creates the key', async () => {
    const bodyParser = require('body-parser');
    const deps = {
        generateKey: () => ({ secret: 'scr_cafe', hash: 'h', hint: 'cafe' }),
        insertKey: async () => 3,
        listKeys: async () => [{ id: 3, name: 'Laptop', hint: 'cafe', created_at: CREATED, last_used_at: null }],
    };
    const app = express();
    app.use(bodyParser.json());
    app.use('/api/keys', (req, res, next) => { req.user = { id: 7 }; next(); }, createApiKeysRouter(deps));
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    try {
        const res = await post(`http://127.0.0.1:${server.address().port}/api/keys`, { name: 'Laptop' });
        assert.strictEqual(res.status, 201);
        const json = await res.json();
        assert.strictEqual(json.secret, 'scr_cafe');
        assert.strictEqual(json.key.id, 3);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});
