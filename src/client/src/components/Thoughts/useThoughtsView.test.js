import { IDEA_PARAM, ideaIdFromParams, parseIdeaId } from './useThoughtsView';

// ─── What the view param has to get right ───────────────────────────────────
//
// `?idea=` is the whole of this page's view state, and it is the one piece of
// it that arrives from outside the app: out of a bookmark, out of a link
// somebody pasted, out of the address bar with a finger on the delete key. The
// page has exactly two views and every possible value of the param must land in
// one of them, because the failure mode of "neither" is a canvas with nothing
// drawn and no control that puts anything back.
//
// So the rule is a positive integer or the topics view, and the cases below are
// the ways a value stops being a positive integer without stopping being a
// string: the sign, the decimal point, the exponent, the padding, the empty
// value, the word.

describe('parseIdeaId', () => {
    test('returns the id for a well-formed positive integer', () => {
        expect(parseIdeaId('123')).toBe(123);
    });

    test('returns the id for the smallest legal one', () => {
        expect(parseIdeaId('1')).toBe(1);
    });

    test('returns null when the param is missing', () => {
        // What URLSearchParams.get gives for a param that is not there.
        expect(parseIdeaId(null)).toBeNull();
        expect(parseIdeaId(undefined)).toBeNull();
    });

    test('returns null for a garbage value', () => {
        expect(parseIdeaId('abc')).toBeNull();
        expect(parseIdeaId('12abc')).toBeNull();
        expect(parseIdeaId('idea-3')).toBeNull();
    });

    test('returns null for a negative number', () => {
        expect(parseIdeaId('-1')).toBeNull();
        expect(parseIdeaId('-123')).toBeNull();
    });

    test('returns null for zero, which is not a row id', () => {
        expect(parseIdeaId('0')).toBeNull();
    });

    test('returns null for an empty or whitespace value', () => {
        expect(parseIdeaId('')).toBeNull();
        expect(parseIdeaId('   ')).toBeNull();
        expect(parseIdeaId(' 7 ')).toBeNull();
    });

    test('returns null for numbers that are not plain integers', () => {
        // Number() would happily take all three; the digits-only test is what
        // stops `?idea=1.5` from being served as idea 1.
        expect(parseIdeaId('1.5')).toBeNull();
        expect(parseIdeaId('2e3')).toBeNull();
        expect(parseIdeaId('0x10')).toBeNull();
    });

    test('returns null for a non-string, whatever it is', () => {
        expect(parseIdeaId(123)).toBeNull();
        expect(parseIdeaId({})).toBeNull();
        expect(parseIdeaId([])).toBeNull();
    });
});

describe('ideaIdFromParams', () => {
    test('reads the id off a URL that carries one', () => {
        expect(ideaIdFromParams(new URLSearchParams('?idea=42'))).toBe(42);
    });

    test('is null for a bare /thoughts, which is the topics view', () => {
        expect(ideaIdFromParams(new URLSearchParams(''))).toBeNull();
    });

    test('is null for an unparseable id, so a stale link still shows the page', () => {
        expect(ideaIdFromParams(new URLSearchParams('?idea=abc'))).toBeNull();
        expect(ideaIdFromParams(new URLSearchParams('?idea=-4'))).toBeNull();
        expect(ideaIdFromParams(new URLSearchParams('?idea='))).toBeNull();
    });

    test('ignores params that are not this one', () => {
        const params = new URLSearchParams('?topicId=3&q=faith');
        expect(ideaIdFromParams(params)).toBeNull();
        expect(params.get(IDEA_PARAM)).toBeNull();
    });
});
