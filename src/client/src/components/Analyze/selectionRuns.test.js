import { contiguousRuns, isVerseSelected, toggleVerseIndex } from './selectionRuns';

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
