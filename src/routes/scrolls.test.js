const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { createScrollsRouter } = require('./scrolls');
const { MISSING, NOT_QUESTION } = require('../lib/scrolls');

const SUMMARY = { id: 4, title: 'John 3' };
const QUESTION = { id: 9, kind: 'question', body: 'Why?', answer: null };
const SCROLL = { ...SUMMARY, blocks: [QUESTION, { id: 10, kind: 'text', body: 'x' }] };

async function withServer(deps, fn) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.user = { id: 7 }; next(); });
    app.use('/api/scrolls', createScrollsRouter(deps));
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    const origError = console.error;
    console.error = () => {};
    try {
        return await fn(`http://127.0.0.1:${server.address().port}/api/scrolls`);
    } finally {
        console.error = origError;
        await new Promise((resolve) => server.close(resolve));
    }
}

const put = (url, body) => fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

test('GET / answers the caller scrolls', async () => {
    const calls = [];
    const deps = { findScrolls: async (...a) => { calls.push(a); return [SUMMARY]; } };
    await withServer(deps, async (base) => {
        const res = await fetch(base);
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), { scrolls: [SUMMARY] });
        assert.deepStrictEqual(calls, [[7]]);
    });
});

test('GET /covering filters by book and chapter and answers the first scroll', async () => {
    const calls = [];
    const deps = { findScrolls: async (...a) => { calls.push(a); return [SUMMARY]; } };
    await withServer(deps, async (base) => {
        const res = await fetch(`${base}/covering?book=43&chapter=3`);
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), { scroll: SUMMARY });
        assert.deepStrictEqual(calls, [[7, { bookId: 43, chapter: 3 }]]);
    });
});

test('GET /covering answers scroll null when nothing covers the chapter', async () => {
    await withServer({ findScrolls: async () => [] }, async (base) => {
        const res = await fetch(`${base}/covering?book=43&chapter=3`);
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), { scroll: null });
    });
});

test('GET /covering answers 400 unless both params are valid', async () => {
    const deps = { findScrolls: async () => { throw new Error('should not read'); } };
    await withServer(deps, async (base) => {
        for (const q of ['', '?book=43', '?chapter=3', '?book=0&chapter=3', '?book=43&chapter=x', '?book=43&chapter=151']) {
            const res = await fetch(`${base}/covering${q}`);
            assert.strictEqual(res.status, 400, q);
        }
    });
});

test('GET /:id answers the scroll with blocks, 404 when missing, 400 when malformed', async () => {
    const deps = { findScroll: async (u, id) => (id === 4 ? SCROLL : null) };
    await withServer(deps, async (base) => {
        const ok = await fetch(`${base}/4`);
        assert.strictEqual(ok.status, 200);
        assert.deepStrictEqual(await ok.json(), { scroll: SCROLL });
        assert.strictEqual((await fetch(`${base}/5`)).status, 404);
        assert.strictEqual((await fetch(`${base}/abc`)).status, 400);
    });
});

test('PUT answer saves the parsed answer and answers 200 with the block', async () => {
    const saved = [];
    let answer = null;
    const deps = {
        findScroll: async () => ({ ...SCROLL, blocks: [{ ...QUESTION, answer }, SCROLL.blocks[1]] }),
        saveAnswer: async (...a) => { saved.push(a); answer = a[2]; return true; },
    };
    await withServer(deps, async (base) => {
        const res = await put(`${base}/4/blocks/9/answer`, { answer: '  Because  ' });
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), { block: { ...QUESTION, answer: 'Because' } });
        assert.deepStrictEqual(saved, [[7, 9, 'Because']]);
    });
});

test('PUT answer answers 400 for a body parseAnswer refuses', async () => {
    const deps = { findScroll: async () => SCROLL, saveAnswer: async () => true };
    await withServer(deps, async (base) => {
        assert.strictEqual((await put(`${base}/4/blocks/9/answer`, {})).status, 400);
        assert.strictEqual((await put(`${base}/x/blocks/9/answer`, { answer: 'a' })).status, 400);
        assert.strictEqual((await put(`${base}/4/blocks/x/answer`, { answer: 'a' })).status, 400);
    });
});

test('PUT answer answers 422 for a non-question block', async () => {
    const deps = { findScroll: async () => SCROLL, saveAnswer: async () => NOT_QUESTION };
    await withServer(deps, async (base) => {
        const res = await put(`${base}/4/blocks/10/answer`, { answer: 'a' });
        assert.strictEqual(res.status, 422);
        assert.deepStrictEqual(await res.json(), { error: 'Only questions take answers' });
    });
});

test('PUT answer answers 404 for a missing block or a block of another scroll', async () => {
    const deps = { findScroll: async () => SCROLL, saveAnswer: async () => MISSING };
    await withServer(deps, async (base) => {
        assert.strictEqual((await put(`${base}/4/blocks/99/answer`, { answer: 'a' })).status, 404);
    });
    await withServer({ findScroll: async () => null }, async (base) => {
        assert.strictEqual((await put(`${base}/4/blocks/9/answer`, { answer: 'a' })).status, 404);
    });
});

test('DELETE /:id answers 204, or 404 when not the caller', async () => {
    const calls = [];
    const deps = { deleteScroll: async (u, id) => { calls.push([u, id]); return id === 4; } };
    await withServer(deps, async (base) => {
        assert.strictEqual((await fetch(`${base}/4`, { method: 'DELETE' })).status, 204);
        assert.strictEqual((await fetch(`${base}/5`, { method: 'DELETE' })).status, 404);
        assert.strictEqual((await fetch(`${base}/abc`, { method: 'DELETE' })).status, 400);
        assert.deepStrictEqual(calls, [[7, 4], [7, 5]]);
    });
});

test('a lib throw answers 500', async () => {
    await withServer({ findScrolls: async () => { throw new Error('db'); } }, async (base) => {
        assert.strictEqual((await fetch(base)).status, 500);
    });
});

test('PUT answer with an empty string clears the answer to null, as the client sends it', async () => {
    const saved = [];
    const deps = {
        findScroll: async () => SCROLL,
        saveAnswer: async (...a) => { saved.push(a); return true; },
    };
    await withServer(deps, async (base) => {
        const res = await put(`${base}/4/blocks/9/answer`, { answer: '' });
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), { block: QUESTION });
        assert.deepStrictEqual(saved, [[7, 9, null]]);
    });
});

test('the covering URL the client sends works through the router mounted as server.js does', async () => {
    const bodyParser = require('body-parser');
    const app = express();
    app.use(bodyParser.json());
    app.use((req, res, next) => { req.user = { id: 7 }; next(); });
    app.use('/api/scrolls', createScrollsRouter({ findScrolls: async () => [SUMMARY] }));
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    try {
        // The path useCoveringScroll passes to fetchJson, under the /api base.
        const res = await fetch(`http://127.0.0.1:${server.address().port}/api/scrolls/covering?book=43&chapter=3`);
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), { scroll: SUMMARY });
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});
