import {
    APPEND,
    IDEA,
    NOTE,
    PLACE,
    ROOT_KEY,
    TOPIC,
    UNFILED_IDEAS_KEY,
    UNFILED_NOTES_KEY,
    analyzeUrlForNote,
    bucketNodes,
    canExpand,
    childNodesOf,
    destinationFor,
    dropIntentFor,
    ideaNode,
    moveWithin,
    noteNode,
    topicNode,
} from './treeModel';

// The drop rules are the part of this page worth testing directly: one gesture
// has to resolve to exactly one of three different writes, and getting it wrong
// files something somewhere the reader did not put it.

const topic = (id, index = 0) => topicNode(
    { id, name: `Topic ${id}`, ideaCount: 1, noteCount: 1 },
    index
);

const ideaUnder = (container, id, index = 0) => ideaNode(
    { id, title: `Idea ${id}`, noteCount: 1 },
    index,
    container
);

const noteUnder = (container, id, index = 0) => noteNode(
    { id, title: `Note ${id}`, firstReference: null },
    index,
    container
);

const [unfiledIdeas, unfiledNotes] = bucketNodes();

describe('rows', () => {
    test('keys a row by its path, so one idea under two topics is two rows', () => {
        // Arrange
        const faith = topic(1, 0);
        const grace = topic(2, 1);

        // Act — the same idea, filed under both.
        const underFaith = ideaUnder(faith, 7);
        const underGrace = ideaUnder(grace, 7);

        // Assert — same id, different rows: opening one must not open the other.
        expect(underFaith.id).toBe(underGrace.id);
        expect(underFaith.key).not.toBe(underGrace.key);
    });

    test('records which container a row is filed under, for the move to leave', () => {
        const faith = topic(1);
        const idea = ideaUnder(faith, 7);

        expect(idea.containerId).toBe(1);
        expect(idea.containerKey).toBe(faith.key);
    });

    test('a row in a bucket is filed under nothing', () => {
        const idea = ideaUnder(unfiledIdeas, 7);

        // Not a missing value: null is the unfiled bucket, and it is what the
        // move sends as the container the row is leaving.
        expect(idea.containerId).toBeNull();
    });

    test('a note is a leaf and a topic is not', () => {
        expect(canExpand(topic(1))).toBe(true);
        expect(canExpand(noteUnder(unfiledNotes, 12))).toBe(false);
    });

    test('builds the child rows a container expands into', () => {
        const faith = topic(1);

        const children = childNodesOf(faith, [
            { id: 7, title: 'First', noteCount: 0 },
            { id: 8, title: 'Second', noteCount: 2 },
        ]);

        expect(children.map(child => child.kind)).toEqual([IDEA, IDEA]);
        expect(children.map(child => child.index)).toEqual([0, 1]);
        expect(children[1].detail).toBe('2 notes');
    });

    test('both buckets are always present and take one kind each', () => {
        expect(bucketNodes().map(bucket => bucket.key))
            .toEqual([UNFILED_IDEAS_KEY, UNFILED_NOTES_KEY]);
        expect(unfiledIdeas.childKind).toBe(IDEA);
        expect(unfiledNotes.childKind).toBe(NOTE);
    });
});

describe('drop rules', () => {
    test('dropping a row onto its own kind places it where that row sits', () => {
        // Arrange
        const faith = topic(1);
        const first = ideaUnder(faith, 7, 0);
        const second = ideaUnder(faith, 8, 1);

        // Act
        const destination = destinationFor(second, first);

        // Assert — into the same topic, at the target's index: a reorder.
        expect(dropIntentFor(second, first)).toBe(PLACE);
        expect(destination).toEqual({
            containerId: 1,
            containerKey: faith.key,
            position: 0,
        });
    });

    test('dropping onto a row in another parent re-parents it at that position', () => {
        const faith = topic(1, 0);
        const grace = topic(2, 1);
        const mine = ideaUnder(faith, 7, 0);
        const theirs = ideaUnder(grace, 9, 1);

        expect(destinationFor(mine, theirs)).toEqual({
            containerId: 2,
            containerKey: grace.key,
            position: 1,
        });
    });

    test('dropping onto a container appends into it', () => {
        const faith = topic(1);
        const loose = ideaUnder(unfiledIdeas, 7);

        expect(dropIntentFor(loose, faith)).toBe(APPEND);
        expect(destinationFor(loose, faith)).toEqual({
            containerId: 1,
            containerKey: faith.key,
            position: null,
        });
    });

    test('dropping a note onto an unfiled bucket unfiles it', () => {
        const faith = topic(1);
        const idea = ideaUnder(faith, 7);
        const filed = noteUnder(idea, 12);

        // The destination container is null, which is exactly what the move
        // endpoint takes as "drop the link row and leave it unfiled".
        expect(destinationFor(filed, unfiledNotes)).toEqual({
            containerId: null,
            containerKey: UNFILED_NOTES_KEY,
            position: null,
        });
    });

    test('a note dragged out of a bucket onto an idea is filed under it', () => {
        const faith = topic(1);
        const idea = ideaUnder(faith, 7);
        const loose = noteUnder(unfiledNotes, 12);

        expect(destinationFor(loose, idea)).toEqual({
            containerId: 7,
            containerKey: idea.key,
            position: null,
        });
    });

    test('refuses a drop that crosses tiers the wrong way', () => {
        const faith = topic(1);
        const idea = ideaUnder(faith, 7);
        const note = noteUnder(idea, 12);

        // A note holds nothing, and a topic does not hold notes.
        expect(dropIntentFor(idea, note)).toBeNull();
        expect(dropIntentFor(note, faith)).toBeNull();
        expect(dropIntentFor(faith, unfiledIdeas)).toBeNull();
    });

    test('refuses a row dropped on itself', () => {
        const faith = topic(1);

        expect(dropIntentFor(faith, faith)).toBeNull();
    });

    test('refuses reordering inside an unfiled bucket', () => {
        // Arrange — two rows in the same bucket. Neither has a link row, so
        // there is no sort_order between them and a container to write.
        const first = noteUnder(unfiledNotes, 12, 0);
        const second = noteUnder(unfiledNotes, 13, 1);

        // Act + assert — the bucket lists in creation order and stays that way.
        expect(dropIntentFor(second, first)).toBeNull();
        expect(destinationFor(second, first)).toBeNull();
    });

    test('topics reorder among themselves at the root', () => {
        const first = topic(1, 0);
        const third = topic(3, 2);

        expect(destinationFor(third, first)).toEqual({
            containerId: null,
            containerKey: ROOT_KEY,
            position: 0,
        });
    });
});

describe('moveWithin', () => {
    test('moves an id later without disturbing the rest', () => {
        expect(moveWithin([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    });

    test('moves an id earlier', () => {
        expect(moveWithin([1, 2, 3, 4], 3, 1)).toEqual([1, 4, 2, 3]);
    });

    test('returns the same array when nothing moves', () => {
        const ids = [1, 2, 3];

        // Identity, not just equality: an unchanged order must not look like a
        // change worth sending to the server.
        expect(moveWithin(ids, 1, 1)).toBe(ids);
    });

    test('never mutates the list it was given', () => {
        const ids = [1, 2, 3];

        moveWithin(ids, 0, 2);

        expect(ids).toEqual([1, 2, 3]);
    });

    test('clamps a landing index past the end', () => {
        expect(moveWithin([1, 2, 3], 0, 99)).toEqual([2, 3, 1]);
    });
});

describe('analyzeUrlForNote', () => {
    test('positions the left panel at the note first anchor and opens it', () => {
        const note = noteNode(
            { id: 12, title: 'Abiding', firstReference: { bookId: 43, chapter: 15 } },
            0,
            unfiledNotes
        );

        expect(analyzeUrlForNote(note)).toBe('/analyze?l=43.15&note=12');
    });

    test('still opens a note with no anchor, letting the panels default', () => {
        const note = noteUnder(unfiledNotes, 12);

        // Such a note is in Analyze's unreferenced list, which is the same
        // whatever chapter the panels are showing — so the editor still opens.
        expect(analyzeUrlForNote(note)).toBe('/analyze?note=12');
    });
});

describe('kinds', () => {
    test('names the three tiers the tree walks', () => {
        expect([TOPIC, IDEA, NOTE]).toEqual(['topic', 'idea', 'note']);
    });
});
