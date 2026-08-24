import { contiguousRuns, isVerseSelected } from './selectionRuns';

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
