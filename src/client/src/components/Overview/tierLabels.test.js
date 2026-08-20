import { MAX_SUMMARY_REFERENCES, UNTITLED, buildLabels, nearestReference } from './tierLabels';

// ─── What a label has to get right ──────────────────────────────────────────
//
// Three things, and all of them are about a reader being told the truth about
// what they are pointing at.
//
// The first is the reference list. A tooltip saying "Romans 5:1–5" over an arc
// anchored somewhere else is worse than no tooltip, and nothing about it looks
// wrong on screen — the words are well-formed and the arc is in a plausible
// place. The formatting is the Analyze page's own, so what is asserted here is
// that the payload's tuples reach it intact.
//
// The second is nearestReference, which decides where clicking a chain takes
// the reader. It is the one piece of arithmetic between a click and a chapter.
//
// The third arrived with the upper rails: a topic gathers every reference of
// every note under every one of its ideas, so the line under the title has to
// stop somewhere. One module reads all three label tiers — they are the same
// shape — so what is asserted below holds for a note, an idea and a topic
// alike, and the two places the rail does change the answer have tests of
// their own.

const BOOKS = [
    { id: 1, name: 'Genesis', chapterCount: 50, canonicalOrder: 1 },
    { id: 45, name: 'Romans', chapterCount: 16, canonicalOrder: 45 },
    { id: 58, name: 'Hebrews', chapterCount: 13, canonicalOrder: 58 },
];

// [noteId, title, [[anchor, bookId, chapter, startVerse, endVerse], ...]]
const TIER = [
    [9, 'Justified by faith', [[28100, 45, 5, 1, 5], [29600, 58, 11, 1, 1]]],
    [11, 'The first day', [[3, 1, 1, 1, 5]]],
];

describe('buildLabels', () => {
    test('prints a multi-verse reference as a range and a single verse as one', () => {
        // Arrange / Act
        const labels = buildLabels(TIER, BOOKS);

        // Assert — the Analyze page's formatter, so a reference reads the same
        // in a tooltip as it does in the note editor.
        expect(labels.get(9).references.map(reference => reference.label))
            .toEqual(['Romans 5:1–5', 'Hebrews 11:1']);
    });

    test('joins the references of a group into the line a tooltip shows', () => {
        // Arrange / Act
        const labels = buildLabels(TIER, BOOKS);

        // Assert
        expect(labels.get(9).summary).toBe('Romans 5:1–5; Hebrews 11:1');
    });

    test('keeps the title the note was given', () => {
        // Arrange / Act
        const labels = buildLabels(TIER, BOOKS);

        // Assert
        expect(labels.get(11).title).toBe('The first day');
    });

    test('names an untitled note rather than opening a tooltip with a blank line', () => {
        // Arrange — a note may legally have no title.
        const tier = [[9, '', [[3, 1, 1, 1, 1]]], [11, '   ', [[3, 1, 1, 1, 1]]]];

        // Act
        const labels = buildLabels(tier, BOOKS);

        // Assert
        expect(labels.get(9).title).toBe(UNTITLED);
        expect(labels.get(11).title).toBe(UNTITLED);
    });

    test('keeps a reference readable when the canon has not loaded yet', () => {
        // Arrange — the two requests resolve independently, so a hover can
        // land between them. A row reading "Book 45 5:1–5" is worse than the
        // name and better than nothing.
        // Act
        const labels = buildLabels(TIER, []);

        // Assert
        expect(labels.get(9).summary).toBe('Book 45 5:1–5; Book 58 11:1');
    });

    test('looks a group up by id rather than scanning a few thousand entries', () => {
        // Arrange / Act
        const labels = buildLabels(TIER, BOOKS);

        // Assert — a hover is a lookup, and there is one per group the
        // pointer crosses.
        expect(labels).toBeInstanceOf(Map);
        expect(labels.get(404)).toBeUndefined();
    });

    test('stops listing references once a tooltip would cover the diagram', () => {
        // Arrange — the case the upper rails make ordinary. A topic's label
        // carries every reference under it, which is hundreds; a tooltip that
        // prints them all hides the thing it is describing.
        const references = Array.from(
            { length: MAX_SUMMARY_REFERENCES + 4 },
            (unused, index) => [100 + index, 1, 1 + index, 1, 1]
        );

        // Act
        const summary = buildLabels([[7, 'Faith', references]], BOOKS, 'topics')
            .get(7).summary;

        // Assert — the first few named, and the rest counted rather than
        // dropped silently.
        expect(summary.split('; ')).toHaveLength(MAX_SUMMARY_REFERENCES);
        expect(summary).toContain('and 4 more');
    });

    test('keeps every reference even when the summary stops naming them', () => {
        // Arrange — the summary is what the tooltip prints; nearestReference
        // still has to search the whole list, or a click past the sixth
        // passage of a topic would open the wrong chapter.
        const references = Array.from(
            { length: MAX_SUMMARY_REFERENCES + 4 },
            (unused, index) => [100 + index, 1, 1 + index, 1, 1]
        );

        // Act
        const label = buildLabels([[7, 'Faith', references]], BOOKS, 'topics').get(7);

        // Assert
        expect(label.references).toHaveLength(references.length);
        expect(nearestReference(label, 109).chapter).toBe(10);
    });

    test('names an untitled group after the rail it is on', () => {
        // Arrange — "Untitled note" over an arc on the topics rail is a
        // sentence about the wrong thing.
        const tier = [[9, '', [[3, 1, 1, 1, 1]]]];

        // Act / Assert
        expect(buildLabels(tier, BOOKS, 'ideas').get(9).title).toBe('Untitled idea');
        expect(buildLabels(tier, BOOKS, 'topics').get(9).title).toBe('Untitled topic');
    });

    describe('a payload that is not what it should be', () => {
        test.each([
            ['missing', undefined],
            ['not an array', { noteLabels: [] }],
            ['null', null],
        ])('yields nothing when the tier is %s', (unused, tier) => {
            // Arrange / Act / Assert
            expect(buildLabels(tier, BOOKS).size).toBe(0);
        });

        test('skips an entry that is not [id, title, references]', () => {
            // Arrange
            const tier = [[9], 'nonsense', [11, 'A note', 'nonsense'], [12, 'Real', []]];

            // Act
            const labels = buildLabels(tier, BOOKS);

            // Assert
            expect([...labels.keys()]).toEqual([12]);
        });

        test('drops a reference tuple that is missing a field', () => {
            // Arrange — every field either places the reference or prints it,
            // so a partial tuple has nothing to contribute and would print as
            // "Genesis 1:undefined".
            const tier = [[9, 'A note', [[3, 1, 1], [3, 1, 1, 1, 5], [3, 1, 1, 1, '5']]]];

            // Act
            const labels = buildLabels(tier, BOOKS);

            // Assert
            expect(labels.get(9).summary).toBe('Genesis 1:1–5');
        });
    });
});

describe('nearestReference', () => {
    const label = buildLabels(TIER, BOOKS).get(9);

    test('picks the reference whose anchor the click landed closest to', () => {
        // Arrange / Act / Assert — this is what makes the drawer link open
        // Analyze at the end of the chain the reader actually pointed at.
        expect(nearestReference(label, 28150).label).toBe('Romans 5:1–5');
        expect(nearestReference(label, 29500).label).toBe('Hebrews 11:1');
    });

    test('falls back to the first reference when the click cannot be placed', () => {
        // Arrange — the <svg> has no box yet, so usePanZoom cannot convert the
        // click. The drawer still has to open somewhere sensible.
        // Act / Assert
        expect(nearestReference(label, NaN).label).toBe('Romans 5:1–5');
        expect(nearestReference(label, null).label).toBe('Romans 5:1–5');
    });

    test('resolves a tie toward the canonically earlier reference', () => {
        // Arrange — two references sharing a midpoint is ordinary: 45:1-5 and
        // 45:2-4 both anchor at 45:3. The tier arrived in start_index order.
        const tied = buildLabels(
            [[9, 'A note', [[100, 45, 5, 1, 5], [100, 45, 5, 2, 4]]]],
            BOOKS
        ).get(9);

        // Act / Assert
        expect(nearestReference(tied, 100).label).toBe('Romans 5:1–5');
    });

    test('has no answer for a group it was never given', () => {
        // Arrange / Act / Assert
        expect(nearestReference(null, 100)).toBeNull();
        expect(nearestReference({ references: [] }, 100)).toBeNull();
    });
});
