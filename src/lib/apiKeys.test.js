const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const db = require('../db/db');
const {
    generateKey,
    hashKey,
    insertKey,
    listKeys,
    deleteKey,
    findKeyOwner,
    touchKey,
} = require('./apiKeys');

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

const stubExecute = (t, result) =>
    t.mock.method(db, 'execute', async () => result);

test('generateKey returns a scr_ secret of 64 hex chars, its SHA-256 hash and a 4-char hint', () => {
    const { secret, hash, hint } = generateKey();
    assert.match(secret, /^scr_[0-9a-f]{64}$/);
    assert.equal(hash, sha256(secret));
    assert.equal(hint, secret.slice(-4));
    assert.notEqual(generateKey().secret, secret);
});

test('hashKey is the SHA-256 hex of the whole secret', () => {
    assert.equal(hashKey('scr_abc'), sha256('scr_abc'));
});

test('insertKey sends only hash and hint to the database and returns the new id', async (t) => {
    const exec = stubExecute(t, [{ insertId: 9 }]);
    const { secret, hash, hint } = generateKey();

    const id = await insertKey(3, 'laptop', { hash, hint });

    assert.equal(id, 9);
    const [sql, params] = exec.mock.calls[0].arguments;
    assert.match(sql, /INSERT INTO api_keys/);
    assert.deepEqual(params, [3, 'laptop', hash, hint]);
    assert.ok(!params.includes(secret));
});

test('listKeys is scoped to the user, newest first, and never selects key_hash', async (t) => {
    const rows = [{ id: 2, name: 'b', hint: 'abcd' }];
    const exec = stubExecute(t, [rows]);

    assert.deepEqual(await listKeys(3), rows);

    const [sql, params] = exec.mock.calls[0].arguments;
    assert.doesNotMatch(sql, /key_hash/);
    assert.match(sql, /WHERE user_id = \?/);
    assert.match(sql, /ORDER BY created_at DESC, id DESC/);
    assert.deepEqual(params, [3]);
});

test('deleteKey is scoped to the user and reports whether a row went', async (t) => {
    const exec = stubExecute(t, [{ affectedRows: 1 }]);
    assert.equal(await deleteKey(3, 7), true);
    const [sql, params] = exec.mock.calls[0].arguments;
    assert.match(sql, /DELETE FROM api_keys WHERE id = \? AND user_id = \?/);
    assert.deepEqual(params, [7, 3]);

    t.mock.restoreAll();
    stubExecute(t, [{ affectedRows: 0 }]);
    assert.equal(await deleteKey(3, 8), false);
});

test('findKeyOwner looks up the hash of the secret and returns { userId, keyId }', async (t) => {
    const exec = stubExecute(t, [[{ id: 7, user_id: 3 }]]);

    assert.deepEqual(await findKeyOwner('scr_secret'), { userId: 3, keyId: 7 });

    const [sql, params] = exec.mock.calls[0].arguments;
    assert.match(sql, /WHERE key_hash = \?/);
    assert.deepEqual(params, [sha256('scr_secret')]);
});

test('findKeyOwner returns null for an unknown secret', async (t) => {
    stubExecute(t, [[]]);
    assert.equal(await findKeyOwner('scr_nope'), null);
});

test('touchKey stamps last_used_at on that key', async (t) => {
    const exec = stubExecute(t, [{ affectedRows: 1 }]);
    await touchKey(7);
    const [sql, params] = exec.mock.calls[0].arguments;
    assert.match(sql, /UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = \?/);
    assert.deepEqual(params, [7]);
});
