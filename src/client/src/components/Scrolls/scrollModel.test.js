import { passageLabel, progressLabel, sortNewestFirst, isAnswerDirty } from './scrollModel';

const passage = (over) => ({
    bookId: 43, bookName: 'John', startChapter: 3, startVerse: 1, endChapter: 3, endVerse: null, ...over,
});

describe('scrollModel', () => {
    it.each([
        [{}, 'John 3'],
        [{ endChapter: 4 }, 'John 3-4'],
        [{ endVerse: 16 }, 'John 3:1-16'],
        [{ startVerse: 5, endVerse: 5 }, 'John 3:5'],
        [{ endChapter: 4, endVerse: 12 }, 'John 3:1-4:12'],
    ])('passageLabel %j', (over, expected) => {
        expect(passageLabel(passage(over))).toBe(expected);
    });

    it('progressLabel counts answered questions, empty with none', () => {
        expect(progressLabel({ questionCount: 5, answeredCount: 2 })).toBe('2 of 5 answered');
        expect(progressLabel({ questionCount: 0, answeredCount: 0 })).toBe('');
    });

    it('sortNewestFirst orders by createdAt then id, without mutating', () => {
        const input = [
            { id: 1, createdAt: '2026-01-01T00:00:00.000Z' },
            { id: 3, createdAt: '2026-01-02T00:00:00.000Z' },
            { id: 2, createdAt: '2026-01-02T00:00:00.000Z' },
        ];
        expect(sortNewestFirst(input).map((s) => s.id)).toEqual([3, 2, 1]);
        expect(input.map((s) => s.id)).toEqual([1, 3, 2]);
    });

    it('isAnswerDirty compares trimmed draft to the saved answer', () => {
        const saved = { answer: { text: 'yes' } };
        expect(isAnswerDirty(saved, ' yes ')).toBe(false);
        expect(isAnswerDirty(saved, 'no')).toBe(true);
        expect(isAnswerDirty({ answer: null }, '  ')).toBe(false);
        expect(isAnswerDirty({ answer: null }, 'x')).toBe(true);
        expect(isAnswerDirty(saved, '')).toBe(true);
    });
});
