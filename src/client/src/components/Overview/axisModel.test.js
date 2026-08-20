import {
    LABEL_MIN_GAP,
    MAX_DETAIL_TIER,
    buildAxisModel,
    indexForY,
    tierForGap,
    yForIndex,
} from './axisModel';
import { AXIS } from './overviewLayout';

// The axis is one linear mapping from verse_index to y, and every mark on it —
// 66 book ticks, 1,189 chapter ticks — is placed by that one function. Getting
// the cumulative index wrong puts every tick below it in the wrong place while
// still looking plausible, which is exactly the kind of error a picture hides.
//
// GET /api/books ships each chapter's verseCount but not its start_index, so
// the model re-derives the index here. The importer assigns verse_index as a
// running count over the same chapters in the same order (see
// src/scripts/scripture/build-rows.js), so the cumulative sum reproduces
// chapters.start_index / end_index exactly.

// A three-chapter, ten-verse stand-in for the canon: small enough that every
// index in the assertions can be counted by hand.
const CANON = [
    {
        id: 1,
        name: 'Alpha',
        chapters: [{ number: 1, verseCount: 3 }, { number: 2, verseCount: 2 }],
    },
    {
        id: 2,
        name: 'Beta',
        chapters: [{ number: 1, verseCount: 5 }],
    },
];

describe('buildAxisModel', () => {
    test('totals every chapter verse count across every book', () => {
        // Arrange / Act
        const model = buildAxisModel(CANON);

        // Assert — 3 + 2 + 5
        expect(model.totalVerses).toBe(10);
    });

    test('gives each book the verse_index span the importer would have assigned', () => {
        // Arrange / Act
        const model = buildAxisModel(CANON);

        // Assert
        expect(model.books.map(book => [book.startIndex, book.endIndex]))
            .toEqual([[1, 5], [6, 10]]);
    });

    test('gives each chapter the verse_index of its first verse', () => {
        // Arrange / Act
        const model = buildAxisModel(CANON);

        // Assert
        expect(model.chapters.map(chapter => chapter.startIndex)).toEqual([1, 4, 6]);
    });

    test('keeps the book name and id on each book so a tick can label itself', () => {
        // Arrange / Act
        const model = buildAxisModel(CANON);

        // Assert
        expect(model.books[1]).toMatchObject({ id: 2, name: 'Beta' });
    });

    test('keeps the book id and number on each chapter', () => {
        // Arrange / Act
        const model = buildAxisModel(CANON);

        // Assert
        expect(model.chapters[1]).toMatchObject({ bookId: 1, number: 2 });
    });

    test('places every book tick at the y of its first verse', () => {
        // Arrange / Act
        const model = buildAxisModel(CANON);

        // Assert
        expect(model.books[1].y).toBe(yForIndex(6, 10));
    });

    test('returns null when no books came back', () => {
        expect(buildAxisModel([])).toBeNull();
    });

    test('returns null when the books carry no chapters to measure', () => {
        // Arrange — a payload shaped right but empty is not an axis; drawing one
        // would divide by a zero verse total.
        const empty = [{ id: 1, name: 'Alpha', chapters: [] }];

        // Act / Assert
        expect(buildAxisModel(empty)).toBeNull();
    });

    test('skips a book whose chapters are missing rather than throwing', () => {
        // Arrange
        const ragged = [{ id: 1, name: 'Alpha' }, ...CANON];

        // Act
        const model = buildAxisModel(ragged);

        // Assert — the ragged book takes up no span, the rest are unshifted.
        expect(model.totalVerses).toBe(10);
        expect(model.books[1].startIndex).toBe(1);
    });
});

describe('yForIndex', () => {
    test('puts the first verse at the top of the axis', () => {
        expect(yForIndex(1, 10)).toBe(AXIS.top);
    });

    test('puts the last verse at the bottom of the axis', () => {
        expect(yForIndex(10, 10)).toBe(AXIS.bottom);
    });

    test('maps the halfway verse to the halfway point', () => {
        // Arrange — index 1 is the top, index 11 the bottom, so 6 is the middle.
        const middle = (AXIS.top + AXIS.bottom) / 2;

        // Act / Assert
        expect(yForIndex(6, 11)).toBeCloseTo(middle, 10);
    });

    test('is linear: equal index steps are equal y steps anywhere on the axis', () => {
        // Arrange / Act
        const nearTop = yForIndex(200, 31102) - yForIndex(100, 31102);
        const nearBottom = yForIndex(31000, 31102) - yForIndex(30900, 31102);

        // Assert — no per-book math anywhere: one verse is one distance.
        expect(nearTop).toBeCloseTo(nearBottom, 10);
    });
});

describe('tierForGap', () => {
    test('shows a label straight away when its neighbour is already far enough', () => {
        expect(tierForGap(LABEL_MIN_GAP)).toBe(0);
    });

    test('holds a label back one tier when it needs twice the room', () => {
        expect(tierForGap(LABEL_MIN_GAP / 2)).toBe(1);
    });

    test('holds a label back two tiers when it needs four times the room', () => {
        expect(tierForGap(LABEL_MIN_GAP / 4)).toBe(2);
    });

    test('caps at the last tier so no label is unreachable', () => {
        expect(tierForGap(0)).toBe(MAX_DETAIL_TIER);
    });
});

describe('indexForY', () => {
    const TOTAL_VERSES = 31095;

    test('undoes yForIndex exactly', () => {
        // Arrange — 6c's click-through goes one way through this pair and the
        // drawing goes the other, so the two have to be each other's inverse
        // rather than merely similar. A drift of a few verses would send the
        // reader to the wrong chapter from a click that looked well aimed.
        const indexes = [1, 2, 15548, TOTAL_VERSES - 1, TOTAL_VERSES];

        // Act / Assert
        indexes.forEach(verseIndex => {
            expect(indexForY(yForIndex(verseIndex, TOTAL_VERSES), TOTAL_VERSES))
                .toBeCloseTo(verseIndex, 6);
        });
    });

    test('names the first verse at the top of the axis and the last at its foot', () => {
        // Arrange / Act / Assert
        expect(indexForY(AXIS.top, TOTAL_VERSES)).toBeCloseTo(1, 10);
        expect(indexForY(AXIS.bottom, TOTAL_VERSES)).toBeCloseTo(TOTAL_VERSES, 10);
    });

    test('answers the first verse when the axis has none to divide by', () => {
        // Arrange — the same guard yForIndex has. A click before the canon has
        // loaded must not produce a division by zero.
        // Act / Assert
        expect(indexForY(500, 0)).toBe(1);
        expect(indexForY(500, 1)).toBe(1);
    });
});
