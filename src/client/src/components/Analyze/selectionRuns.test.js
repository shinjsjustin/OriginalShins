import {
    contiguousRuns,
    isVerseSelected,
    referencesFromSelection,
    toggleVerseIndex,
} from './selectionRuns';

// Genesis 1:1-4, with 3 missing to stand in for the verses the WEB omits: the
// indexes stay gapless where the printed numbers skip.
const chapterData = {
    book: { id: 1 },
    chapter: { number: 1 },
    verses: [
        { verseIndex: 10, verse: 1 },
        { verseIndex: 11, verse: 2 },
        { verseIndex: 12, verse: 4 },
        { verseIndex: 13, verse: 5 },
    ],
};

describe('toggleVerseIndex', () => {
    test('adds a verse that was not selected', () => {
        expect(toggleVerseIndex([], 11)).toEqual([11]);
    });

    test('removes a verse that was already selected', () => {
        expect(toggleVerseIndex([10, 11], 10)).toEqual([11]);
    });

    test('keeps the result sorted however the clicks arrived', () => {
        expect(toggleVerseIndex([13, 10], 11)).toEqual([10, 11, 13]);
    });

    test('does not modify the array it is given', () => {
        const selected = [10];
        toggleVerseIndex(selected, 11);
        expect(selected).toEqual([10]);
    });
});

describe('isVerseSelected', () => {
    test('is true only for a verse in the set', () => {
        expect(isVerseSelected([10, 12], 10)).toBe(true);
        expect(isVerseSelected([10, 12], 11)).toBe(false);
    });
});

describe('contiguousRuns', () => {
    test('returns nothing for an empty selection', () => {
        expect(contiguousRuns([])).toEqual([]);
    });

    test('groups consecutive indexes into one run', () => {
        expect(contiguousRuns([10, 11, 12])).toEqual([[10, 11, 12]]);
    });

    test('splits at a gap', () => {
        expect(contiguousRuns([10, 11, 14, 15, 20])).toEqual([[10, 11], [14, 15], [20]]);
    });

    test('sorts before grouping', () => {
        expect(contiguousRuns([12, 10, 11])).toEqual([[10, 11, 12]]);
    });
});

describe('referencesFromSelection', () => {
    test('is empty when nothing is selected', () => {
        expect(referencesFromSelection(chapterData, [])).toEqual([]);
    });

    test('is empty when the chapter has not loaded', () => {
        expect(referencesFromSelection(null, [10])).toEqual([]);
    });

    test('turns one run into one reference', () => {
        expect(referencesFromSelection(chapterData, [10, 11])).toEqual([
            { bookId: 1, chapter: 1, startVerse: 1, endVerse: 2 },
        ]);
    });

    test('turns a gapped selection into one reference per run', () => {
        expect(referencesFromSelection(chapterData, [10, 12, 13])).toEqual([
            { bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 },
            { bookId: 1, chapter: 1, startVerse: 4, endVerse: 5 },
        ]);
    });

    test('reads the printed verse numbers rather than deriving them from indexes', () => {
        // Indexes 12-13 are consecutive; the numbers they carry are 4 and 5.
        expect(referencesFromSelection(chapterData, [12, 13])).toEqual([
            { bookId: 1, chapter: 1, startVerse: 4, endVerse: 5 },
        ]);
    });

    test('drops a run that lands on no loaded verse', () => {
        expect(referencesFromSelection(chapterData, [99])).toEqual([]);
    });
});
