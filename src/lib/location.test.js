const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const db = require('../db/db');
const { findLocation, saveLocation, findCurrentPassage } = require('./location');

test.afterEach(() => mock.restoreAll());

test('saveLocation stamps last_location_saved_at and returns whether a row matched', async () => {
    const execute = mock.method(db, 'execute', async () => [{ affectedRows: 1 }]);

    const saved = await saveLocation(7, {
        primary: { bookId: 43, chapter: 3 }, compare: null, noteId: null,
    });

    assert.equal(saved, true);
    const [sql, params] = execute.mock.calls[0].arguments;
    assert.match(sql, /last_location_saved_at\s*=\s*CURRENT_TIMESTAMP/);
    assert.deepEqual(params, [43, 3, null, null, null, 7]);
});

test('findLocation keeps its shape and does not leak the saved-at stamp', async () => {
    mock.method(db, 'execute', async () => [[{
        last_primary_book_id: 43, last_primary_chapter: 3,
        last_compare_book_id: null, last_compare_chapter: null, last_note_id: 9,
    }]]);

    assert.deepEqual(await findLocation(7), {
        primary: { bookId: 43, chapter: 3 }, compare: null, noteId: 9,
    });
});

test('findCurrentPassage returns the primary with its book name and saved time', async () => {
    const savedAt = new Date('2024-03-09T10:00:00Z');
    const execute = mock.method(db, 'execute', async () => [[{
        book_id: 43, book_name: 'John', chapter: 3, saved_at: savedAt,
    }]]);

    assert.deepEqual(await findCurrentPassage(7), {
        bookId: 43, bookName: 'John', chapter: 3, savedAt,
    });
    assert.deepEqual(execute.mock.calls[0].arguments[1], [7]);
});

test('findCurrentPassage returns null when the user is missing', async () => {
    mock.method(db, 'execute', async () => [[]]);
    assert.equal(await findCurrentPassage(7), null);
});

test('findCurrentPassage returns null when no primary is saved', async () => {
    // INNER JOIN on books yields no row; guard also covers a row with null ids.
    mock.method(db, 'execute', async () => [[{
        book_id: null, book_name: null, chapter: null, saved_at: null,
    }]]);
    assert.equal(await findCurrentPassage(7), null);
});
