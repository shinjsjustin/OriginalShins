const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { createAgentRouter } = require('./agent');

const USER_ID = 7;
const SCROLL = {
    id: 3,
    title: 'Grace',
    blocks: [
        { id: 11, kind: 'question', body: 'Why?', answer: null },
        { id: 12, kind: 'question', body: 'Who?', answer: { text: 'Him' } },
    ],
};
const PASSAGE = { bookId: 43, startChapter: 3 };
const CREATE_BODY = { title: 'Grace', passage: PASSAGE, blocks: [{ kind: 'note', body: 'Hi' }] };

const authAs = (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ error: 'Token is NULL' });
    req.user = { id: USER_ID };
    next();
};

// Runs fn with a live server, the agent router mounted at /api/agent.
async function withServer(deps, fn) {
    const app = express();
    app.use(express.json());
    app.use('/api/agent', createAgentRouter({ auth: authAs, ...deps }));
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    try {
        return await fn(`http://127.0.0.1:${server.address().port}/api/agent`);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

const send = (base, method, path, body) => fetch(`${base}${path}`, {
    method,
    headers: { Authorization: 'Bearer k', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
});

const quiet = async (fn) => {
    const orig = console.error;
    console.error = () => {};
    try { return await fn(); } finally { console.error = orig; }
};

test('GET /openapi.json answers 3.1 with bearer security and the request host, no key needed', async () => {
    await withServer({}, async (base) => {
        const res = await fetch(`${base}/openapi.json`);
        assert.strictEqual(res.status, 200);
        const doc = await res.json();
        assert.match(doc.openapi, /^3\.1/);
        assert.strictEqual(doc.servers[0].url, `${base}`);
        assert.strictEqual(doc.components.securitySchemes.bearerAuth.scheme, 'bearer');
        assert.deepStrictEqual(doc.security, [{ bearerAuth: [] }]);
        for (const name of ['Scroll', 'Block', 'Passage', 'Answer']) {
            assert.ok(doc.components.schemas[name], name);
        }
    });
});

test('document and router agree: every route is documented and every operation has a route', async () => {
    const router = createAgentRouter({ auth: authAs });
    const routes = new Set();
    for (const layer of router.stack) {
        if (!layer.route) continue;
        for (const method of Object.keys(layer.route.methods)) {
            routes.add(`${method} ${layer.route.path.replace(/:(\w+)/g, '{$1}')}`);
        }
    }
    await withServer({}, async (base) => {
        const doc = await (await fetch(`${base}/openapi.json`)).json();
        const documented = new Set();
        for (const [path, ops] of Object.entries(doc.paths)) {
            for (const [method, op] of Object.entries(ops)) {
                documented.add(`${method} ${path}`);
                assert.ok(op.operationId && op.description, `${method} ${path}`);
            }
        }
        const served = new Set([...routes].filter((r) => r !== 'get /openapi.json'));
        assert.deepStrictEqual([...served].sort(), [...documented].sort());
    });
});

test('every /scrolls route answers 401 without a key and never reaches the lib', async () => {
    const hit = () => { throw new Error('lib reached'); };
    const deps = { findScrolls: hit, findScroll: hit, createScroll: hit, appendBlocks: hit, updateBlock: hit, deleteBlock: hit, updateTitle: hit };
    await withServer(deps, async (base) => {
        const calls = [
            ['GET', '/scrolls'], ['GET', '/scrolls/3'], ['POST', '/scrolls'], ['PATCH', '/scrolls/3'],
            ['POST', '/scrolls/3/blocks'], ['PATCH', '/scrolls/3/blocks/11'], ['DELETE', '/scrolls/3/blocks/11'],
        ];
        for (const [method, path] of calls) {
            const res = await fetch(`${base}${path}`, { method });
            assert.strictEqual(res.status, 401, `${method} ${path}`);
        }
    });
});

test('there is no scroll delete for the AI', async () => {
    await withServer({}, async (base) => {
        const res = await send(base, 'DELETE', '/scrolls/3');
        assert.strictEqual(res.status, 404);
    });
});

test('GET /scrolls passes book and chapter with the auth user id', async () => {
    const calls = [];
    const findScrolls = async (...args) => { calls.push(args); return [{ id: 3 }]; };
    await withServer({ findScrolls }, async (base) => {
        const res = await send(base, 'GET', '/scrolls?book=43&chapter=3');
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), { scrolls: [{ id: 3 }] });
        await send(base, 'GET', '/scrolls');
        assert.deepStrictEqual(calls, [
            [USER_ID, { bookId: 43, chapter: 3 }],
            [USER_ID, {}],
        ]);
    });
});

test('GET /scrolls answers 400 for chapter without book, or a bad book or chapter', async () => {
    await withServer({ findScrolls: async () => [] }, async (base) => {
        for (const q of ['chapter=3', 'book=67', 'book=abc', 'book=43&chapter=0']) {
            const res = await send(base, 'GET', `/scrolls?${q}`);
            assert.strictEqual(res.status, 400, q);
            assert.ok((await res.json()).error);
        }
    });
});

test('GET /scrolls/:id answers the scroll, 404 when missing, 400 for a bad id', async () => {
    const calls = [];
    const findScroll = async (...args) => { calls.push(args); return args[1] === 3 ? SCROLL : null; };
    await withServer({ findScroll }, async (base) => {
        const ok = await send(base, 'GET', '/scrolls/3');
        assert.strictEqual(ok.status, 200);
        assert.deepStrictEqual(await ok.json(), { scroll: SCROLL });
        assert.deepStrictEqual(calls[0], [USER_ID, 3]);
        assert.strictEqual((await send(base, 'GET', '/scrolls/4')).status, 404);
        assert.strictEqual((await send(base, 'GET', '/scrolls/abc')).status, 400);
    });
});

test('POST /scrolls answers 201 { scroll } and hands the parsed input to the lib', async () => {
    const calls = [];
    const createScroll = async (...args) => { calls.push(args); return { scroll: SCROLL }; };
    await withServer({ createScroll }, async (base) => {
        const res = await send(base, 'POST', '/scrolls', CREATE_BODY);
        assert.strictEqual(res.status, 201);
        assert.deepStrictEqual(await res.json(), { scroll: SCROLL });
        assert.strictEqual(calls[0][0], USER_ID);
        assert.deepStrictEqual(calls[0][1], {
            title: 'Grace',
            passage: { bookId: 43, startChapter: 3, startVerse: 1, endChapter: 3, endVerse: null },
            blocks: [{ kind: 'note', body: 'Hi' }],
        });
    });
});

test('POST /scrolls answers 400 for bad input and for a passage the canon lacks', async () => {
    let called = false;
    const createScroll = async () => { called = true; return { error: 'chapter 3 has only 2 verses' }; };
    await withServer({ createScroll }, async (base) => {
        const bad = await send(base, 'POST', '/scrolls', { ...CREATE_BODY, title: '' });
        assert.strictEqual(bad.status, 400);
        assert.strictEqual(called, false);
        const canon = await send(base, 'POST', '/scrolls', CREATE_BODY);
        assert.strictEqual(canon.status, 400);
        assert.deepStrictEqual(await canon.json(), { error: 'chapter 3 has only 2 verses' });
    });
});

test('POST /scrolls answers 409 naming the clashing scroll', async () => {
    const conflict = { id: 9, title: 'Old' };
    await withServer({ createScroll: async () => ({ conflict }) }, async (base) => {
        const res = await send(base, 'POST', '/scrolls', CREATE_BODY);
        assert.strictEqual(res.status, 409);
        assert.deepStrictEqual(await res.json(), { error: 'Chapter already has a scroll: Old', conflict });
    });
});

test('POST /scrolls answers 500 when the lib throws', async () => {
    await quiet(() => withServer({ createScroll: async () => { throw new Error('db'); } }, async (base) => {
        const res = await send(base, 'POST', '/scrolls', CREATE_BODY);
        assert.strictEqual(res.status, 500);
        assert.ok((await res.json()).error);
    }));
});

test('PATCH /scrolls/:id renames, 404 when missing, 400 for a blank title', async () => {
    const calls = [];
    const updateTitle = async (...args) => { calls.push(args); return args[1] === 3; };
    await withServer({ updateTitle, findScroll: async () => SCROLL }, async (base) => {
        const res = await send(base, 'PATCH', '/scrolls/3', { title: ' New ' });
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), { scroll: SCROLL });
        assert.deepStrictEqual(calls[0], [USER_ID, 3, 'New']);
        assert.strictEqual((await send(base, 'PATCH', '/scrolls/4', { title: 'x' })).status, 404);
        assert.strictEqual((await send(base, 'PATCH', '/scrolls/3', { title: ' ' })).status, 400);
    });
});

test('POST /scrolls/:id/blocks appends and answers 201, 404 for a missing scroll, 400 for bad blocks', async () => {
    const calls = [];
    const appendBlocks = async (...args) => { calls.push(args); return args[1] === 3 ? SCROLL : null; };
    await withServer({ appendBlocks }, async (base) => {
        const blocks = [{ kind: 'question', body: 'Why?' }];
        const res = await send(base, 'POST', '/scrolls/3/blocks', { blocks });
        assert.strictEqual(res.status, 201);
        assert.deepStrictEqual(await res.json(), { scroll: SCROLL });
        assert.deepStrictEqual(calls[0], [USER_ID, 3, blocks]);
        assert.strictEqual((await send(base, 'POST', '/scrolls/4/blocks', { blocks })).status, 404);
        assert.strictEqual((await send(base, 'POST', '/scrolls/3/blocks', { blocks: [] })).status, 400);
    });
});

test('PATCH block updates it and answers the scroll', async () => {
    const calls = [];
    const updateBlock = async (...args) => { calls.push(args); return true; };
    await withServer({ updateBlock, findScroll: async () => SCROLL }, async (base) => {
        const res = await send(base, 'PATCH', '/scrolls/3/blocks/11', { body: 'Why not?' });
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), { scroll: SCROLL });
        assert.deepStrictEqual(calls, [[USER_ID, 11, { body: 'Why not?' }]]);
        assert.strictEqual((await send(base, 'PATCH', '/scrolls/3/blocks/11', {})).status, 400);
    });
});

test('PATCH and DELETE of an answered block answer 409', async () => {
    const { ANSWERED } = require('../lib/scrolls');
    const deps = { updateBlock: async () => ANSWERED, deleteBlock: async () => ANSWERED, findScroll: async () => SCROLL };
    await withServer(deps, async (base) => {
        const patch = await send(base, 'PATCH', '/scrolls/3/blocks/12', { body: 'x' });
        assert.strictEqual(patch.status, 409);
        assert.deepStrictEqual(await patch.json(), { error: 'Question already answered' });
        const del = await send(base, 'DELETE', '/scrolls/3/blocks/12');
        assert.strictEqual(del.status, 409);
        assert.deepStrictEqual(await del.json(), { error: 'Question already answered' });
    });
});

test('PATCH block: a reference without kind reference is 400, a non-reference block is 422', async () => {
    const { NOT_REFERENCE } = require('../lib/scrolls');
    const reference = { bookId: 43, chapter: 3, startVerse: 16, endVerse: 17 };
    const writes = [];
    const deps = { updateBlock: async (...a) => { writes.push(a); return NOT_REFERENCE; }, findScroll: async () => SCROLL };
    await withServer(deps, async (base) => {
        assert.strictEqual((await send(base, 'PATCH', '/scrolls/3/blocks/11', { reference })).status, 400);
        assert.strictEqual((await send(base, 'PATCH', '/scrolls/3/blocks/11', { kind: 'note', reference })).status, 400);
        assert.deepStrictEqual(writes, []);
        const res = await send(base, 'PATCH', '/scrolls/3/blocks/11', { body: 'x' });
        assert.strictEqual(res.status, 422);
        assert.deepStrictEqual(await res.json(), { error: 'Only reference blocks take a reference' });
    });
});

test('block routes answer 404 for a missing scroll, a block of another scroll, or a missing block', async () => {
    const { MISSING } = require('../lib/scrolls');
    const writes = [];
    const deps = {
        findScroll: async (userId, id) => (id === 3 ? SCROLL : null),
        updateBlock: async (...a) => { writes.push(a); return MISSING; },
        deleteBlock: async (...a) => { writes.push(a); return MISSING; },
    };
    await withServer(deps, async (base) => {
        for (const method of ['PATCH', 'DELETE']) {
            const body = method === 'PATCH' ? { body: 'x' } : undefined;
            assert.strictEqual((await send(base, method, '/scrolls/4/blocks/11', body)).status, 404, 'scroll');
            assert.strictEqual((await send(base, method, '/scrolls/3/blocks/99', body)).status, 404, 'foreign block');
        }
        assert.deepStrictEqual(writes, []);
        const raced = await send(base, 'DELETE', '/scrolls/3/blocks/11');
        assert.strictEqual(raced.status, 404);
    });
});

test('DELETE block answers 204 with the auth user id', async () => {
    const calls = [];
    const deleteBlock = async (...a) => { calls.push(a); return true; };
    await withServer({ deleteBlock, findScroll: async () => SCROLL }, async (base) => {
        const res = await send(base, 'DELETE', '/scrolls/3/blocks/11');
        assert.strictEqual(res.status, 204);
        assert.deepStrictEqual(calls, [[USER_ID, 11]]);
    });
});
