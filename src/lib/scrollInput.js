// Request-body validation for the scroll API: the body a scroll is created
// with, the blocks inside it, and the small patches the site and the AI send
// afterwards. Each parser returns { value } or { error }, like textInput.
const {
    MAX_BOOK_ID,
    MAX_CHAPTER_NUMBER,
    MAX_VERSE_NUMBER,
    parsePositiveIntField,
} = require('./params');
const { ok, fail, isPlainObject, parseTextField } = require('./textInput');

const KINDS = ['note', 'question', 'reference', 'idea'];
const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 20000;
const MIN_BLOCKS = 1;
const MAX_BLOCKS = 100;

const requireString = (name, value, maxLength) => {
    if (value === undefined) {
        return fail(`${name} is required`);
    }
    const parsed = parseTextField(name, value, { maxLength, trim: false });
    if (parsed.error) {
        return parsed;
    }
    return parsed.value.trim().length === 0 ? fail(`${name} is required`) : parsed;
};

const parseTitle = (value) => {
    if (value === undefined) {
        return fail('title is required');
    }
    const parsed = parseTextField('title', value, { maxLength: MAX_TITLE_LENGTH, trim: true });
    if (parsed.error) {
        return parsed;
    }
    return parsed.value.length === 0 ? fail('title is required') : parsed;
};

const parseInt = (name, value, max) => {
    const parsed = parsePositiveIntField(value, max);
    return parsed === null ? fail(`${name} must be an integer between 1 and ${max}`) : ok(parsed);
};

// Parses a set of named integer fields, stopping at the first bad one.
const parseInts = (prefix, source, specs) => {
    const out = {};
    for (const [name, max] of specs) {
        const parsed = parseInt(`${prefix}${name}`, source[name], max);
        if (parsed.error) {
            return parsed;
        }
        out[name] = parsed.value;
    }
    return ok(out);
};

const parsePassage = (passage) => {
    if (!isPlainObject(passage)) {
        return fail('passage must be an object');
    }

    const book = parseInts('passage.', passage, [['bookId', MAX_BOOK_ID]]);
    if (book.error) {
        return book;
    }
    const start = parseInts('passage.', passage, [['startChapter', MAX_CHAPTER_NUMBER]]);
    if (start.error) {
        return start;
    }

    const startVerse = passage.startVerse === undefined ? ok(1)
        : parseInt('passage.startVerse', passage.startVerse, MAX_VERSE_NUMBER);
    if (startVerse.error) {
        return startVerse;
    }
    const endChapter = passage.endChapter === undefined ? ok(start.value.startChapter)
        : parseInt('passage.endChapter', passage.endChapter, MAX_CHAPTER_NUMBER);
    if (endChapter.error) {
        return endChapter;
    }
    // Null is the explicit "to the end of the chapter".
    const endVerse = passage.endVerse === undefined || passage.endVerse === null ? ok(null)
        : parseInt('passage.endVerse', passage.endVerse, MAX_VERSE_NUMBER);
    if (endVerse.error) {
        return endVerse;
    }

    const endsBefore =
        endChapter.value < start.value.startChapter ||
        (endChapter.value === start.value.startChapter &&
            endVerse.value !== null &&
            endVerse.value < startVerse.value);
    if (endsBefore) {
        return fail('passage must not end before it starts');
    }

    return ok({
        bookId: book.value.bookId,
        startChapter: start.value.startChapter,
        startVerse: startVerse.value,
        endChapter: endChapter.value,
        endVerse: endVerse.value,
    });
};

const parseReference = (reference) => {
    if (!isPlainObject(reference)) {
        return fail('reference must be an object');
    }
    const parsed = parseInts('reference.', reference, [
        ['bookId', MAX_BOOK_ID],
        ['chapter', MAX_CHAPTER_NUMBER],
        ['startVerse', MAX_VERSE_NUMBER],
        ['endVerse', MAX_VERSE_NUMBER],
    ]);
    if (parsed.error) {
        return parsed;
    }
    if (parsed.value.endVerse < parsed.value.startVerse) {
        return fail('reference must not end before it starts');
    }
    return parsed;
};

const parseKind = (kind) =>
    KINDS.includes(kind) ? ok(kind) : fail(`kind must be one of ${KINDS.join(', ')}`);

const parseBody = (body) => requireString('body', body, MAX_BODY_LENGTH);

const parseBlock = (block) => {
    if (!isPlainObject(block)) {
        return fail('block must be an object');
    }
    const kind = parseKind(block.kind);
    if (kind.error) {
        return kind;
    }
    const body = parseBody(block.body);
    if (body.error) {
        return body;
    }

    const value = { kind: kind.value, body: body.value };
    if (block.reference === undefined) {
        return ok(value);
    }
    if (kind.value !== 'reference') {
        return fail('reference is only allowed on a reference block');
    }
    const reference = parseReference(block.reference);
    return reference.error ? reference : ok({ ...value, reference: reference.value });
};

const parseBlocks = (blocks) => {
    if (!Array.isArray(blocks)) {
        return fail('blocks must be an array');
    }
    if (blocks.length < MIN_BLOCKS || blocks.length > MAX_BLOCKS) {
        return fail(`blocks must contain ${MIN_BLOCKS} to ${MAX_BLOCKS} blocks`);
    }

    const parsedBlocks = [];
    for (const [index, block] of blocks.entries()) {
        const parsed = parseBlock(block);
        if (parsed.error) {
            return fail(`blocks[${index}]: ${parsed.error}`);
        }
        parsedBlocks.push(parsed.value);
    }
    return ok(parsedBlocks);
};

const parseCreateScroll = (body) => {
    if (!isPlainObject(body)) {
        return fail('body must be a JSON object');
    }
    const title = parseTitle(body.title);
    if (title.error) {
        return title;
    }
    const passage = parsePassage(body.passage);
    if (passage.error) {
        return passage;
    }
    const blocks = parseBlocks(body.blocks);
    if (blocks.error) {
        return blocks;
    }
    return ok({ title: title.value, passage: passage.value, blocks: blocks.value });
};

const parseBlockPatch = (body) => {
    if (!isPlainObject(body)) {
        return fail('body must be a JSON object');
    }

    const value = {};
    if (body.kind !== undefined) {
        const kind = parseKind(body.kind);
        if (kind.error) {
            return kind;
        }
        value.kind = kind.value;
    }
    if (body.body !== undefined) {
        const parsed = parseBody(body.body);
        if (parsed.error) {
            return parsed;
        }
        value.body = parsed.value;
    }
    if (body.reference !== undefined) {
        // The stored block's kind is unknown here, so a reference must arrive
        // with kind 'reference' to keep anchors on reference blocks only.
        if (value.kind !== 'reference') {
            return fail('reference is only allowed with kind reference');
        }
        const reference = parseReference(body.reference);
        if (reference.error) {
            return reference;
        }
        value.reference = reference.value;
    }

    return Object.keys(value).length === 0
        ? fail('send at least one of kind, body or reference')
        : ok(value);
};

const parseTitlePatch = (body) => {
    if (!isPlainObject(body)) {
        return fail('body must be a JSON object');
    }
    const title = parseTitle(body.title);
    return title.error ? title : ok({ title: title.value });
};

// A blank answer clears the answer rather than storing whitespace.
const parseAnswer = (body) => {
    if (!isPlainObject(body)) {
        return fail('body must be a JSON object');
    }
    if (body.answer === undefined) {
        return fail('answer is required');
    }
    const parsed = parseTextField('answer', body.answer, {
        maxLength: MAX_BODY_LENGTH,
        trim: true,
    });
    if (parsed.error) {
        return parsed;
    }
    return ok({ answer: parsed.value === '' ? null : parsed.value });
};

module.exports = {
    KINDS,
    parseCreateScroll,
    parseBlocks,
    parseBlock,
    parseBlockPatch,
    parseTitlePatch,
    parseAnswer,
};
