import { buildLabels } from './tierLabels';
import { buildMatches, matchesTerm, normalize } from './arcSearch';

// ─── What the search has to get right ───────────────────────────────────────
//
// The plan asks for a filter that dims rather than one that hides, and the
// difference between the two is invisible in this module — both produce a set
// of matches, and only the page decides what to do with the rest. So what is
// asserted here is the half that decides which arcs a reader is being shown:
// that a term names what they would expect it to name, on every rail at once,
// and that an empty box is "no search" rather than "a search for nothing".
//
// That last one is the failure worth guarding. A term matching nothing dims the
// whole diagram, which is correct; an EMPTY term doing the same would blank the
// page every time a reader cleared the box, and there is no visible difference
// between the two until it happens.

const BOOKS = [
    { id: 1, name: 'Genesis', chapterCount: 50, canonicalOrder: 1 },
    { id: 45, name: 'Romans', chapterCount: 16, canonicalOrder: 45 },
];

const reference = (anchor) => [anchor, 45, 5, 1, 5];

// The labels one rail carries, in the [groupId, title, references] shape the
// payload ships and buildLabels reads — the same map Overview.js hands over,
// rather than a hand-written stand-in that could drift from it.
const railLabels = (rail, rows) =>
    buildLabels(rows.map(([id, title]) => [id, title, [reference(id)]]), BOOKS, rail);

const LABELS = new Map([
    ['notes', railLabels('notes', [
        [9, 'Justified by faith'],
        [11, 'The first day'],
        [14, 'A thread through the canon'],
    ])],
    ['ideas', railLabels('ideas', [
        [3, 'Faith as a thread'],
        [4, 'Creation'],
    ])],
    ['topics', railLabels('topics', [
        [1, 'Faith'],
    ])],
]);

const matchedIds = (matches, rail) => [...matches.byRail.get(rail)].sort((a, b) => a - b);

describe('normalizing a term', () => {
    test('folds case and trims, so a stray space is not a different search', () => {
        expect(normalize('  FAITH ')).toBe('faith');
    });

    test('treats a non-string as nothing at all', () => {
        expect(normalize(undefined)).toBe('');
    });
});

describe('matching one title', () => {
    test('matches a substring anywhere in the title, not just the start', () => {
        expect(matchesTerm('Justified by faith', 'faith')).toBe(true);
    });

    test('matches regardless of the case the reader typed', () => {
        expect(matchesTerm('Justified by FAITH', 'faith')).toBe(true);
    });

    test('does not match a title that does not contain the term', () => {
        expect(matchesTerm('The first day', 'faith')).toBe(false);
    });

    test('treats a group with no title of its own as its fallback name', () => {
        // buildLabels has already substituted "Untitled note", which is what a
        // reader sees and therefore what they can search for.
        const labels = railLabels('notes', [[7, '']]);

        expect(matchesTerm(labels.get(7).title, 'untitled')).toBe(true);
    });
});

describe('building the match set', () => {
    test('says no search is running for an empty box', () => {
        expect(buildMatches(LABELS, '')).toBeNull();
    });

    test('says the same for a box holding nothing but spaces', () => {
        // The visible difference between this and a term matching nothing is
        // the entire diagram: one leaves it alone, the other dims all of it.
        expect(buildMatches(LABELS, '   ')).toBeNull();
    });

    test('names every group whose title contains the term, on every rail', () => {
        // Arrange / Act
        const matches = buildMatches(LABELS, 'faith');

        // Assert — the notes rail's "Justified by faith", the ideas rail's
        // "Faith as a thread" and the topic "Faith", each matched on its own
        // title rather than through the links between them.
        expect(matchedIds(matches, 'notes')).toEqual([9]);
        expect(matchedIds(matches, 'ideas')).toEqual([3]);
        expect(matchedIds(matches, 'topics')).toEqual([1]);
    });

    test('leaves a rail with no match present but empty, not missing', () => {
        // Arrange / Act
        const matches = buildMatches(LABELS, 'creation');

        // Assert: the page dims every drawn rail, so every drawn rail has to
        // have an answer — a missing key would leave that rail undimmed.
        expect(matchedIds(matches, 'notes')).toEqual([]);
        expect(matches.byRail.has('topics')).toBe(true);
    });

    test('counts what matched against what is on the page', () => {
        // Arrange / Act
        const matches = buildMatches(LABELS, 'faith');

        // Assert
        expect(matches.count).toBe(3);
        expect(matches.total).toBe(6);
    });

    test('counts nothing, over everything, for a term that names nothing', () => {
        // Arrange / Act
        const matches = buildMatches(LABELS, 'zzz');

        // Assert — not null: this IS a search, and it found nothing.
        expect(matches.count).toBe(0);
        expect(matches.total).toBe(6);
    });

    test('counts only the rails that are loaded, which are the rails drawn', () => {
        // Arrange: the reader has switched two rails off, so the payload
        // carried one tier and the other two have no labels.
        const oneRail = new Map([['notes', LABELS.get('notes')]]);

        // Act
        const matches = buildMatches(oneRail, 'faith');

        // Assert: "1 of 3" is a statement about the picture on screen, not
        // about the corpus behind it.
        expect(matches.count).toBe(1);
        expect(matches.total).toBe(3);
    });

    test('carries the normalized term, for the line that reports the search', () => {
        expect(buildMatches(LABELS, '  Faith ').term).toBe('faith');
    });

    test('narrows as more of a word is typed', () => {
        // Arrange / Act — the property that makes this a filter rather than a
        // search: every keystroke can only take matches away.
        const broad = buildMatches(LABELS, 'f');
        const narrow = buildMatches(LABELS, 'fai');

        // Assert
        expect(narrow.count).toBeLessThan(broad.count);
        expect(matchedIds(narrow, 'ideas').every(id => matchedIds(broad, 'ideas').includes(id)))
            .toBe(true);
    });
});
