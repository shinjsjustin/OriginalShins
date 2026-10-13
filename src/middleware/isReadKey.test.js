const test = require('node:test');
const assert = require('node:assert');
const isReadKey = require('./isReadKey');

const KEY = 'secret-key';

function run(authorization, env = {}) {
    process.env.BOURNE_API_KEY = KEY;
    process.env.BOURNE_USER_ID = '7';
    for (const [k, v] of Object.entries(env)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
    const req = { headers: authorization === undefined ? {} : { authorization } };
    const out = { status: null, body: null, nextCalled: false };
    const res = {
        status(code) { out.status = code; return this; },
        json(body) { out.body = body; return this; },
    };
    isReadKey(req, res, () => { out.nextCalled = true; });
    return { req, out };
}

test('missing Authorization header answers 401', () => {
    const { out } = run(undefined);
    assert.strictEqual(out.status, 401);
    assert.strictEqual(out.nextCalled, false);
});

test('Authorization without a token answers 401', () => {
    assert.strictEqual(run('Bearer').out.status, 401);
});

test('wrong key answers 403, including one of a different length', () => {
    for (const bad of ['Bearer nope', `Bearer ${KEY}x`, 'Bearer s']) {
        const { out } = run(bad);
        assert.strictEqual(out.status, 403);
        assert.strictEqual(out.nextCalled, false);
    }
});

test('right key sets req.user to the numeric user id and calls next', () => {
    const { req, out } = run(`Bearer ${KEY}`);
    assert.deepStrictEqual(req.user, { id: 7 });
    assert.strictEqual(out.nextCalled, true);
    assert.strictEqual(out.status, null);
});

test('unset or empty key answers 503 even when the header matches', () => {
    for (const v of [undefined, '']) {
        const { out } = run('Bearer ', { BOURNE_API_KEY: v });
        assert.strictEqual(out.status, 503);
        assert.ok(out.body.error);
        assert.strictEqual(out.nextCalled, false);
    }
    const { out } = run('Bearer ', { BOURNE_API_KEY: '' });
    assert.strictEqual(out.status, 503);
});

test('user id that is not a positive integer answers 503', () => {
    for (const v of [undefined, '', '0', '-1', '1.5', 'abc', '7x']) {
        const { out } = run(`Bearer ${KEY}`, { BOURNE_USER_ID: v });
        assert.strictEqual(out.status, 503, `id ${v}`);
        assert.strictEqual(out.nextCalled, false);
    }
});
