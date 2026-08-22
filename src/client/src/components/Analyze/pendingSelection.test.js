import {
    clearAll,
    clearPlace,
    places,
    referencesFrom,
    toggleVerse,
    totalVerseCount,
    verseIndexesIn,
} from './pendingSelection';

// Positions are what the panels hold: a book and a chapter, no panel.
const GENESIS_1 = { bookId: 1, chapter: 1 };
const GENESIS_2 = { bookId: 1, chapter: 2 };
const MATTHEW_1 = { bookId: 40, chapter: 1 };

// Verse rows as they arrive on a chapter payload. Genesis 1 skips printed
// number 3 to stand in for the verses the WEB omits: the indexes stay gapless
// where the numbers jump, which is why the number has to be captured at click
// time rather than derived later.
const genesis1 = {
    v1: { verseIndex: 10, verse: 1 },
    v2: { verseIndex: 11, verse: 2 },
    v4: { verseIndex: 12, verse: 4 },
    v5: { verseIndex: 13, verse: 5 },
};

const genesis2 = {
    v1: { verseIndex: 41, verse: 1 },
    v2: { verseIndex: 42, verse: 2 },
};

const matthew1 = {
    v1: { verseIndex: 40010, verse: 1 },
};

// Builds a basket the way a reader does — one click at a time.
const basketOf = (...clicks) => clicks.reduce(
    (basket, [position, verse]) => toggleVerse(basket, position, verse),
    clearAll()
);

describe('toggleVerse', () => {
    test('adds a clicked verse as an index-and-number pair', () => {
        // Arrange
        const empty = clearAll();

        // Act
        const basket = toggleVerse(empty, GENESIS_1, genesis1.v1);

        // Assert
        expect(verseIndexesIn(basket, GENESIS_1)).toEqual([10]);
        expect(referencesFrom(basket)).toEqual([
            { bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 },
        ]);
    });

    test('keeps a place sorted by verse index however the clicks arrived', () => {
        const basket = basketOf(
            [GENESIS_1, genesis1.v5],
            [GENESIS_1, genesis1.v1],
            [GENESIS_1, genesis1.v2]
        );

        expect(verseIndexesIn(basket, GENESIS_1)).toEqual([10, 11, 13]);
    });

    test('clicking a selected verse again takes it back out', () => {
        const basket = basketOf([GENESIS_1, genesis1.v1], [GENESIS_1, genesis1.v2]);

        expect(verseIndexesIn(toggleVerse(basket, GENESIS_1, genesis1.v1), GENESIS_1))
            .toEqual([11]);
    });

    test('unclicking the last verse in a place removes the place entirely', () => {
        // An empty basket is the empty object, not a map of empty arrays: the
        // page asks "is anything selected anywhere?" by looking at the keys.
        const basket = basketOf([GENESIS_1, genesis1.v1]);

        expect(toggleVerse(basket, GENESIS_1, genesis1.v1)).toEqual({});
    });

    test('leaves the other places alone when one of them empties', () => {
        const basket = basketOf([GENESIS_1, genesis1.v1], [MATTHEW_1, matthew1.v1]);

        const remaining = toggleVerse(basket, GENESIS_1, genesis1.v1);

        expect(places(remaining)).toEqual([MATTHEW_1]);
    });

    test('holds verses from several chapters at once', () => {
        const basket = basketOf(
            [GENESIS_1, genesis1.v1],
            [GENESIS_2, genesis2.v1],
            [MATTHEW_1, matthew1.v1]
        );

        expect(totalVerseCount(basket)).toBe(3);
        expect(verseIndexesIn(basket, GENESIS_1)).toEqual([10]);
        expect(verseIndexesIn(basket, GENESIS_2)).toEqual([41]);
        expect(verseIndexesIn(basket, MATTHEW_1)).toEqual([40010]);
    });

    test('does not modify the basket it is given', () => {
        const basket = basketOf([GENESIS_1, genesis1.v1]);
        const before = JSON.stringify(basket);

        toggleVerse(basket, GENESIS_1, genesis1.v2);
        toggleVerse(basket, MATTHEW_1, matthew1.v1);

        expect(JSON.stringify(basket)).toBe(before);
    });
});

describe('verseIndexesIn', () => {
    test('is empty for a chapter nothing was clicked in', () => {
        const basket = basketOf([GENESIS_1, genesis1.v1]);

        expect(verseIndexesIn(basket, GENESIS_2)).toEqual([]);
        expect(verseIndexesIn(clearAll(), GENESIS_1)).toEqual([]);
    });

    test('does not confuse two chapters that share verse indexes', () => {
        // Nothing is keyed by index alone, so a click in Genesis 1 never lights
        // up the same index somewhere else in the canon.
        const basket = basketOf([GENESIS_1, genesis1.v1]);

        expect(verseIndexesIn(basket, { bookId: 2, chapter: 1 })).toEqual([]);
    });

    test('lights the same chapter up wherever it is open', () => {
        // The basket is keyed by book and chapter only. Genesis 1 in the centre
        // panel and Genesis 1 in the left panel are one place, so a verse
        // clicked in either is selected in both.
        const centrePanelPosition = { bookId: 1, chapter: 1 };
        const leftPanelPosition = { bookId: 1, chapter: 1 };

        const basket = toggleVerse(clearAll(), centrePanelPosition, genesis1.v1);

        expect(verseIndexesIn(basket, leftPanelPosition)).toEqual([10]);
        expect(verseIndexesIn(basket, centrePanelPosition)).toEqual([10]);
    });
});

describe('places', () => {
    test('is empty for an empty basket', () => {
        expect(places(clearAll())).toEqual([]);
    });

    test('names every chapter holding a selection, in canonical order', () => {
        const basket = basketOf(
            [MATTHEW_1, matthew1.v1],
            [GENESIS_2, genesis2.v1],
            [GENESIS_1, genesis1.v1]
        );

        expect(places(basket)).toEqual([GENESIS_1, GENESIS_2, MATTHEW_1]);
    });
});

describe('totalVerseCount', () => {
    test('counts nothing in an empty basket', () => {
        expect(totalVerseCount(clearAll())).toBe(0);
    });

    test('counts every verse across every place', () => {
        const basket = basketOf(
            [GENESIS_1, genesis1.v1],
            [GENESIS_1, genesis1.v2],
            [MATTHEW_1, matthew1.v1]
        );

        expect(totalVerseCount(basket)).toBe(3);
    });
});

describe('clearPlace', () => {
    test('drops one chapter and keeps the rest', () => {
        const basket = basketOf(
            [GENESIS_1, genesis1.v1],
            [GENESIS_1, genesis1.v2],
            [MATTHEW_1, matthew1.v1]
        );

        const remaining = clearPlace(basket, GENESIS_1);

        expect(verseIndexesIn(remaining, GENESIS_1)).toEqual([]);
        expect(verseIndexesIn(remaining, MATTHEW_1)).toEqual([40010]);
    });

    test('is harmless for a chapter that holds nothing', () => {
        const basket = basketOf([GENESIS_1, genesis1.v1]);

        expect(clearPlace(basket, GENESIS_2)).toEqual(basket);
    });

    test('does not modify the basket it is given', () => {
        const basket = basketOf([GENESIS_1, genesis1.v1]);

        clearPlace(basket, GENESIS_1);

        expect(verseIndexesIn(basket, GENESIS_1)).toEqual([10]);
    });
});

describe('clearAll', () => {
    test('is the empty basket', () => {
        expect(clearAll()).toEqual({});
        expect(totalVerseCount(clearAll())).toBe(0);
    });
});

describe('referencesFrom', () => {
    test('is empty when nothing is selected', () => {
        expect(referencesFrom(clearAll())).toEqual([]);
    });

    test('turns one contiguous run into one reference', () => {
        const basket = basketOf([GENESIS_1, genesis1.v1], [GENESIS_1, genesis1.v2]);

        expect(referencesFrom(basket)).toEqual([
            { bookId: 1, chapter: 1, startVerse: 1, endVerse: 2 },
        ]);
    });

    test('splits a gapped selection into one reference per run', () => {
        // Clicking verses 1 and 4 anchors two references, never one 1-4.
        const basket = basketOf(
            [GENESIS_1, genesis1.v1],
            [GENESIS_1, genesis1.v4],
            [GENESIS_1, genesis1.v5]
        );

        expect(referencesFrom(basket)).toEqual([
            { bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 },
            { bookId: 1, chapter: 1, startVerse: 4, endVerse: 5 },
        ]);
    });

    test('uses the verse numbers captured at click time, not the indexes', () => {
        // Indexes 12 and 13 are consecutive; the numbers they carry are 4 and 5.
        const basket = basketOf([GENESIS_1, genesis1.v4], [GENESIS_1, genesis1.v5]);

        expect(referencesFrom(basket)).toEqual([
            { bookId: 1, chapter: 1, startVerse: 4, endVerse: 5 },
        ]);
    });

    test('resolves a chapter the reader has navigated away from', () => {
        // The whole point of storing the number: no chapter payload is
        // consulted here, so a selection outlives the chapter it was made in.
        const basket = basketOf([GENESIS_1, genesis1.v4]);

        expect(referencesFrom(basket)).toEqual([
            { bookId: 1, chapter: 1, startVerse: 4, endVerse: 4 },
        ]);
    });

    test('lists every place in canonical order, runs in verse order', () => {
        const basket = basketOf(
            [MATTHEW_1, matthew1.v1],
            [GENESIS_2, genesis2.v2],
            [GENESIS_2, genesis2.v1],
            [GENESIS_1, genesis1.v5],
            [GENESIS_1, genesis1.v1]
        );

        expect(referencesFrom(basket)).toEqual([
            { bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 },
            { bookId: 1, chapter: 1, startVerse: 5, endVerse: 5 },
            { bookId: 1, chapter: 2, startVerse: 1, endVerse: 2 },
            { bookId: 40, chapter: 1, startVerse: 1, endVerse: 1 },
        ]);
    });
});
