const test = require('node:test');
const assert = require('node:assert/strict');

const {
    KINDS,
    parseCreateScroll,
    parseBlocks,
    parseBlock,
    parseBlockPatch,
    parseTitlePatch,
    parseAnswer,
} = require('./scrollInput');

const block = { kind: 'note', body: 'hello' };

test('KINDS lists the four block kinds', () => {
    assert.deepEqual(KINDS, ['note', 'question', 'reference', 'idea']);
});

test('parseCreateScroll applies passage defaults and trims the title', () => {
    const { value, error } = parseCreateScroll({
        title: '  Faith  ',
        passage: { bookId: 40, startChapter: 5 },
        blocks: [block],
    });
    assert.equal(error, undefined);
    assert.deepEqual(value, {
        title: 'Faith',
        passage: { bookId: 40, startChapter: 5, startVerse: 1, endChapter: 5, endVerse: null },
        blocks: [block],
    });
});

test('parseCreateScroll keeps an explicit passage range', () => {
    const { value } = parseCreateScroll({
        title: 'T',
        passage: { bookId: 19, startChapter: 23, startVerse: 2, endChapter: 25, endVerse: 4 },
        blocks: [block],
    });
    assert.deepEqual(value.passage, {
        bookId: 19, startChapter: 23, startVerse: 2, endChapter: 25, endVerse: 4,
    });
});

const createError = (overrides) =>
    parseCreateScroll({
        title: 'T',
        passage: { bookId: 1, startChapter: 2 },
        blocks: [block],
        ...overrides,
    }).error;

test('parseCreateScroll rejects bad bodies', () => {
    assert.match(parseCreateScroll(null).error, /body/);
    assert.match(createError({ title: undefined }), /title/);
    assert.match(createError({ title: '   ' }), /title is required/);
    assert.match(createError({ title: 'x'.repeat(201) }), /200/);
    assert.match(createError({ passage: undefined }), /passage/);
    assert.match(createError({ passage: { startChapter: 1 } }), /bookId/);
    assert.match(createError({ passage: { bookId: 67, startChapter: 1 } }), /bookId/);
    assert.match(createError({ blocks: [] }), /blocks/);
});

test('parseCreateScroll rejects a chapter over 150 and a verse over 176', () => {
    assert.match(createError({ passage: { bookId: 19, startChapter: 151 } }), /startChapter/);
    assert.match(
        createError({ passage: { bookId: 19, startChapter: 1, endChapter: 151 } }),
        /endChapter/
    );
    assert.match(
        createError({ passage: { bookId: 19, startChapter: 1, startVerse: 177 } }),
        /startVerse/
    );
    assert.match(
        createError({ passage: { bookId: 19, startChapter: 1, endVerse: 177 } }),
        /endVerse/
    );
});

test('parseCreateScroll rejects a reversed range', () => {
    assert.match(
        createError({ passage: { bookId: 1, startChapter: 3, endChapter: 2 } }),
        /before/
    );
    assert.match(
        createError({ passage: { bookId: 1, startChapter: 3, startVerse: 5, endVerse: 4 } }),
        /before/
    );
    assert.equal(
        createError({ passage: { bookId: 1, startChapter: 3, startVerse: 5, endVerse: 5 } }),
        undefined
    );
    // A later chapter may end on a lower verse number.
    assert.equal(
        createError({
            passage: { bookId: 1, startChapter: 3, startVerse: 5, endChapter: 4, endVerse: 2 },
        }),
        undefined
    );
});

test('parseCreateScroll surfaces block errors', () => {
    assert.match(createError({ blocks: [{ kind: 'note', body: '' }] }), /blocks\[0\]/);
});

test('parseBlocks requires 1 to 100 blocks', () => {
    assert.match(parseBlocks(undefined).error, /array/);
    assert.match(parseBlocks([]).error, /1 to 100/);
    assert.match(parseBlocks(Array(101).fill(block)).error, /1 to 100/);
    assert.equal(parseBlocks(Array(100).fill(block)).value.length, 100);
});

test('parseBlock checks kind and body', () => {
    assert.deepEqual(parseBlock({ kind: 'question', body: 'Why?' }).value, {
        kind: 'question',
        body: 'Why?',
    });
    assert.match(parseBlock({ kind: 'poem', body: 'x' }).error, /kind/);
    assert.match(parseBlock({ body: 'x' }).error, /kind/);
    assert.match(parseBlock({ kind: 'note' }).error, /body/);
    assert.match(parseBlock({ kind: 'note', body: '   ' }).error, /body is required/);
    assert.match(parseBlock({ kind: 'note', body: 'x'.repeat(20001) }).error, /20000/);
    assert.equal(parseBlock({ kind: 'note', body: 'x'.repeat(20000) }).error, undefined);
    assert.match(parseBlock('nope').error, /object/);
});

test('parseBlock accepts a reference only on a reference block', () => {
    const reference = { bookId: 43, chapter: 3, startVerse: 16, endVerse: 18 };
    assert.deepEqual(parseBlock({ kind: 'reference', body: 'See', reference }).value, {
        kind: 'reference',
        body: 'See',
        reference,
    });
    assert.match(parseBlock({ kind: 'note', body: 'See', reference }).error, /reference/);
});

test('parseBlock validates the reference', () => {
    const bad = (reference) => parseBlock({ kind: 'reference', body: 'x', reference }).error;
    assert.match(bad({ bookId: 43, chapter: 3, startVerse: 5, endVerse: 4 }), /before/);
    assert.match(bad({ bookId: 43, chapter: 151, startVerse: 1, endVerse: 1 }), /chapter/);
    assert.match(bad({ bookId: 43, chapter: 3, startVerse: 1, endVerse: 177 }), /endVerse/);
    assert.match(bad({ bookId: 0, chapter: 3, startVerse: 1, endVerse: 1 }), /bookId/);
    assert.match(bad({ bookId: 43, chapter: 3, startVerse: 1 }), /endVerse/);
    assert.match(bad('John 3'), /reference/);
});

test('parseBlockPatch accepts any partial field and rejects an empty patch', () => {
    assert.deepEqual(parseBlockPatch({ body: 'new' }).value, { body: 'new' });
    assert.deepEqual(parseBlockPatch({ kind: 'idea' }).value, { kind: 'idea' });
    const reference = { bookId: 1, chapter: 1, startVerse: 1, endVerse: 2 };
    assert.deepEqual(parseBlockPatch({ reference }).value, { reference });
    assert.match(parseBlockPatch({}).error, /at least one/);
    assert.match(parseBlockPatch({ kind: 'bad' }).error, /kind/);
    assert.match(parseBlockPatch({ body: '' }).error, /body/);
    assert.match(parseBlockPatch({ kind: 'note', reference }).error, /reference/);
});

test('parseTitlePatch trims and requires a title', () => {
    assert.deepEqual(parseTitlePatch({ title: ' New ' }).value, { title: 'New' });
    assert.match(parseTitlePatch({}).error, /title/);
    assert.match(parseTitlePatch({ title: '' }).error, /title is required/);
    assert.match(parseTitlePatch({ title: 'x'.repeat(201) }).error, /200/);
});

test('parseAnswer maps a blank answer to null', () => {
    assert.deepEqual(parseAnswer({ answer: 'Yes' }).value, { answer: 'Yes' });
    assert.deepEqual(parseAnswer({ answer: '  \n ' }).value, { answer: null });
    assert.deepEqual(parseAnswer({ answer: '' }).value, { answer: null });
    assert.match(parseAnswer({}).error, /answer/);
    assert.match(parseAnswer({ answer: 5 }).error, /string/);
    assert.match(parseAnswer({ answer: 'x'.repeat(20001) }).error, /20000/);
});
