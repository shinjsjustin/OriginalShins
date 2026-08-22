// Pure chapter-navigation helpers for the Analyze page.
//
// A "position" is `{ bookId, chapter }` — the smallest unit a scripture panel
// can be pointed at. Nothing here touches React, the DOM or the network, so the
// boundary-crossing rules are unit-testable on their own.

// Genesis 1 and Matthew 1 — where the two scripture panels open when the URL
// carries no position for them.
export const DEFAULT_PRIMARY = { bookId: 1, chapter: 1 };
export const DEFAULT_COMPARE = { bookId: 40, chapter: 1 };

// `l=40.5` / `r=45.5` — bookId and chapter joined by a dot.
const POSITION_PATTERN = /^(\d+)\.(\d+)$/;

const byCanonicalOrder = (a, b) => a.canonicalOrder - b.canonicalOrder;

// Books in canonical order. The API already sorts them, but stepping across
// book boundaries is only correct if this holds, so it is re-established here
// rather than assumed.
const inCanonicalOrder = (books) => [...books].sort(byCanonicalOrder);

export const findBook = (books, bookId) =>
    books.find(book => book.id === bookId) || null;

export const formatPosition = ({ bookId, chapter }) => `${bookId}.${chapter}`;

// Reads a `bookId.chapter` query param, validating it against the loaded canon.
// Anything absent, malformed, or out of range yields `fallback` — a URL is user
// input and a bad one must not blank the page.
//
// While `books` is still empty (the catalog request has not resolved) every
// value is unverifiable, so the fallback stands until it has.
export const parsePosition = (value, books, fallback) => {
    if (typeof value !== 'string') {
        return fallback;
    }

    const match = POSITION_PATTERN.exec(value);
    if (!match) {
        return fallback;
    }

    const bookId = Number(match[1]);
    const chapter = Number(match[2]);

    const book = findBook(books, bookId);
    if (!book) {
        return fallback;
    }

    if (chapter < 1 || chapter > book.chapterCount) {
        return fallback;
    }

    return { bookId, chapter };
};

// "Matthew 5" — the label shown in every panel footer. Empty while the catalog
// loads, since the book name is not known yet.
export const describePosition = (books, { bookId, chapter }) => {
    const book = findBook(books, bookId);
    return book ? `${book.name} ${chapter}` : '';
};

// "1:3–5", or "1:3" for a single verse — a reference stripped of its book.
// The selection tray lists several runs of one chapter under a single book
// name ("Romans 5:1–2, 5:8"), so the tail of a reference is needed on its own;
// describeReference is this with the book name in front of it.
export const describeChapterVerses = ({ chapter, startVerse, endVerse }) => {
    const verses = startVerse === endVerse ? `${startVerse}` : `${startVerse}–${endVerse}`;
    return `${chapter}:${verses}`;
};

// "Genesis 1:3–5", or "Genesis 1:3" when a reference covers a single verse.
// Used wherever a note's anchors are listed. Falls back to the book id rather
// than rendering nothing if the catalog has not loaded yet, so a reference is
// never shown as a blank row.
export const describeReference = (books, reference) => {
    const book = findBook(books, reference.bookId);
    const name = book ? book.name : `Book ${reference.bookId}`;
    return `${name} ${describeChapterVerses(reference)}`;
};

// Moves one chapter forward (`direction` 1) or back (`direction` -1), crossing
// into the neighbouring book in canonical order when it runs off either end of
// the current one. Clamps at Genesis 1 and the last chapter of Revelation.
//
// Returns a new position; the one passed in is never modified.
export const stepChapter = (books, position, direction) => {
    const ordered = inCanonicalOrder(books);
    const bookIndex = ordered.findIndex(book => book.id === position.bookId);
    if (bookIndex === -1) {
        return position;
    }

    const chapter = position.chapter + direction;
    const book = ordered[bookIndex];

    if (chapter >= 1 && chapter <= book.chapterCount) {
        return { bookId: book.id, chapter };
    }

    const neighbour = ordered[bookIndex + direction];
    if (!neighbour) {
        // Either end of the canon — stay put rather than wrapping around.
        return position;
    }

    return {
        bookId: neighbour.id,
        chapter: direction > 0 ? 1 : neighbour.chapterCount,
    };
};
