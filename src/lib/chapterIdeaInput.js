// Validation for the JSON body the chapter-ideas API accepts.
//
// This is the one link set in the app not addressed by a row id in the path,
// because what holds it is a book/chapter coordinate rather than a row. So the
// coordinate travels in the body beside the ids it applies to, and is checked
// against the same canon bounds src/lib/params.js holds for every other bookId
// and chapter here.
const { MAX_BOOK_ID, MAX_CHAPTER_NUMBER, parsePositiveIntField } = require('./params');
const { ok, fail, isPlainObject, parseIdList } = require('./textInput');

// PUT /api/chapter-ideas — { bookId, chapter, ideaIds: [...] }
//
// `ideaIds` is the chapter's complete imported set, exactly as `topicIds` is an
// idea's complete topic set. An empty array is valid and means "import nothing
// here" — it is how the last imported idea is removed, so it must never be
// mistaken for a missing field.
const parseChapterIdeas = (payload) => {
    if (!isPlainObject(payload)) {
        return fail('request body must be a JSON object');
    }

    // parsePositiveIntField rather than parsePositiveInt: this pair arrives out
    // of a JSON body, where a client may legitimately send numbers.
    const bookId = parsePositiveIntField(payload.bookId, MAX_BOOK_ID);
    const chapter = parsePositiveIntField(payload.chapter, MAX_CHAPTER_NUMBER);

    if (bookId === null || chapter === null) {
        return fail('bookId and chapter must be positive integers within the canon');
    }

    const ideaIds = parseIdList('ideaIds', payload.ideaIds);
    if (ideaIds.error) {
        return ideaIds;
    }

    return ok({ bookId, chapter, ideaIds: ideaIds.value });
};

module.exports = { parseChapterIdeas };
