// Validation for the body PUT /api/user/location accepts.
//
// The saved location is written by a page that is describing itself — no user
// types these numbers — but it arrives over the same open endpoint everything
// else does, so it is checked like everything else. What is being proved here
// is only that the values fit the columns holding them: a book id and a chapter
// in the canon's range, and a note id MySQL's INT UNSIGNED can hold.
//
// What is deliberately NOT proved is that the chapter exists in that book.
// Doing so would mean a query against `books` on every save, to defend against
// a value that costs nothing when wrong: the page validates a position against
// the loaded canon as it reads it (see navigation.js#parsePosition), so a
// chapter past the end of a book reopens at the panel's default. A round trip
// to reject early buys a better error message for a client that cannot produce
// the mistake.
const { ok, fail, isPlainObject } = require('./textInput');
const {
    MAX_BOOK_ID,
    MAX_CHAPTER_NUMBER,
    MAX_ROW_ID,
    parsePositiveIntField,
} = require('./params');

// One `{ bookId, chapter }`, or null.
//
// null and absent both mean "this panel has no saved place" — a location is a
// snapshot, so an omitted field is the page saying that half of it is empty,
// not the page declining to mention it.
const parsePosition = (name, value) => {
    if (value === null || value === undefined) {
        return ok(null);
    }
    if (!isPlainObject(value)) {
        return fail(`${name} must be an object or null`);
    }

    const bookId = parsePositiveIntField(value.bookId, MAX_BOOK_ID);
    if (bookId === null) {
        return fail(`${name}.bookId must be a book id between 1 and ${MAX_BOOK_ID}`);
    }

    const chapter = parsePositiveIntField(value.chapter, MAX_CHAPTER_NUMBER);
    if (chapter === null) {
        return fail(`${name}.chapter must be a chapter number between 1 and ${MAX_CHAPTER_NUMBER}`);
    }

    return ok({ bookId, chapter });
};

// The open note, or null for "the editor is closed". Ownership is not checked:
// an id belonging to somebody else saves a pointer that resolves to nothing,
// because the page only ever finds a note in the caller's own lists. There is
// no read here to protect, so there is nothing a stranger's id could reveal.
const parseNoteId = (value) => {
    if (value === null || value === undefined) {
        return ok(null);
    }

    const noteId = parsePositiveIntField(value, MAX_ROW_ID);
    return noteId === null ? fail('noteId must be a positive integer or null') : ok(noteId);
};

// PUT /api/user/location — { primary, compare, noteId }
const parseLocation = (payload) => {
    if (!isPlainObject(payload)) {
        return fail('request body must be a JSON object');
    }

    const primary = parsePosition('primary', payload.primary);
    if (primary.error) return primary;

    const compare = parsePosition('compare', payload.compare);
    if (compare.error) return compare;

    const noteId = parseNoteId(payload.noteId);
    if (noteId.error) return noteId;

    return ok({
        primary: primary.value,
        compare: compare.value,
        noteId: noteId.value,
    });
};

module.exports = {
    parsePosition,
    parseNoteId,
    parseLocation,
};
