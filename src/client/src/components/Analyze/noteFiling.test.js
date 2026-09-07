import { withMember, withoutMember } from './noteFiling';

// Filing a note is always a whole-set PUT, so every write here is "the set it
// has, plus or minus one". Two functions rather than four inline spreads: an
// add and a remove written separately are an add and a remove that drift.

describe('withMember', () => {
    test('appends an id the set does not hold', () => {
        expect(withMember([1, 2], 3)).toEqual([1, 2, 3]);
    });

    test('returns the set unchanged when it already holds the id', () => {
        const ids = [1, 2];

        // Referentially equal, so a caller can skip a no-op round trip by
        // comparing against what it passed in.
        expect(withMember(ids, 2)).toBe(ids);
    });

    test('starts a set from empty', () => {
        expect(withMember([], 7)).toEqual([7]);
    });

    test('never mutates the set it was given', () => {
        const ids = [1];
        withMember(ids, 2);
        expect(ids).toEqual([1]);
    });
});

describe('withoutMember', () => {
    test('removes an id the set holds', () => {
        expect(withoutMember([1, 2, 3], 2)).toEqual([1, 3]);
    });

    test('leaves the set alone when it does not hold the id', () => {
        expect(withoutMember([1, 2], 9)).toEqual([1, 2]);
    });

    test('removing the last id yields an empty set rather than null', () => {
        // An orphan note is a legal state — see PUT /api/notes/:id/ideas.
        expect(withoutMember([1], 1)).toEqual([]);
    });

    test('never mutates the set it was given', () => {
        const ids = [1, 2];
        withoutMember(ids, 1);
        expect(ids).toEqual([1, 2]);
    });
});
