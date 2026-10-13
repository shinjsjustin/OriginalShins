const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const db = require('../db/db');
const { findNotesForBourne } = require('./bourneNotes');

test.afterEach(() => mock.restoreAll());

const CREATED = new Date('2026-01-01T00:00:00Z');
const UPDATED = new Date('2026-02-01T00:00:00Z');

// Routes each query by the table it reads, the way the real hydrators ask.
const mockDb = ({ idRows = [], calls = [] } = {}) => mock.method(db, 'execute', async (sql, params) => {
    calls.push({ sql, params });
    if (/FROM notes n\b[\s\S]*ORDER BY/.test(sql) && /SELECT n\.id\s+FROM/.test(sql)) return [idRows];
    if (/FROM notes WHERE id IN/.test(sql)) {
        return [[
            { id: 5, title: 'T5', body: 'B5', sort_order: 0, created_at: CREATED, updated_at: UPDATED },
            { id: 4, title: 'T4', body: 'B4', sort_order: 0, created_at: CREATED, updated_at: UPDATED },
        ].filter(r => params.includes(r.id))];
    }
    if (/FROM note_references/.test(sql) && /nr\.note_id IN/.test(sql)) {
        return [[{ id: 1, note_id: 5, book_id: 43, chapter: 3, start_verse: 16, end_verse: 17,
            start_index: 1, end_index: 2, sort_order: 0 }]];
    }
    if (/FROM note_ideas/.test(sql)) return [[{ note_id: 5, sort_order: 0, id: 9, title: 'Idea' }]];
    if (/FROM idea_topics/.test(sql)) return [[{ idea_id: 9, sort_order: 0, id: 2, name: 'Love', slug: 'love' }]];
    if (/FROM note_topics/.test(sql)) return [[{ note_id: 5, sort_order: 0, id: 3, name: 'Faith', slug: 'faith' }]];
    if (/FROM books/.test(sql)) return [[{ id: 43, name: 'John' }]];
    return [[]];
});

test('returns notes in id-query order with names, idea topics and direct topics', async () => {
    mockDb({ idRows: [{ id: 5 }, { id: 4 }] });

    const { notes, hasMore } = await findNotesForBourne(7, { limit: 10, offset: 0 });

    assert.equal(hasMore, false);
    assert.deepEqual(notes, [
        {
            id: 5, title: 'T5', body: 'B5', createdAt: CREATED, updatedAt: UPDATED,
            references: [{ bookId: 43, bookName: 'John', chapter: 3, startVerse: 16, endVerse: 17 }],
            ideas: [{ id: 9, title: 'Idea', topics: [{ id: 2, name: 'Love' }] }],
            topics: [{ id: 3, name: 'Faith' }],
        },
        {
            id: 4, title: 'T4', body: 'B4', createdAt: CREATED, updatedAt: UPDATED,
            references: [], ideas: [], topics: [],
        },
    ]);
});

test('fetches limit + 1 ids, sets hasMore and drops the extra row', async () => {
    const calls = [];
    mockDb({ idRows: [{ id: 5 }, { id: 4 }], calls });

    const { notes, hasMore } = await findNotesForBourne(7, { limit: 1, offset: 20 });

    assert.equal(hasMore, true);
    assert.deepEqual(notes.map(n => n.id), [5]);
    assert.match(calls[0].sql, /ORDER BY n\.updated_at DESC, n\.id DESC\s+LIMIT 2 OFFSET 20/);
});

test('filters by user, since instant, book and chapter', async () => {
    const calls = [];
    mockDb({ calls });
    const since = new Date('2026-01-15T00:00:00Z');

    await findNotesForBourne(7, { sinceInstant: since, bookId: 43, chapter: 3, limit: 5, offset: 0 });

    const { sql, params } = calls[0];
    assert.match(sql, /n\.user_id = \?/);
    assert.match(sql, /n\.updated_at >= \?/);
    assert.match(sql, /EXISTS \(SELECT 1 FROM note_references nr WHERE nr\.note_id = n\.id AND nr\.book_id = \? AND nr\.chapter = \?\)/);
    assert.deepEqual(params, [7, since, 43, 3]);
});

test('omits optional filters when absent and filters book without chapter', async () => {
    const calls = [];
    mockDb({ calls });

    await findNotesForBourne(7, { limit: 5, offset: 0 });
    assert.doesNotMatch(calls[0].sql, /updated_at >=|EXISTS/);
    assert.deepEqual(calls[0].params, [7]);

    await findNotesForBourne(7, { bookId: 43, limit: 5, offset: 0 });
    const second = calls[1];
    assert.match(second.sql, /nr\.book_id = \?/);
    assert.doesNotMatch(second.sql, /nr\.chapter/);
    assert.deepEqual(second.params, [7, 43]);
});

test('rejects non-integer limit or offset before querying', async () => {
    const execute = mockDb();

    for (const bad of [{ limit: '5; DROP', offset: 0 }, { limit: 5, offset: 1.5 }, { limit: 0, offset: 0 }, { limit: 5, offset: -1 }]) {
        await assert.rejects(findNotesForBourne(7, bad), /limit|offset/);
    }
    assert.equal(execute.mock.calls.length, 0);
});

test('every hydration query is scoped to the user', async () => {
    const calls = [];
    mockDb({ idRows: [{ id: 5 }], calls });

    await findNotesForBourne(7, { limit: 10, offset: 0 });

    for (const { sql, params } of calls.filter(c => !/FROM books/.test(c.sql))) {
        assert.ok(params.includes(7), sql);
    }
});
