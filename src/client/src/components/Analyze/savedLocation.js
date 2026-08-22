// The Analyze page's saved location, as data.
//
// A *location* is where the page reopens: the primary passage, the compare
// passage, and the note the editor was left on. It is exactly the page's three
// query params in object form, because the URL is where this page keeps its
// state — so saving a location is parking that state between visits, and
// restoring one is putting it back.
//
// Everything here is pure. Nothing reads the canon, the router or the network,
// so the rules about what a saved location may contain and how it becomes a
// query string are testable on their own — which matters, because the hooks
// that use them (useSavedLocation.js) are all timing.

import { PRIMARY_PARAM, COMPARE_PARAM, NOTE_PARAM } from './panelParams';
import { formatPosition } from './navigation';

// The endpoint, relative to REACT_APP_URL. It hangs off /user rather than a
// mount of its own because a location is a property of the reader, like their
// name, and there is exactly one.
export const LOCATION_PATH = '/user/location';

// The three params that say where the page is. Any one of them present means
// the URL is making a claim, and a saved location must not overrule it: a link
// someone shared, or a bookmark, is a deliberate instruction about where to
// open, and the saved place is only a default for when there is none.
const LOCATION_PARAMS = [PRIMARY_PARAM, COMPARE_PARAM, NOTE_PARAM];

export const hasLocationParams = (searchParams) =>
    LOCATION_PARAMS.some(param => searchParams.has(param));

// A positive integer, or null for anything else — including the strings and
// nulls a JSON body legitimately carries. The server validates on the way in;
// this is the same rule applied on the way out, because a response is external
// data whatever wrote it.
const toPositiveInt = (value) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

// A position is its two numbers or it is nothing. Half a pair is not somewhere
// a panel can be pointed, so it reads as absent rather than as something the
// page would have to finish guessing at.
const toPosition = (value) => {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const bookId = toPositiveInt(value.bookId);
    const chapter = toPositiveInt(value.chapter);

    return bookId && chapter ? { bookId, chapter } : null;
};

/**
 * The `location` from GET /user/location, or null if it names nowhere.
 *
 * Null covers three cases that all mean the same thing to the caller — a
 * response that is not a location, a reader who has never saved one, and one
 * whose every field failed validation — because the answer to each is
 * identical: leave the URL alone and let the panels open at their defaults.
 */
export const parseSavedLocation = (payload) => {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const location = {
        primary: toPosition(payload.primary),
        compare: toPosition(payload.compare),
        noteId: toPositiveInt(payload.noteId),
    };

    const namesSomewhere = location.primary || location.compare || location.noteId;
    return namesSomewhere ? location : null;
};

/**
 * `location` as a query string, merged onto the params the URL already carries.
 *
 * Merged rather than replacing, so that anything else in the URL survives being
 * sent back to where the reader was. A closed editor *deletes* the note param
 * rather than omitting it, since the base may carry one.
 */
export const toSearchParams = (location, searchParams) => {
    const next = new URLSearchParams(searchParams);

    if (location.primary) {
        next.set(PRIMARY_PARAM, formatPosition(location.primary));
    }
    if (location.compare) {
        next.set(COMPARE_PARAM, formatPosition(location.compare));
    }

    if (location.noteId) {
        next.set(NOTE_PARAM, String(location.noteId));
    } else {
        next.delete(NOTE_PARAM);
    }

    return next;
};

/**
 * The body PUT /user/location takes.
 *
 * The positions are rebuilt field by field rather than spread, so whatever else
 * a panel position may grow does not silently become part of the API. Absent
 * halves are sent as explicit nulls: this is a snapshot and not a patch, and
 * "the editor is closed" has to be sayable.
 */
export const toPayload = ({ primary, compare, noteId }) => ({
    primary: primary ? { bookId: primary.bookId, chapter: primary.chapter } : null,
    compare: compare ? { bookId: compare.bookId, chapter: compare.chapter } : null,
    noteId: noteId || null,
});

/**
 * A location as one comparable string.
 *
 * The page rebuilds its position objects on every render, so identity says
 * nothing about whether the reader has moved. This does, and it is what keeps a
 * re-render from being a request.
 */
export const locationKey = ({ primary, compare, noteId }) => [
    primary ? formatPosition(primary) : '',
    compare ? formatPosition(compare) : '',
    noteId || '',
].join('|');
