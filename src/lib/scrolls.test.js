const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db/db');
const {
    createScroll,
    findScrolls,
    findScroll,
    appendBlocks,
    updateBlock,
    deleteBlock,
    saveAnswer,
    updateTitle,
    deleteScroll,
} = require('./scrolls');

// A pooled connection that answers by SQL pattern and records every statement.
const fakeConnection = (handlers) => {
    const calls = [];
    const events = [];
    return {
        calls,
        events,
        execute: async (sql, params) => {
            calls.push({ sql, params });
            const handler = handlers.find(([pattern]) => pattern.test(sql));
            if (!handler) {
                throw new Error(`unexpected SQL: ${sql}`);
            }
            const result = handler[1];
            return typeof result === 'function' ? result(params) : result;
        },
        beginTransaction: async () => events.push('begin'),
        commit: async () => events.push('commit'),
        rollback: async () => events.push('rollback'),
        release: () => events.push('release'),
    };
};

const useConnection = (t, connection) =>
    t.mock.method(db, 'getConnection', async () => connection);

const summaryRow = {
    id: 5, title: 'Psalm 23', book_id: 19, book_name: 'Psalms',
    start_chapter: 23, start_verse: 1, end_chapter: 23, end_verse: 6,
    block_count: 3, question_count: 2, answered_count: 1,
    created_at: 'c', updated_at: 'u',
};

const passage = { bookId: 19, startChapter: 23, startVerse: 1, endChapter: 24, endVerse: null };
const blocks = [
    { kind: 'note', body: 'a' },
    { kind: 'reference', body: 'b', reference: { bookId: 1, chapter: 2, startVerse: 3, endVerse: 4 } },
];
const chapterRows = [[{ number: 23, verse_count: 6 }, { number: 24, verse_count: 10 }]];

test('createScroll inserts the scroll, a row per chapter and blocks at positions 1..n in one transaction', async (t) => {
    const conn = fakeConnection([
        [/FROM chapters/, chapterRows],
        [/INSERT INTO scrolls/, [{ insertId: 5 }]],
        [/INSERT INTO scroll_chapters/, [{}]],
        [/INSERT INTO scroll_blocks/, [{}]],
    ]);
    useConnection(t, conn);
    t.mock.method(db, 'execute', async (sql) =>
        /FROM scroll_blocks sb/.test(sql) ? [[]] : [[summaryRow]]);

    const result = await createScroll(3, { title: 'T', passage, blocks });

    assert.equal(result.scroll.id, 5);
    assert.deepEqual(conn.events, ['begin', 'commit', 'release']);
    const sqlOf = (re) => conn.calls.filter(c => re.test(c.sql));
    assert.deepEqual(sqlOf(/FROM chapters/)[0].params, [19, 23, 24]);
    // endVerse null resolves to the end chapter's verse_count (10)
    assert.deepEqual(sqlOf(/INSERT INTO scrolls/)[0].params, [3, 'T', 19, 23, 1, 24, 10]);
    assert.deepEqual(sqlOf(/INSERT INTO scroll_chapters/).map(c => c.params), [[5, 3, 19, 23], [5, 3, 19, 24]]);
    assert.deepEqual(sqlOf(/INSERT INTO scroll_blocks/).map(c => c.params), [
        [5, 1, 'note', 'a', null, null, null, null],
        [5, 2, 'reference', 'b', 1, 2, 3, 4],
    ]);
});

test('createScroll rolls back and returns the conflicting scroll on ER_DUP_ENTRY', async (t) => {
    const conn = fakeConnection([
        [/FROM chapters/, chapterRows],
        [/INSERT INTO scrolls/, [{ insertId: 5 }]],
        [/INSERT INTO scroll_chapters/, () => {
            throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
        }],
    ]);
    useConnection(t, conn);
    const exec = t.mock.method(db, 'execute', async () => [[{ id: 2, title: 'Old' }]]);

    const result = await createScroll(3, { title: 'T', passage, blocks });

    assert.deepEqual(result, { conflict: { id: 2, title: 'Old' } });
    assert.deepEqual(conn.events, ['begin', 'rollback', 'release']);
    const [sql, params] = exec.mock.calls[0].arguments;
    assert.match(sql, /scroll_chapters/);
    assert.deepEqual(params, [3, 3, 19, 23, 24]);
});

test('createScroll rethrows errors that are not duplicates', async (t) => {
    const conn = fakeConnection([
        [/FROM chapters/, chapterRows],
        [/INSERT INTO scrolls/, () => { throw new Error('boom'); }],
    ]);
    useConnection(t, conn);
    await assert.rejects(createScroll(3, { title: 'T', passage, blocks }), /boom/);
    assert.ok(conn.events.includes('rollback'));
});

test('createScroll returns an error without inserting when a chapter is missing', async (t) => {
    const conn = fakeConnection([[/FROM chapters/, [[{ number: 23, verse_count: 6 }]]]]);
    useConnection(t, conn);

    const result = await createScroll(3, { title: 'T', passage, blocks });

    assert.equal(typeof result.error, 'string');
    assert.equal(conn.calls.length, 1);
});

test('createScroll returns an error without inserting when a verse is past verse_count', async (t) => {
    const conn = fakeConnection([[/FROM chapters/, chapterRows]]);
    useConnection(t, conn);

    const pastEnd = await createScroll(3, { title: 'T', passage: { ...passage, endVerse: 11 }, blocks });
    const pastStart = await createScroll(3, { title: 'T', passage: { ...passage, startVerse: 7 }, blocks });

    assert.equal(typeof pastEnd.error, 'string');
    assert.equal(typeof pastStart.error, 'string');
    assert.ok(conn.calls.every(c => /FROM chapters/.test(c.sql)));
});

test('findScrolls lists newest first, binds user_id and filters by book and chapter through scroll_chapters', async (t) => {
    const exec = t.mock.method(db, 'execute', async () => [[summaryRow]]);

    const scrolls = await findScrolls(3, { bookId: 19, chapter: 23 });

    const [sql, params] = exec.mock.calls[0].arguments;
    assert.match(sql, /ORDER BY s\.created_at DESC, s\.id DESC/);
    assert.match(sql, /scroll_chapters/);
    assert.deepEqual(params, [3, 3, 19, 23]);
    assert.deepEqual(scrolls, [{
        id: 5, title: 'Psalm 23',
        passage: { bookId: 19, bookName: 'Psalms', startChapter: 23, startVerse: 1, endChapter: 23, endVerse: 6 },
        blockCount: 3, questionCount: 2, answeredCount: 1,
        createdAt: 'c', updatedAt: 'u',
    }]);
});

test('findScrolls without a filter binds only user_id; a book alone omits the chapter', async (t) => {
    const exec = t.mock.method(db, 'execute', async () => [[]]);

    await findScrolls(3, {});
    await findScrolls(3, { bookId: 19 });

    assert.deepEqual(exec.mock.calls[0].arguments[1], [3]);
    assert.deepEqual(exec.mock.calls[1].arguments[1], [3, 3, 19]);
});

test('findScroll returns the summary with blocks and answers, or null', async (t) => {
    const exec = t.mock.method(db, 'execute', async (sql) => {
        if (/FROM scroll_blocks sb/.test(sql)) {
            return [[
                { id: 1, position: 1, kind: 'question', body: 'q', ref_book_id: null, ref_chapter: null,
                  ref_start_verse: null, ref_end_verse: null, answer: 'a', answered_at: 'x', answer_updated_at: 'y' },
                { id: 2, position: 2, kind: 'reference', body: 'r', ref_book_id: 1, ref_chapter: 2,
                  ref_start_verse: 3, ref_end_verse: 4, answer: null, answered_at: null, answer_updated_at: null },
            ]];
        }
        return [[summaryRow]];
    });

    const scroll = await findScroll(3, 5);

    assert.deepEqual(scroll.blocks, [
        { id: 1, position: 1, kind: 'question', body: 'q', reference: null,
          answer: { text: 'a', answeredAt: 'x', updatedAt: 'y' } },
        { id: 2, position: 2, kind: 'reference', body: 'r',
          reference: { bookId: 1, chapter: 2, startVerse: 3, endVerse: 4 }, answer: null },
    ]);
    const blockCall = exec.mock.calls.find(c => /FROM scroll_blocks sb/.test(c.arguments[0]));
    assert.match(blockCall.arguments[0], /ORDER BY sb\.position/);
    assert.match(blockCall.arguments[0], /s\.user_id = \?/);
    assert.deepEqual(blockCall.arguments[1], [5, 3]);

    exec.mock.mockImplementation(async () => [[]]);
    assert.equal(await findScroll(3, 99), null);
});

test('appendBlocks continues after the max position, and returns null for a scroll that is not the caller\'s', async (t) => {
    const conn = fakeConnection([
        [/SELECT id FROM scrolls/, [[{ id: 5 }]]],
        [/MAX\(position\)/, [[{ max_position: 7 }]]],
        [/INSERT INTO scroll_blocks/, [{}]],
    ]);
    useConnection(t, conn);
    t.mock.method(db, 'execute', async (sql) => /FROM scroll_blocks sb/.test(sql) ? [[]] : [[summaryRow]]);

    const scroll = await appendBlocks(3, 5, [{ kind: 'idea', body: 'z' }, { kind: 'note', body: 'y' }]);

    assert.equal(scroll.id, 5);
    assert.deepEqual(conn.calls[0].params, [5, 3]);
    const inserts = conn.calls.filter(c => /INSERT INTO scroll_blocks/.test(c.sql));
    assert.deepEqual(inserts.map(c => c.params[1]), [8, 9]);

    const none = fakeConnection([[/SELECT id FROM scrolls/, [[]]]]);
    useConnection(t, none);
    assert.equal(await appendBlocks(3, 6, [{ kind: 'idea', body: 'z' }]), null);
    assert.equal(none.calls.length, 1);
});

test('updateBlock is guarded by answer IS NULL and reports missing, answered or true', async (t) => {
    const exec = t.mock.method(db, 'execute', async () => [{ affectedRows: 1 }]);

    assert.equal(await updateBlock(3, 8, { kind: 'reference', body: 'b', reference: { bookId: 1, chapter: 2, startVerse: 3, endVerse: 4 } }), true);
    const [sql, params] = exec.mock.calls[0].arguments;
    assert.match(sql, /UPDATE scroll_blocks sb\s+JOIN scrolls s/);
    assert.match(sql, /sb\.answer IS NULL/);
    assert.match(sql, /s\.user_id = \?/);
    assert.deepEqual(params, ['reference', 'b', 1, 2, 3, 4, 8, 3]);

    // a body-only patch leaves kind and reference alone
    await updateBlock(3, 8, { body: 'only' });
    assert.doesNotMatch(exec.mock.calls[1].arguments[0], /kind|ref_/);
    assert.deepEqual(exec.mock.calls[1].arguments[1], ['only', 8, 3]);

    // a non-reference kind clears the anchor
    await updateBlock(3, 8, { kind: 'note' });
    assert.deepEqual(exec.mock.calls[2].arguments[1], ['note', null, null, null, null, 8, 3]);

    let existing = [[{ id: 8 }]];
    exec.mock.mockImplementation(async (sql) =>
        /^\s*UPDATE/.test(sql) ? [{ affectedRows: 0 }] : existing);
    assert.equal(await updateBlock(3, 8, { body: 'x' }), 'answered');
    existing = [[]];
    assert.equal(await updateBlock(3, 8, { body: 'x' }), 'missing');
});

test('deleteBlock is guarded by answer IS NULL and reports missing, answered or true', async (t) => {
    const exec = t.mock.method(db, 'execute', async () => [{ affectedRows: 1 }]);

    assert.equal(await deleteBlock(3, 8), true);
    const [sql, params] = exec.mock.calls[0].arguments;
    assert.match(sql, /DELETE sb FROM scroll_blocks sb\s+JOIN scrolls s/);
    assert.match(sql, /sb\.answer IS NULL/);
    assert.deepEqual(params, [8, 3]);

    let existing = [[{ id: 8 }]];
    exec.mock.mockImplementation(async (sql) =>
        /^\s*DELETE/.test(sql) ? [{ affectedRows: 0 }] : existing);
    assert.equal(await deleteBlock(3, 8), 'answered');
    existing = [[]];
    assert.equal(await deleteBlock(3, 8), 'missing');
});

test('saveAnswer sets answered_at once and answer_updated_at each time, only on questions', async (t) => {
    const exec = t.mock.method(db, 'execute', async () => [{ affectedRows: 1 }]);

    assert.equal(await saveAnswer(3, 8, 'yes'), true);
    const [sql, params] = exec.mock.calls[0].arguments;
    assert.match(sql, /answered_at = IF\(sb\.answered_at IS NULL, CURRENT_TIMESTAMP, sb\.answered_at\)/);
    assert.match(sql, /answer_updated_at = CURRENT_TIMESTAMP/);
    assert.match(sql, /sb\.kind = 'question'/);
    assert.deepEqual(params, ['yes', 8, 3]);

    await saveAnswer(3, 8, null);
    const [clearSql, clearParams] = exec.mock.calls[1].arguments;
    assert.match(clearSql, /answer = NULL, sb\.answered_at = NULL, sb\.answer_updated_at = NULL/);
    assert.deepEqual(clearParams, [8, 3]);

    let existing = [[{ id: 8 }]];
    exec.mock.mockImplementation(async (sql) =>
        /^\s*UPDATE/.test(sql) ? [{ affectedRows: 0 }] : existing);
    assert.equal(await saveAnswer(3, 8, 'yes'), 'not-question');
    existing = [[]];
    assert.equal(await saveAnswer(3, 8, 'yes'), 'missing');
});

test('updateTitle and deleteScroll are scoped to the user and return whether a row matched', async (t) => {
    const exec = t.mock.method(db, 'execute', async () => [{ affectedRows: 1 }]);

    assert.equal(await updateTitle(3, 5, 'New'), true);
    assert.deepEqual(exec.mock.calls[0].arguments[1], ['New', 5, 3]);
    assert.equal(await deleteScroll(3, 5), true);
    assert.deepEqual(exec.mock.calls[1].arguments[1], [5, 3]);

    exec.mock.mockImplementation(async () => [{ affectedRows: 0 }]);
    assert.equal(await updateTitle(3, 5, 'New'), false);
    assert.equal(await deleteScroll(3, 5), false);
});
