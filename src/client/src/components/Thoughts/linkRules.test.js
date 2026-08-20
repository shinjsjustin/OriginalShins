import { evaluateLink, LINK_HINTS, LINKABLE_PAIRS, TIER_ORDER } from './linkRules';

// ─── What "linkable" has to get right ───────────────────────────────────────
//
// The panel's Link button is enabled or disabled by this one function, and the
// cost of the two mistakes is not symmetric. A Link wrongly disabled is a
// visible annoyance the reader can work around. A Link wrongly enabled fires
// real PUTs against the tier endpoints and rearranges the reader's corpus —
// and there is no undo in this page.
//
// So the truth table below is exhaustive rather than illustrative: all eight
// combinations of the three tiers being present or absent, each pinned to an
// expected verdict AND to the specific hint the UI shows. The hint matters as
// much as the boolean, because "why is this greyed out" is the only question
// a disabled button ever provokes.
//
// The second thing tested here is the fan-out. Link is not a pairing of one
// note to one idea; it is every note to every idea. Getting the cartesian
// product wrong is invisible in the two-item case a developer tries by hand
// and wrong for every real selection.

const selection = (itemType, ...itemIds) => itemIds.map(itemId => ({ itemType, itemId }));

const NOTES = selection('note', 1, 2);
const IDEAS = selection('idea', 10, 11, 12);
const TOPICS = selection('topic', 100);

describe('evaluateLink — the truth table over the three tiers', () => {
    // [note?, idea?, topic?, canLink, hint]
    test.each([
        [false, false, false, false, LINK_HINTS.empty],
        [true, false, false, false, LINK_HINTS.noteOnly],
        [false, true, false, false, LINK_HINTS.ideaOnly],
        [false, false, true, false, LINK_HINTS.topicOnly],
        [true, true, false, true, null],
        [false, true, true, true, null],
        [true, false, true, false, LINK_HINTS.nonAdjacent],
        [true, true, true, false, LINK_HINTS.allTiers],
    ])(
        'notes=%s ideas=%s topics=%s -> canLink=%s',
        (hasNotes, hasIdeas, hasTopics, canLink, reason) => {
            // Arrange
            const items = [
                ...(hasNotes ? NOTES : []),
                ...(hasIdeas ? IDEAS : []),
                ...(hasTopics ? TOPICS : []),
            ];

            // Act
            const verdict = evaluateLink(items);

            // Assert
            expect(verdict.canLink).toBe(canLink);
            expect(verdict.reason).toBe(reason);
        }
    );

    test('offers no pairs whenever it refuses to link', () => {
        // Arrange — a caller that reads `pairs` without reading `canLink`
        // should still do nothing rather than something arbitrary.
        const refused = [
            [],
            NOTES,
            IDEAS,
            TOPICS,
            [...NOTES, ...TOPICS],
            [...NOTES, ...IDEAS, ...TOPICS],
        ];

        // Act / Assert
        refused.forEach(items => expect(evaluateLink(items).pairs).toEqual([]));
    });
});

describe('evaluateLink — the pairs a valid selection produces', () => {
    test('pairs every note with every idea, not one with one', () => {
        // Arrange — two notes and three ideas is six links. A zip would give
        // two and lose the third idea silently; a "first parent wins" would
        // give two and lose a note.
        const items = [...NOTES, ...IDEAS];

        // Act
        const { pairs } = evaluateLink(items);

        // Assert
        expect(pairs).toHaveLength(NOTES.length * IDEAS.length);
    });

    test('names the higher tier as the parent of each pair', () => {
        // Arrange — the pair is [parent, child] because the child is the side
        // that owns the set being PUT back (a note's ideas, an idea's topics).
        // A flipped pair links the corpus backwards.
        const items = [...IDEAS, ...TOPICS];

        // Act
        const { pairs } = evaluateLink(items);

        // Assert
        pairs.forEach(([parent, child]) => {
            expect(parent.itemType).toBe('topic');
            expect(child.itemType).toBe('idea');
        });
    });

    test('groups the pairs by child, so one child needs one write', () => {
        // Arrange — the caller PUTs a child's whole set back in one request.
        // Emitting the pairs child-major is what lets it batch by child
        // instead of re-reading and re-writing the same note three times.
        const items = [...selection('note', 1, 2), ...selection('idea', 10, 11)];

        // Act
        const { pairs } = evaluateLink(items);

        // Assert
        expect(pairs).toEqual([
            [{ itemType: 'idea', itemId: 10 }, { itemType: 'note', itemId: 1 }],
            [{ itemType: 'idea', itemId: 11 }, { itemType: 'note', itemId: 1 }],
            [{ itemType: 'idea', itemId: 10 }, { itemType: 'note', itemId: 2 }],
            [{ itemType: 'idea', itemId: 11 }, { itemType: 'note', itemId: 2 }],
        ]);
    });

    test('links a lone note to a lone idea', () => {
        // Arrange — the smallest valid selection, and the one a reader makes
        // most often.
        // Act
        const { canLink, pairs } = evaluateLink([
            ...selection('note', 7),
            ...selection('idea', 70),
        ]);

        // Assert
        expect(canLink).toBe(true);
        expect(pairs).toEqual([
            [{ itemType: 'idea', itemId: 70 }, { itemType: 'note', itemId: 7 }],
        ]);
    });

    test('counts an item selected twice once', () => {
        // Arrange — the panel selects by checkbox and by row click, so the
        // same row can arrive twice. Two copies of one note would append the
        // same idea id twice and double the write.
        const items = [...selection('note', 1, 1), ...selection('idea', 10)];

        // Act
        const { pairs } = evaluateLink(items);

        // Assert
        expect(pairs).toHaveLength(1);
    });

    test('leaves the caller\'s selection untouched', () => {
        // Arrange — this module is consulted on every render of the action
        // bar. Sorting or de-duplicating the array in place would mutate
        // React state from inside a read.
        const items = [...NOTES, ...IDEAS];
        const before = JSON.parse(JSON.stringify(items));

        // Act
        evaluateLink(items);

        // Assert
        expect(items).toEqual(before);
    });
});

describe('evaluateLink — a selection that is not what it should be', () => {
    test.each([
        ['missing', undefined],
        ['null', null],
        ['not an array', { items: [] }],
    ])('refuses when the selection is %s', (unused, items) => {
        // Arrange / Act / Assert
        expect(evaluateLink(items)).toEqual({
            canLink: false,
            reason: LINK_HINTS.empty,
            pairs: [],
        });
    });

    test.each([
        ['an unknown tier', { itemType: 'verse', itemId: 3 }],
        ['no tier at all', { itemId: 3 }],
        ['no id', { itemType: 'note' }],
        ['an id that is not a number', { itemType: 'note', itemId: 'x' }],
    ])('refuses the whole selection when one entry has %s', (unused, stray) => {
        // Arrange — a selection is one action. Quietly dropping the entry the
        // reader can see selected, and linking the rest, is worse than
        // refusing: the reader would have no way to tell what was written.
        const items = [...selection('idea', 10), stray];

        // Act
        const verdict = evaluateLink(items);

        // Assert
        expect(verdict.canLink).toBe(false);
        expect(verdict.reason).toBe(LINK_HINTS.unknownType);
        expect(verdict.pairs).toEqual([]);
    });
});

describe('the tiers themselves', () => {
    test('orders the tiers parent to child', () => {
        // Arrange / Act / Assert — the order the rest of the module reads
        // adjacency out of.
        expect(TIER_ORDER).toEqual(['topic', 'idea', 'note']);
    });

    test('makes exactly the two adjacent pairs linkable', () => {
        // Arrange / Act / Assert — topic-to-note is the one gap in the chain,
        // and it is the whole reason this module exists.
        expect(LINKABLE_PAIRS).toEqual([['topic', 'idea'], ['idea', 'note']]);
    });
});
