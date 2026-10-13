const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHistoryQuery, parseNotesQuery } = require('./bourneInput');

const TODAY = '2024-03-31';

test('parseHistoryQuery defaults to the last 30 local days', () => {
    assert.deepEqual(parseHistoryQuery({}, TODAY), { value: { from: '2024-03-02', to: '2024-03-31' } });
});

test('parseHistoryQuery defaults from to 29 days before a given to', () => {
    assert.deepEqual(parseHistoryQuery({ to: '2024-03-10' }, TODAY), {
        value: { from: '2024-02-10', to: '2024-03-10' },
    });
});

test('parseHistoryQuery accepts explicit dates, a one-day span and a 366-day span', () => {
    assert.deepEqual(parseHistoryQuery({ from: '2024-03-05', to: '2024-03-05' }, TODAY).value, {
        from: '2024-03-05',
        to: '2024-03-05',
    });
    assert.deepEqual(parseHistoryQuery({ from: '2023-04-01', to: '2024-03-31' }, TODAY).value, {
        from: '2023-04-01',
        to: '2024-03-31',
    });
});

test('parseHistoryQuery rejects bad dates, repeats, reversed and over-long spans', () => {
    const bad = [
        { from: '2024-02-30' },
        { from: '2024-2-3' },
        { from: 'yesterday' },
        { to: '2024-13-01' },
        { to: '' },
        { from: ['2024-03-01', '2024-03-02'] },
        { to: ['2024-03-01', '2024-03-02'] },
        { from: '2024-04-01', to: '2024-03-01' },
        { from: '2023-03-31', to: '2024-03-31' },
        { from: '2020-01-01' },
    ];
    for (const query of bad) {
        assert.equal(typeof parseHistoryQuery(query, TODAY).error, 'string', JSON.stringify(query));
    }
});

test('parseNotesQuery applies defaults', () => {
    assert.deepEqual(parseNotesQuery({}), {
        value: { since: null, bookId: null, chapter: null, limit: 50, offset: 0 },
    });
});

test('parseNotesQuery returns every parsed field', () => {
    const query = { since: '2024-03-01', book: '19', chapter: '119', limit: '200', offset: '0' };
    assert.deepEqual(parseNotesQuery(query).value, {
        since: '2024-03-01',
        bookId: 19,
        chapter: 119,
        limit: 200,
        offset: 0,
    });
    assert.equal(parseNotesQuery({ offset: '40' }).value.offset, 40);
    assert.equal(parseNotesQuery({ limit: '1' }).value.limit, 1);
});

test('parseNotesQuery rejects out-of-range, malformed, orphaned and repeated params', () => {
    const bad = [
        { chapter: '3' },
        { book: '0' },
        { book: '67' },
        { book: 'x' },
        { book: '1', chapter: '0' },
        { book: '1', chapter: '151' },
        { limit: '0' },
        { limit: '201' },
        { limit: '-1' },
        { offset: '-1' },
        { offset: '1.5' },
        { offset: 'x' },
        { since: '2024-02-30' },
        { since: 'recent' },
        { since: ['2024-03-01', '2024-03-02'] },
        { book: ['1', '2'] },
        { limit: ['1', '2'] },
    ];
    for (const query of bad) {
        assert.equal(typeof parseNotesQuery(query).error, 'string', JSON.stringify(query));
    }
});
