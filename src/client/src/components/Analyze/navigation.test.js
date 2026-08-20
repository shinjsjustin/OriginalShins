import {
    DEFAULT_PRIMARY,
    DEFAULT_COMPARE,
    findBook,
    formatPosition,
    parsePosition,
    describePosition,
    stepChapter,
} from './navigation';

// A miniature canon: three books at the start, one at the very end. Enough to
// exercise every boundary case without carrying all 66.
const books = [
    { id: 1, name: 'Genesis', abbrev: 'Gen', testament: 'OT', chapterCount: 50, canonicalOrder: 1 },
    { id: 2, name: 'Exodus', abbrev: 'Exod', testament: 'OT', chapterCount: 40, canonicalOrder: 2 },
    { id: 40, name: 'Matthew', abbrev: 'Matt', testament: 'NT', chapterCount: 28, canonicalOrder: 40 },
    { id: 66, name: 'Revelation', abbrev: 'Rev', testament: 'NT', chapterCount: 22, canonicalOrder: 66 },
];

describe('findBook', () => {
    test('returns the book with the given id', () => {
        expect(findBook(books, 40).name).toBe('Matthew');
    });

    test('returns null when no book has that id', () => {
        expect(findBook(books, 999)).toBeNull();
    });
});

describe('formatPosition', () => {
    test('renders a position as the bookId.chapter query param form', () => {
        expect(formatPosition({ bookId: 40, chapter: 5 })).toBe('40.5');
    });
});

describe('parsePosition', () => {
    test('parses a valid bookId.chapter pair', () => {
        expect(parsePosition('40.5', books, DEFAULT_PRIMARY)).toEqual({ bookId: 40, chapter: 5 });
    });

    test('falls back when the param is absent', () => {
        expect(parsePosition(null, books, DEFAULT_COMPARE)).toEqual(DEFAULT_COMPARE);
    });

    test('falls back when the book does not exist', () => {
        expect(parsePosition('99.1', books, DEFAULT_PRIMARY)).toEqual(DEFAULT_PRIMARY);
    });

    test('falls back when the chapter is past the end of the book', () => {
        expect(parsePosition('40.29', books, DEFAULT_PRIMARY)).toEqual(DEFAULT_PRIMARY);
    });

    test('falls back when the chapter is below 1', () => {
        expect(parsePosition('40.0', books, DEFAULT_PRIMARY)).toEqual(DEFAULT_PRIMARY);
    });

    test('falls back on malformed input', () => {
        expect(parsePosition('matthew-five', books, DEFAULT_PRIMARY)).toEqual(DEFAULT_PRIMARY);
        expect(parsePosition('40', books, DEFAULT_PRIMARY)).toEqual(DEFAULT_PRIMARY);
        expect(parsePosition('40.5.1', books, DEFAULT_PRIMARY)).toEqual(DEFAULT_PRIMARY);
    });

    test('returns the fallback unchanged while the catalog is still loading', () => {
        expect(parsePosition('40.5', [], DEFAULT_PRIMARY)).toEqual(DEFAULT_PRIMARY);
    });
});

describe('describePosition', () => {
    test('renders a human label for a position', () => {
        expect(describePosition(books, { bookId: 40, chapter: 5 })).toBe('Matthew 5');
    });

    test('renders an empty label when the catalog has not loaded', () => {
        expect(describePosition([], { bookId: 40, chapter: 5 })).toBe('');
    });
});

describe('stepChapter', () => {
    test('advances within a book', () => {
        expect(stepChapter(books, { bookId: 1, chapter: 1 }, 1)).toEqual({ bookId: 1, chapter: 2 });
    });

    test('retreats within a book', () => {
        expect(stepChapter(books, { bookId: 1, chapter: 2 }, -1)).toEqual({ bookId: 1, chapter: 1 });
    });

    test('crosses forward into the next book at chapter 1', () => {
        expect(stepChapter(books, { bookId: 1, chapter: 50 }, 1)).toEqual({ bookId: 2, chapter: 1 });
    });

    test('crosses backward into the previous book at its last chapter', () => {
        expect(stepChapter(books, { bookId: 2, chapter: 1 }, -1)).toEqual({ bookId: 1, chapter: 50 });
    });

    test('crosses the testament boundary in canonical order', () => {
        expect(stepChapter(books, { bookId: 2, chapter: 40 }, 1)).toEqual({ bookId: 40, chapter: 1 });
        expect(stepChapter(books, { bookId: 40, chapter: 1 }, -1)).toEqual({ bookId: 2, chapter: 40 });
    });

    test('steps by canonical order, not by array order or book id', () => {
        const shuffled = [...books].reverse();
        expect(stepChapter(shuffled, { bookId: 1, chapter: 50 }, 1)).toEqual({ bookId: 2, chapter: 1 });
    });

    test('clamps at the first chapter of the canon', () => {
        const first = { bookId: 1, chapter: 1 };
        expect(stepChapter(books, first, -1)).toEqual(first);
    });

    test('clamps at the last chapter of the canon', () => {
        const last = { bookId: 66, chapter: 22 };
        expect(stepChapter(books, last, 1)).toEqual(last);
    });

    test('returns the position unchanged when the catalog has not loaded', () => {
        const position = { bookId: 1, chapter: 1 };
        expect(stepChapter([], position, 1)).toEqual(position);
    });

    test('does not mutate the position it is given', () => {
        const position = { bookId: 1, chapter: 1 };
        stepChapter(books, position, 1);
        expect(position).toEqual({ bookId: 1, chapter: 1 });
    });
});

describe('defaults', () => {
    test('left defaults to Genesis 1 and right to Matthew 1', () => {
        expect(DEFAULT_PRIMARY).toEqual({ bookId: 1, chapter: 1 });
        expect(DEFAULT_COMPARE).toEqual({ bookId: 40, chapter: 1 });
    });
});
