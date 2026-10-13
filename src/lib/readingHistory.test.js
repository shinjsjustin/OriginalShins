const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const db = require('../db/db');
const { findReadingHistory, bucketNoteDays } = require('./readingHistory');

test.afterEach(() => mock.restoreAll());

const TZ = 'America/Los_Angeles';
const row = (noteId, created, updated, bookId, bookName, chapter) => ({
    note_id: noteId, created_at: new Date(created), updated_at: new Date(updated),
    book_id: bookId, book_name: bookName, chapter,
});

test('bucketNoteDays buckets created_at and updated_at by local date, not UTC', () => {
    // 2024-03-02T03:00Z is still 2024-03-01 in Los Angeles.
    const days = bucketNoteDays(
        [row(1, '2024-03-02T03:00:00Z', '2024-03-04T20:00:00Z', 43, 'John', 3)],
        { from: '2024-03-01', to: '2024-03-31', loggingBegan: null, timeZone: TZ },
    );
    assert.deepEqual(days, [
        { date: '2024-03-01', source: 'notes', chapters: [{ bookId: 43, bookName: 'John', chapter: 3 }] },
        { date: '2024-03-04', source: 'notes', chapters: [{ bookId: 43, bookName: 'John', chapter: 3 }] },
    ]);
});

test('bucketNoteDays drops dates outside the range and on or after loggingBegan', () => {
    const days = bucketNoteDays(
        [row(1, '2024-02-29T20:00:00Z', '2024-03-10T20:00:00Z', 1, 'Genesis', 1),
         row(2, '2024-03-05T20:00:00Z', '2024-03-05T20:00:00Z', 1, 'Genesis', 1),
         row(3, '2024-04-05T20:00:00Z', '2024-04-05T20:00:00Z', 1, 'Genesis', 1)],
        { from: '2024-03-01', to: '2024-03-31', loggingBegan: '2024-03-10', timeZone: TZ },
    );
    assert.deepEqual(days.map((d) => d.date), ['2024-03-05']);
});

test('bucketNoteDays dedupes and sorts chapters, and an unanchored note still marks its day', () => {
    const at = '2024-03-05T20:00:00Z';
    const days = bucketNoteDays(
        [row(1, at, at, 43, 'John', 3),
         row(1, at, at, 1, 'Genesis', 2),
         row(2, at, at, 43, 'John', 3),
         row(3, '2024-03-06T20:00:00Z', '2024-03-06T20:00:00Z', null, null, null)],
        { from: '2024-03-01', to: '2024-03-31', loggingBegan: null, timeZone: TZ },
    );
    assert.deepEqual(days, [
        { date: '2024-03-05', source: 'notes', chapters: [
            { bookId: 1, bookName: 'Genesis', chapter: 2 },
            { bookId: 43, bookName: 'John', chapter: 3 }] },
        { date: '2024-03-06', source: 'notes', chapters: [] },
    ]);
});

function mockDb({ began, logged = [], notes = [] }) {
    return mock.method(db, 'execute', async (sql) => {
        if (/MIN\(/.test(sql)) return [[{ began }]];
        if (/FROM reading_days/.test(sql)) return [logged];
        return [notes];
    });
}

test('findReadingHistory merges note days before the first logged day with log days', async () => {
    const execute = mockDb({
        began: '2024-03-10',
        logged: [{ read_on: '2024-03-10', book_id: 43, book_name: 'John', chapter: 3 },
                 { read_on: '2024-03-10', book_id: 43, book_name: 'John', chapter: 4 },
                 { read_on: '2024-03-12', book_id: 1, book_name: 'Genesis', chapter: 1 }],
        notes: [row(1, '2024-03-05T20:00:00Z', '2024-03-05T20:00:00Z', 19, 'Psalms', 23)],
    });

    const history = await findReadingHistory(7, { from: '2024-03-01', to: '2024-03-31', timeZone: TZ });

    assert.deepEqual(history, {
        from: '2024-03-01', to: '2024-03-31', loggingBegan: '2024-03-10',
        days: [
            { date: '2024-03-05', source: 'notes', chapters: [{ bookId: 19, bookName: 'Psalms', chapter: 23 }] },
            { date: '2024-03-10', source: 'log', chapters: [
                { bookId: 43, bookName: 'John', chapter: 3 }, { bookId: 43, bookName: 'John', chapter: 4 }] },
            { date: '2024-03-12', source: 'log', chapters: [{ bookId: 1, bookName: 'Genesis', chapter: 1 }] },
        ],
    });
    for (const [sql, params] of execute.mock.calls.map((c) => c.arguments)) {
        assert.match(sql, /user_id\s*=\s*\?/);
        assert.equal(params[0], 7);
    }
    const loggedSql = execute.mock.calls.map((c) => c.arguments[0]).find((s) => /read_on BETWEEN/.test(s));
    assert.match(loggedSql, /DATE_FORMAT\(rd\.read_on, '%Y-%m-%d'\)/);
});

test('findReadingHistory with no logging reads the notes window one day wider each side', async () => {
    const execute = mockDb({ began: null });

    const history = await findReadingHistory(7, { from: '2024-03-01', to: '2024-03-31', timeZone: TZ });

    assert.equal(history.loggingBegan, null);
    assert.deepEqual(history.days, []);
    const params = execute.mock.calls.map((c) => c.arguments).find(([sql]) => /FROM notes/.test(sql))[1];
    // LA is UTC-8 on Mar 1 (start) and UTC-7 on Mar 31 (end, after DST).
    assert.equal(params[0], 7);
    assert.equal(params[1].toISOString(), '2024-02-29T08:00:00.000Z');
    assert.equal(params[2].toISOString(), '2024-04-02T07:00:00.000Z');
});

test('findReadingHistory skips the notes query when logging began on or before from', async () => {
    const execute = mockDb({ began: '2024-02-01' });

    await findReadingHistory(7, { from: '2024-03-01', to: '2024-03-31', timeZone: TZ });

    assert.equal(execute.mock.calls.some((c) => /FROM notes/.test(c.arguments[0])), false);
});
