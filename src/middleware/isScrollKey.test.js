const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const isAuth = require('../middleware/isAuth');
const { createIsScrollKey } = require('./isScrollKey');

const SECRET = 'scr_abc123';

async function withServer(middleware, fn) {
    const saved = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'jwt-test-secret';
    const app = express();
    app.get('/ping', middleware, (req, res) => res.status(200).json({ user: req.user }));
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    try {
        return await fn(`http://127.0.0.1:${server.address().port}`);
    } finally {
        await new Promise((resolve) => server.close(resolve));
        if (saved === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = saved;
    }
}

const bearer = (token) => ({ headers: { Authorization: `Bearer ${token}` } });
const quiet = async (fn) => {
    const orig = console.error;
    console.error = () => {};
    try { return await fn(); } finally { console.error = orig; }
};

test('answers 401 with no token', async () => {
    const mw = createIsScrollKey(async () => ({ userId: 7, keyId: 1 }), async () => {});
    await withServer(mw, async (base) => {
        assert.strictEqual((await fetch(`${base}/ping`)).status, 401);
    });
});

test('answers 403 for an unknown key and does not touch', async () => {
    const touched = [];
    const mw = createIsScrollKey(async () => null, async (id) => { touched.push(id); });
    await withServer(mw, async (base) => {
        assert.strictEqual((await fetch(`${base}/ping`, bearer(SECRET))).status, 403);
        assert.deepStrictEqual(touched, []);
    });
});

test('answers 500 when the lookup throws', async () => {
    const mw = createIsScrollKey(async () => { throw new Error('db down'); }, async () => {});
    await withServer(mw, async (base) => {
        await quiet(async () => {
            assert.strictEqual((await fetch(`${base}/ping`, bearer(SECRET))).status, 500);
        });
    });
});

test('sets req.user, touches the key and calls next for a known key', async () => {
    const looked = [];
    const touched = [];
    const mw = createIsScrollKey(
        async (secret) => { looked.push(secret); return { userId: 7, keyId: 3 }; },
        async (id) => { touched.push(id); }
    );
    await withServer(mw, async (base) => {
        const res = await fetch(`${base}/ping`, bearer(SECRET));
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), { user: { id: 7 } });
        assert.deepStrictEqual(looked, [SECRET]);
        assert.deepStrictEqual(touched, [3]);
    });
});

test('a failing touch is logged and does not fail the request', async () => {
    const mw = createIsScrollKey(async () => ({ userId: 7, keyId: 3 }), async () => { throw new Error('nope'); });
    await withServer(mw, async (base) => {
        await quiet(async () => {
            assert.strictEqual((await fetch(`${base}/ping`, bearer(SECRET))).status, 200);
        });
    });
});

test('isAuth answers 403 to a scroll key, so a key cannot reach JWT routes', async () => {
    await withServer(isAuth, async (base) => {
        assert.strictEqual((await fetch(`${base}/ping`, bearer(SECRET))).status, 403);
    });
});
