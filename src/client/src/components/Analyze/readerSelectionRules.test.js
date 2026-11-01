import {
    extendSelection,
    isSelected,
    selectionReference,
    isBlankNote,
    planRemoval,
    formatCopyText,
} from './readerSelection';

// WEB skips verse numbers: index 102 prints as verse 5, index 103 as verse 7.
const verses = [
    { verseIndex: 100, verse: 1, text: 'In the beginning.' },
    { verseIndex: 101, verse: 2, text: 'The earth was formless.' },
    { verseIndex: 102, verse: 5, text: 'God said.' },
    { verseIndex: 103, verse: 7, text: 'There was light.' },
];

describe('extendSelection', () => {
    it.each([
        [null, 101, { start: 101, end: 101 }],
        [{ start: 101, end: 101 }, 101, null],
        [{ start: 101, end: 101 }, 103, { start: 101, end: 103 }],
        [{ start: 101, end: 101 }, 100, { start: 100, end: 101 }],
        [{ start: 100, end: 102 }, 101, { start: 100, end: 102 }],
        [{ start: 100, end: 102 }, 100, { start: 100, end: 102 }],
    ])('%j + %i -> %j', (selection, verseIndex, expected) => {
        expect(extendSelection(selection, verseIndex)).toEqual(expected);
    });

    it('does not mutate the selection', () => {
        const selection = Object.freeze({ start: 101, end: 101 });
        expect(extendSelection(selection, 103)).toEqual({ start: 101, end: 103 });
    });
});

describe('isSelected', () => {
    it('is true only inside the range, inclusive', () => {
        const selection = { start: 101, end: 103 };
        expect([100, 101, 102, 103, 104].map((i) => isSelected(selection, i)))
            .toEqual([false, true, true, true, false]);
    });

    it('is false with no selection', () => {
        expect(isSelected(null, 101)).toBe(false);
    });
});

describe('selectionReference', () => {
    it('reads printed verse numbers from the verses, not the indexes', () => {
        expect(selectionReference({ bookId: 1, chapter: 1 }, verses, { start: 101, end: 103 }))
            .toEqual({ bookId: 1, chapter: 1, startVerse: 2, endVerse: 7 });
    });

    it('prints Acts 8:36-38 over the WEB gap where indexes are consecutive', () => {
        const acts = [
            { verseIndex: 500, verse: 36, text: 'a' },
            { verseIndex: 501, verse: 38, text: 'b' },
        ];
        expect(selectionReference({ bookId: 44, chapter: 8 }, acts, { start: 500, end: 501 }))
            .toEqual({ bookId: 44, chapter: 8, startVerse: 36, endVerse: 38 });
    });

    it('uses one verse for both ends', () => {
        expect(selectionReference({ bookId: 43, chapter: 3 }, verses, { start: 102, end: 102 }))
            .toEqual({ bookId: 43, chapter: 3, startVerse: 5, endVerse: 5 });
    });
});

describe('isBlankNote', () => {
    it.each([
        [{ title: null, body: null }, true],
        [{ title: '', body: '' }, true],
        [{ title: '  ', body: '\n\t' }, true],
        [{ title: 'T', body: '' }, false],
        [{ title: null, body: 'text' }, false],
    ])('%j -> %s', (note, expected) => {
        expect(isBlankNote(note)).toBe(expected);
    });
});

describe('planRemoval', () => {
    const ref = (id, startIndex, endIndex) => ({ id, startIndex, endIndex });
    const selection = { start: 101, end: 102 };

    it('deletes a blank note whose every anchor overlaps', () => {
        const notes = [{ id: 1, title: '', body: null, references: [ref(10, 100, 101), ref(11, 102, 105)] }];
        expect(planRemoval(selection, notes))
            .toEqual({ noteIds: [1], referenceIds: [], writtenNotes: [] });
    });

    it('deletes only overlapping anchors of a blank note with others', () => {
        const notes = [{ id: 2, title: null, body: ' ', references: [ref(20, 101, 101), ref(21, 200, 201)] }];
        expect(planRemoval(selection, notes))
            .toEqual({ noteIds: [], referenceIds: [20], writtenNotes: [] });
    });

    it('lists written notes untouched, and ignores notes that do not overlap', () => {
        const notes = [
            { id: 3, title: 'Mine', body: '', references: [ref(30, 102, 102)] },
            { id: 4, title: '', body: '', references: [ref(40, 103, 110)] },
        ];
        expect(planRemoval(selection, notes))
            .toEqual({ noteIds: [], referenceIds: [], writtenNotes: [{ id: 3, title: 'Mine' }] });
    });

    it('treats ranges touching only at the edge as overlapping', () => {
        const notes = [{ id: 5, title: '', body: '', references: [ref(50, 90, 101)] }];
        expect(planRemoval(selection, notes).noteIds).toEqual([5]);
    });
});

describe('formatCopyText', () => {
    it('joins verse text and ends with a ranged reference', () => {
        expect(formatCopyText('Genesis', 1, verses, { start: 102, end: 103 }))
            .toBe('God said. There was light.\nGenesis 1:5-7');
    });

    it('prints a single verse without a range', () => {
        expect(formatCopyText('Genesis', 1, verses, { start: 100, end: 100 }))
            .toBe('In the beginning.\nGenesis 1:1');
    });
});
