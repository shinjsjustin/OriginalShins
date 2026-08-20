import {
    buildHighlightIndex,
    coversNote,
    referencesAt,
    tintClassName,
} from './highlights';

// A reference as /api/chapter returns it. Only the index range and the note id
// matter to the highlight logic.
const reference = (id, noteId, startIndex, endIndex) => ({
    id, noteId, noteTitle: `Note ${noteId}`, startIndex, endIndex,
});

describe('buildHighlightIndex', () => {
    test('maps every verse in a reference range to that reference', () => {
        // Arrange
        const references = [reference(1, 10, 3, 5)];

        // Act
        const index = buildHighlightIndex(references);

        // Assert
        expect(referencesAt(index, 3)).toEqual([references[0]]);
        expect(referencesAt(index, 4)).toEqual([references[0]]);
        expect(referencesAt(index, 5)).toEqual([references[0]]);
    });

    test('returns an empty list for a verse no reference covers', () => {
        const index = buildHighlightIndex([reference(1, 10, 3, 5)]);

        expect(referencesAt(index, 2)).toEqual([]);
        expect(referencesAt(index, 6)).toEqual([]);
    });

    test('stacks every reference covering the same verse', () => {
        // Arrange — two notes both touching verse 4
        const first = reference(1, 10, 3, 5);
        const second = reference(2, 11, 4, 4);

        // Act
        const index = buildHighlightIndex([first, second]);

        // Assert
        expect(referencesAt(index, 4)).toEqual([first, second]);
        expect(referencesAt(index, 3)).toEqual([first]);
    });

    test('handles a single-verse reference', () => {
        const index = buildHighlightIndex([reference(1, 10, 7, 7)]);

        expect(referencesAt(index, 7)).toHaveLength(1);
    });

    test('returns an empty index for no references', () => {
        expect(buildHighlightIndex([]).size).toBe(0);
        expect(buildHighlightIndex().size).toBe(0);
    });

    test('does not modify the references it was given', () => {
        const references = [reference(1, 10, 3, 5)];
        const snapshot = JSON.parse(JSON.stringify(references));

        buildHighlightIndex(references);

        expect(references).toEqual(snapshot);
    });
});

describe('tintClassName', () => {
    test('leaves a verse with no references plain', () => {
        expect(tintClassName(0)).toBe('');
    });

    test('gives a verse with one reference the light tint', () => {
        expect(tintClassName(1)).toBe('analyze-verse--tint-1');
    });

    test('gives a verse with two or more references the deeper tint', () => {
        expect(tintClassName(2)).toBe('analyze-verse--tint-2');
        expect(tintClassName(5)).toBe('analyze-verse--tint-2');
    });
});

describe('coversNote', () => {
    test('is true when one of the references belongs to the hovered note', () => {
        const references = [reference(1, 10, 3, 5), reference(2, 11, 3, 3)];

        expect(coversNote(references, 11)).toBe(true);
    });

    test('is false when no reference belongs to the hovered note', () => {
        expect(coversNote([reference(1, 10, 3, 5)], 99)).toBe(false);
    });

    test('matches nothing when no note is hovered', () => {
        // null must never match, or every verse would light up at once.
        expect(coversNote([reference(1, 10, 3, 5)], null)).toBe(false);
        expect(coversNote([reference(1, 10, 3, 5)], undefined)).toBe(false);
    });

    test('is false for a verse with no references', () => {
        expect(coversNote([], 10)).toBe(false);
    });
});
