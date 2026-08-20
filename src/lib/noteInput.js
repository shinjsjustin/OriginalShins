// Validation for the JSON bodies the notes API accepts.
//
// The primitives — the result shape, the text-field rules, the id-list rules —
// live in ./textInput and are shared with the ideas and topics APIs. What is
// specific to a note is here: the verse range it may be created with, and the
// partial-update rule.
const {
    MAX_BOOK_ID,
    MAX_CHAPTER_NUMBER,
    MAX_VERSE_NUMBER,
    parsePositiveIntField,
} = require('./params');
const {
    ok,
    fail,
    isPlainObject,
    parseTextField,
    parseIdList,
    parseNullableId,
    parsePosition,
} = require('./textInput');

// VARCHAR(255) and TEXT respectively. Enforced here so an over-long body fails
// with a message instead of a truncation or a driver error.
const MAX_TITLE_LENGTH = 255;
const MAX_BODY_LENGTH = 65535;

const DEFAULT_TITLE = 'Untitled note';

// A title is optional everywhere: the "New note" button creates a note before
// the user has typed anything, and an empty string is a legitimate thing to
// save afterwards. Absent means "use the default"; present-but-empty is kept.
const parseTitle = (value, fallback) =>
    parseTextField('title', value, { fallback, maxLength: MAX_TITLE_LENGTH, trim: true });

const parseBody = (value, fallback) =>
    parseTextField('body', value, { fallback, maxLength: MAX_BODY_LENGTH });

// A verse range as the client may state it. The integer index bounds are NOT
// part of this shape — they are computed from the verses table (see
// src/lib/references.js) and a client-supplied start_index is ignored outright.
//
// A backwards range (the user dragged a selection upwards) is normalized rather
// than rejected: the two endpoints are unordered by nature, so there is nothing
// ambiguous to report.
const parseReference = (value) => {
    if (!isPlainObject(value)) {
        return fail('reference must be an object');
    }

    const bookId = parsePositiveIntField(value.bookId, MAX_BOOK_ID);
    const chapter = parsePositiveIntField(value.chapter, MAX_CHAPTER_NUMBER);
    const startVerse = parsePositiveIntField(value.startVerse, MAX_VERSE_NUMBER);
    const endVerse = parsePositiveIntField(value.endVerse, MAX_VERSE_NUMBER);

    if (bookId === null || chapter === null || startVerse === null || endVerse === null) {
        return fail('reference needs bookId, chapter, startVerse and endVerse as positive integers within the canon');
    }

    return ok({
        bookId,
        chapter,
        startVerse: Math.min(startVerse, endVerse),
        endVerse: Math.max(startVerse, endVerse),
    });
};

// POST /api/notes — { title?, body?, reference? }. Both creation paths go
// through here: standalone notes simply omit `reference`.
const parseCreateNote = (payload) => {
    if (!isPlainObject(payload)) {
        return fail('request body must be a JSON object');
    }

    const title = parseTitle(payload.title, DEFAULT_TITLE);
    if (title.error) return title;

    const body = parseBody(payload.body, '');
    if (body.error) return body;

    if (payload.reference === undefined || payload.reference === null) {
        return ok({ title: title.value, body: body.value, reference: null });
    }

    const reference = parseReference(payload.reference);
    if (reference.error) return reference;

    return ok({ title: title.value, body: body.value, reference: reference.value });
};

// PATCH /api/notes/:id — a partial update. Only the fields actually present are
// written, and a patch that names no known field is an error rather than a
// silent no-op.
const parseUpdateNote = (payload) => {
    if (!isPlainObject(payload)) {
        return fail('request body must be a JSON object');
    }

    const changes = {};

    if (payload.title !== undefined) {
        const title = parseTitle(payload.title, '');
        if (title.error) return title;
        changes.title = title.value;
    }

    if (payload.body !== undefined) {
        const body = parseBody(payload.body, '');
        if (body.error) return body;
        changes.body = body.value;
    }

    if (Object.keys(changes).length === 0) {
        return fail('request body must contain at least one of: title, body');
    }

    return ok(changes);
};

// PUT /api/notes/:id/ideas — { ideaIds: [...] }, the complete link set. An
// empty array unlinks the note from every idea, which is a legal state.
const parseNoteIdeas = (payload) => {
    if (!isPlainObject(payload)) {
        return fail('request body must be a JSON object');
    }
    return parseIdList('ideaIds', payload.ideaIds);
};

// PUT /api/notes/:id/idea — { fromIdeaId, toIdeaId, position? }
//
// The note tier's half of the drag-between-parents move, shaped exactly like
// PUT /api/ideas/:id/topic one tier up. `toIdeaId: null` drops the note into
// the unfiled bucket; `fromIdeaId: null` is a note being filed out of it.
const parseNoteMove = (payload) => {
    if (!isPlainObject(payload)) {
        return fail('request body must be a JSON object');
    }

    const fromIdeaId = parseNullableId('fromIdeaId', payload.fromIdeaId);
    if (fromIdeaId.error) return fromIdeaId;

    const toIdeaId = parseNullableId('toIdeaId', payload.toIdeaId);
    if (toIdeaId.error) return toIdeaId;

    const position = parsePosition('position', payload.position);
    if (position.error) return position;

    return ok({
        fromContainerId: fromIdeaId.value,
        toContainerId: toIdeaId.value,
        position: position.value,
    });
};

module.exports = {
    DEFAULT_TITLE,
    MAX_TITLE_LENGTH,
    MAX_BODY_LENGTH,
    parseReference,
    parseCreateNote,
    parseUpdateNote,
    parseNoteIdeas,
    parseNoteMove,
};
