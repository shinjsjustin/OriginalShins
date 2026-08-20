import { referenceFromVerseIndexRange } from './verseSelection';

// Verse numbers deliberately skip 4 so the tests cover a translation with a
// gap (the WEB omits verses the KJV numbers) while the indexes stay gapless.
const chapterData = {
    book: { id: 1, name: 'Genesis' },
    chapter: { number: 1 },
    verses: [
        { verse: 3, verseIndex: 3, text: 'Verse 3 text' },
        { verse: 5, verseIndex: 4, text: 'Verse 5 text' },
        { verse: 6, verseIndex: 5, text: 'Verse 6 text' },
    ],
};

describe('referenceFromVerseIndexRange', () => {
    test('converts an index range into the reference the API accepts', () => {
        // Arrange / Act
        const reference = referenceFromVerseIndexRange(chapterData, { startIndex: 3, endIndex: 4 });

        // Assert — verse *numbers*, not indexes: verse 4 does not exist here.
        expect(reference).toEqual({ bookId: 1, chapter: 1, startVerse: 3, endVerse: 5 });
    });

    test('reads verse numbers off the chapter rather than deriving them', () => {
        // The whole chapter: indexes 3..5 are verse numbers 3, 5 and 6.
        const reference = referenceFromVerseIndexRange(chapterData, { startIndex: 3, endIndex: 5 });

        expect(reference.startVerse).toBe(3);
        expect(reference.endVerse).toBe(6);
    });

    test('produces a single-verse reference when start and end match', () => {
        expect(referenceFromVerseIndexRange(chapterData, { startIndex: 5, endIndex: 5 }))
            .toEqual({ bookId: 1, chapter: 1, startVerse: 6, endVerse: 6 });
    });

    test('returns null when the range covers no verse of this chapter', () => {
        expect(referenceFromVerseIndexRange(chapterData, { startIndex: 900, endIndex: 901 })).toBeNull();
    });

    test('returns null without a chapter or a range', () => {
        expect(referenceFromVerseIndexRange(null, { startIndex: 3, endIndex: 3 })).toBeNull();
        expect(referenceFromVerseIndexRange(chapterData, null)).toBeNull();
    });
});
