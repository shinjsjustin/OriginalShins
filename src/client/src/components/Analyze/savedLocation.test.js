import {
    hasLocationParams,
    parseSavedLocation,
    toSearchParams,
    toPayload,
    locationKey,
} from './savedLocation';

const params = (search) => new URLSearchParams(search);

describe('hasLocationParams', () => {
    test('is false for a bare /analyze', () => {
        expect(hasLocationParams(params(''))).toBe(false);
    });

    test('is true when the URL positions a panel', () => {
        expect(hasLocationParams(params('l=43.15'))).toBe(true);
        expect(hasLocationParams(params('r=1.1'))).toBe(true);
    });

    test('is true when the URL names a note but no passage', () => {
        expect(hasLocationParams(params('note=12'))).toBe(true);
    });

    test('ignores params that say nothing about where the page is', () => {
        expect(hasLocationParams(params('utm_source=email'))).toBe(false);
    });
});

describe('parseSavedLocation', () => {
    test('reads a complete location', () => {
        const location = parseSavedLocation({
            primary: { bookId: 45, chapter: 8 },
            compare: { bookId: 1, chapter: 3 },
            noteId: 12,
        });

        expect(location).toEqual({
            primary: { bookId: 45, chapter: 8 },
            compare: { bookId: 1, chapter: 3 },
            noteId: 12,
        });
    });

    test('returns null when nothing has been saved yet', () => {
        expect(parseSavedLocation({ primary: null, compare: null, noteId: null })).toBeNull();
    });

    test('returns null for a body that is not a location', () => {
        expect(parseSavedLocation(null)).toBeNull();
        expect(parseSavedLocation('somewhere')).toBeNull();
    });

    test('drops a position that is not a pair of positive integers', () => {
        const location = parseSavedLocation({
            primary: { bookId: 45, chapter: 0 },
            compare: { bookId: 1, chapter: 3 },
            noteId: null,
        });

        expect(location).toEqual({
            primary: null,
            compare: { bookId: 1, chapter: 3 },
            noteId: null,
        });
    });

    test('keeps a location that only names a note', () => {
        expect(parseSavedLocation({ primary: null, compare: null, noteId: 7 }))
            .toEqual({ primary: null, compare: null, noteId: 7 });
    });
});

describe('toSearchParams', () => {
    test('writes both panel positions and the open note', () => {
        const next = toSearchParams(
            { primary: { bookId: 45, chapter: 8 }, compare: { bookId: 1, chapter: 3 }, noteId: 12 },
            params('')
        );

        expect(next.get('l')).toBe('45.8');
        expect(next.get('r')).toBe('1.3');
        expect(next.get('note')).toBe('12');
    });

    test('leaves out the note param when the editor was closed', () => {
        const next = toSearchParams(
            { primary: { bookId: 45, chapter: 8 }, compare: null, noteId: null },
            params('note=99')
        );

        expect(next.has('note')).toBe(false);
        expect(next.has('r')).toBe(false);
    });

    test('keeps params it knows nothing about', () => {
        const next = toSearchParams(
            { primary: { bookId: 45, chapter: 8 }, compare: null, noteId: null },
            params('utm_source=email')
        );

        expect(next.get('utm_source')).toBe('email');
    });
});

describe('toPayload', () => {
    test('sends the two positions and the note id, and nothing else', () => {
        expect(toPayload({
            primary: { bookId: 45, chapter: 8, extra: 'ignored' },
            compare: { bookId: 1, chapter: 3 },
            noteId: 12,
        })).toEqual({
            primary: { bookId: 45, chapter: 8 },
            compare: { bookId: 1, chapter: 3 },
            noteId: 12,
        });
    });

    test('says null rather than omitting what is not there', () => {
        expect(toPayload({ primary: null, compare: null, noteId: null })).toEqual({
            primary: null,
            compare: null,
            noteId: null,
        });
    });
});

describe('locationKey', () => {
    test('is equal for two locations saying the same thing', () => {
        const a = { primary: { bookId: 45, chapter: 8 }, compare: null, noteId: 12 };
        const b = { primary: { bookId: 45, chapter: 8 }, compare: null, noteId: 12 };

        expect(locationKey(a)).toBe(locationKey(b));
    });

    test('changes when any one part of the location moves', () => {
        const base = { primary: { bookId: 45, chapter: 8 }, compare: { bookId: 1, chapter: 3 }, noteId: 12 };

        expect(locationKey({ ...base, primary: { bookId: 45, chapter: 9 } })).not.toBe(locationKey(base));
        expect(locationKey({ ...base, compare: { bookId: 1, chapter: 4 } })).not.toBe(locationKey(base));
        expect(locationKey({ ...base, noteId: null })).not.toBe(locationKey(base));
    });
});
