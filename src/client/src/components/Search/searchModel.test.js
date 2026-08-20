import {
    EMPTY_RESULTS,
    GROUPS,
    MIN_QUERY_LENGTH,
    isSearchable,
    resultsFrom,
    totalResults,
} from './searchModel';

// Where a search result goes is the part of this page worth testing directly:
// four kinds of row, four different destinations, and each one an existing URL
// with an existing meaning. A link built wrong lands the reader on a page that
// looks fine and is showing the wrong thing.

const groupNamed = (key) => GROUPS.find(group => group.key === key);

describe('query length', () => {
    test('refuses a query shorter than the minimum', () => {
        // Arrange
        const short = 'a'.repeat(MIN_QUERY_LENGTH - 1);

        // Act / Assert
        expect(isSearchable(short)).toBe(false);
    });

    test('accepts a query at the minimum', () => {
        expect(isSearchable('a'.repeat(MIN_QUERY_LENGTH))).toBe(true);
    });

    test('measures the trimmed query, not the typed one', () => {
        // Arrange — one character surrounded by spaces is one character.
        const padded = `  ${'a'.repeat(MIN_QUERY_LENGTH - 1)}  `;

        // Act / Assert
        expect(isSearchable(padded)).toBe(false);
    });
});

describe('note results', () => {
    test('link to the editor at the chapter of the first anchor', () => {
        // Arrange
        const note = {
            id: 12,
            title: 'Psalm 23',
            snippet: 'the shepherd image',
            firstReference: { bookId: 19, chapter: 23 },
        };

        // Act
        const link = groupNamed('notes').linkOf(note);

        // Assert
        expect(link).toBe('/analyze?l=19.23&note=12');
    });

    test('link a note with no anchor to the editor alone', () => {
        // Arrange — a note with no reference is legal and lives in the notes
        // panel's unreferenced list, which is the same in every chapter.
        const note = { id: 4, title: 'Standalone', snippet: '', firstReference: null };

        // Act
        const link = groupNamed('notes').linkOf(note);

        // Assert — no ?l=, so Analyze defaults its panels and still opens it.
        expect(link).toBe('/analyze?note=4');
    });

    test('name an untitled note rather than rendering a blank row', () => {
        expect(groupNamed('notes').titleOf({ id: 1, title: '' })).toBe('Untitled note');
    });
});

describe('idea results', () => {
    test('link to the tree, opened on the topic the idea is filed under', () => {
        // Arrange
        const idea = { id: 7, title: 'Shepherd imagery', topics: [{ id: 3, name: 'Care' }] };

        // Act
        const link = groupNamed('ideas').linkOf(idea);

        // Assert
        expect(link).toBe('/topics-tree?topic=3&idea=7');
    });

    test('link an idea filed under several through the first of them', () => {
        // Arrange
        const idea = {
            id: 7,
            title: 'Shepherd imagery',
            topics: [{ id: 3, name: 'Care' }, { id: 9, name: 'Kingship' }],
        };

        // Act / Assert
        expect(groupNamed('ideas').linkOf(idea)).toBe('/topics-tree?topic=3&idea=7');
    });

    test('link an unfiled idea to the tree without a topic', () => {
        // Arrange — an idea under no topic sits in the unfiled bucket, which is
        // the only place in the tree it can be reached from.
        const idea = { id: 7, title: 'Shepherd imagery', topics: [] };

        // Act / Assert
        expect(groupNamed('ideas').linkOf(idea)).toBe('/topics-tree?idea=7');
    });
});

describe('topic results', () => {
    test('link to the tree, opened on the topic', () => {
        expect(groupNamed('topics').linkOf({ id: 3, name: 'Care' })).toBe('/topics-tree?topic=3');
    });
});

describe('scripture results', () => {
    const verse = {
        bookId: 19,
        bookName: 'Psalms',
        chapter: 23,
        verse: 1,
        verseIndex: 14237,
        snippet: 'Yahweh is my shepherd',
    };

    test('link to the left scripture panel on that chapter', () => {
        // The panel renders a chapter at a time, so a verse-level link would
        // promise a precision the destination does not have.
        expect(groupNamed('scripture').linkOf(verse)).toBe('/analyze?l=19.23');
    });

    test('read as a reference', () => {
        expect(groupNamed('scripture').titleOf(verse)).toBe('Psalms 23:1');
    });

    test('key on verse_index, which every verse has and no two share', () => {
        expect(groupNamed('scripture').keyOf(verse)).toBe(14237);
    });
});

describe('reading a payload', () => {
    test('fill in a group the server left out', () => {
        // Arrange
        const payload = { notes: [{ id: 1 }] };

        // Act
        const results = resultsFrom(payload);

        // Assert
        expect(results).toEqual({ notes: [{ id: 1 }], ideas: [], topics: [], scripture: [] });
    });

    test('reject a group that is not a list', () => {
        // Arrange — a boundary defends itself; the render below it should not
        // have to.
        const payload = { notes: 'everything', ideas: null };

        // Act / Assert
        expect(resultsFrom(payload)).toEqual(EMPTY_RESULTS);
    });

    test('count every group', () => {
        // Arrange
        const results = resultsFrom({
            notes: [{ id: 1 }, { id: 2 }],
            ideas: [{ id: 3 }],
            topics: [],
            scripture: [{ verseIndex: 1 }],
        });

        // Act / Assert
        expect(totalResults(results)).toBe(4);
    });
});
