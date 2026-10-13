const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const db = require('../db/db');
const userRouter = require('./user');

const USER_ID = 7;
const NOW = new Date('2026-03-05T12:00:00Z');
const INSERT = /INSERT INTO reading_days/;

// Runs fn against a live app with db.execute mocked; `failReading` makes the
// reading_days insert reject. Returns the recorded execute calls via ctx.
async function withApp(failReading, fn) {
    const savedZone = process.env.READING_TIME_ZONE;
    process.env.READING_TIME_ZONE = 'UTC';
    const execute = test.mock.method(db, 'execute', async (sql) => {
        if (INSERT.test(sql)) {
            if (failReading) throw new Error('reading_days down');
            return [{ affectedRows: 1 }];
        }
        return [{ affectedRows: 1 }];
    });
    const errors = test.mock.method(console, 'error', () => {});
    test.mock.timers.enable({ apis: ['Date'], now: NOW });
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.user = { id: USER_ID }; next(); });
    app.use('/api/user', userRouter);
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    try {
        return await fn(`http://127.0.0.1:${server.address().port}`, { execute, errors });
    } finally {
        await new Promise((resolve) => server.close(resolve));
        test.mock.timers.reset();
        execute.mock.restore();
        errors.mock.restore();
        if (savedZone === undefined) delete process.env.READING_TIME_ZONE;
        else process.env.READING_TIME_ZONE = savedZone;
    }
}

const put = (base, body) => fetch(`${base}/api/user/location`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});
const inserts = (execute) => execute.mock.calls.filter((c) => INSERT.test(c.arguments[0]));

test('PUT location records the primary chapter on today\'s local date', async () => {
    await withApp(false, async (base, { execute }) => {
        const location = { primary: { bookId: 43, chapter: 3 }, compare: null, noteId: null };
        const res = await put(base, location);
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), { location });
        const calls = inserts(execute);
        assert.strictEqual(calls.length, 1);
        assert.deepStrictEqual(calls[0].arguments[1], [USER_ID, '2026-03-05', 43, 3]);
    });
});

test('PUT location with a null primary records nothing', async () => {
    await withApp(false, async (base, { execute }) => {
        const res = await put(base, { primary: null, compare: { bookId: 1, chapter: 1 }, noteId: null });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(inserts(execute).length, 0);
    });
});

test('PUT location still answers 200 and logs when the reading-day write fails', async () => {
    await withApp(true, async (base, { errors }) => {
        const location = { primary: { bookId: 43, chapter: 3 }, compare: null, noteId: null };
        const res = await put(base, location);
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), { location });
        assert.strictEqual(errors.mock.calls.length, 1);
    });
});

test('PUT location answers 400 for a bad body and writes nothing', async () => {
    await withApp(false, async (base, { execute }) => {
        const res = await put(base, { primary: { bookId: 0, chapter: 1 } });
        assert.strictEqual(res.status, 400);
        assert.strictEqual(execute.mock.calls.length, 0);
    });
});

test('PUT location answers 404 and records nothing when the user row is missing', async () => {
    await withApp(false, async (base, { execute }) => {
        execute.mock.mockImplementation(async () => [{ affectedRows: 0 }]);
        const res = await put(base, { primary: { bookId: 43, chapter: 3 } });
        assert.strictEqual(res.status, 404);
        assert.strictEqual(inserts(execute).length, 0);
    });
});
