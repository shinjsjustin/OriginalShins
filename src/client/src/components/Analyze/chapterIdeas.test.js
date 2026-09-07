import { collectChapterIdeas } from './chapterIdeas';

const idea = (id, title, body = '') => ({ id, title, body });
const noteFiledUnder = (...ideas) => ({ id: 1, ideas: ideas.map(({ id, title }) => ({ id, title })) });

const titlesOf = (ideas) => ideas.map(item => item.title);

describe('collectChapterIdeas', () => {
    test('lists the imported ideas in the order they were imported', () => {
        // Arrange
        const imported = [idea(2, 'Pruning'), idea(1, 'Abiding')];

        // Act
        const collected = collectChapterIdeas(imported, [], []);

        // Assert — the stored order is the reader's own, not the corpus order.
        expect(titlesOf(collected)).toEqual(['Pruning', 'Abiding']);
    });

    test('adds an idea a note here is filed under, after the imports', () => {
        const abiding = idea(1, 'Abiding');
        const pruning = idea(2, 'Pruning');

        const collected = collectChapterIdeas([abiding], [noteFiledUnder(pruning)], [abiding, pruning]);

        expect(titlesOf(collected)).toEqual(['Abiding', 'Pruning']);
    });

    test('lists an idea reached both ways once, at its imported position', () => {
        const abiding = idea(1, 'Abiding');
        const pruning = idea(2, 'Pruning');

        const collected = collectChapterIdeas(
            [abiding, pruning],
            [noteFiledUnder(pruning), noteFiledUnder(abiding)],
            [abiding, pruning]
        );

        expect(collected.map(item => item.id)).toEqual([1, 2]);
    });

    test('hydrates a note link from the idea list, so the row keeps its body', () => {
        const abiding = idea(1, 'Abiding', 'The branch that stays.');

        const collected = collectChapterIdeas([], [noteFiledUnder(abiding)], [abiding]);

        expect(collected[0].body).toBe('The branch that stays.');
    });

    test('falls back to the link row while the idea list is still loading', () => {
        const abiding = idea(1, 'Abiding');

        // The corpus has not arrived yet; the note's own link row is all there
        // is, and a title is enough to draw the row.
        const collected = collectChapterIdeas([], [noteFiledUnder(abiding)], []);

        expect(titlesOf(collected)).toEqual(['Abiding']);
    });

    test('is empty for a chapter holding nothing', () => {
        expect(collectChapterIdeas([], [], [])).toEqual([]);
    });

    test('never mutates the lists it was given', () => {
        const imported = [idea(1, 'Abiding')];
        const notes = [noteFiledUnder(idea(2, 'Pruning'))];

        collectChapterIdeas(imported, notes, []);

        expect(imported).toHaveLength(1);
        expect(notes[0].ideas).toHaveLength(1);
    });
});
