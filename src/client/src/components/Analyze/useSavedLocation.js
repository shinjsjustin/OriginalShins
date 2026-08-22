import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchJson } from '../../config/api';
import {
    LOCATION_PATH,
    hasLocationParams,
    parseSavedLocation,
    toSearchParams,
    toPayload,
    locationKey,
} from './savedLocation';

// Reading the Analyze page's saved location on arrival, and writing it as the
// reader moves.
//
// The page's state is its query string, which is what makes a link to a passage
// worth sending someone — and what makes a bare /analyze know nothing. These
// two hooks are the page's memory of itself. They are separate rather than one
// because the restore has to finish *before* the page decides what its panels
// are pointed at, and the record only runs once that has been decided; a single
// hook would have to take its own output as an argument.
//
// The whole feature is a convenience. Nothing here reports a failure to the
// reader, because there is nothing a reader could do about one and the fallback
// — the page opens at Genesis 1, as it always did — is not a broken page.

/**
 * Sends the page back where it was left, when the URL does not say otherwise.
 *
 * Returns `{ isRestoring }`, which is true from mount until the question is
 * settled one way or the other. The caller must hold off anything that writes
 * the query string while it is true — usePanelPositions normalizes a bare URL
 * into a shareable one, and the two writing in the same pass would leave
 * whichever ran last in charge.
 */
export const useRestoreLocation = () => {
    const [searchParams, setSearchParams] = useSearchParams();

    // Both read once, at mount. The restore below writes the query string
    // itself, so a hook re-reading it afterwards would be reading its own
    // handwriting and conclude the URL had named a place all along.
    const urlNamesLocation = useRef(hasLocationParams(searchParams)).current;
    const initialParams = useRef(searchParams).current;

    const [isRestoring, setIsRestoring] = useState(!urlNamesLocation);

    // The location waiting to be applied. Held in state between the two effects
    // rather than applied where it arrives, so that the fetch depends only on a
    // constant and runs exactly once: react-router rebuilds `setSearchParams`
    // whenever the URL changes, and an effect depending on it would abort its
    // own request the first time a panel moved.
    const [pending, setPending] = useState(null);

    useEffect(() => {
        if (urlNamesLocation) return undefined;

        const controller = new AbortController();

        fetchJson(LOCATION_PATH, { signal: controller.signal })
            .then(data => {
                const location = parseSavedLocation(data && data.location);
                if (location) {
                    setPending(location);
                } else {
                    // Nowhere to go back to: a new account, or a reader who has
                    // not moved yet. Release the page at its defaults.
                    setIsRestoring(false);
                }
            })
            .catch(err => {
                // An abort is not an answer. It means either that the page has
                // gone — nobody left to release — or that StrictMode is running
                // this effect a second time, and a second request is already on
                // its way; treating it as "no saved place" would release the URL
                // to the normalizer while that request was still in flight.
                if (err.name === 'AbortError') return;

                // Anything else: a location that cannot be read is a
                // convenience lost, not a page broken. Open at the defaults.
                setIsRestoring(false);
            });

        return () => controller.abort();
    }, [urlNamesLocation]);

    useEffect(() => {
        if (!pending) return;

        setSearchParams(toSearchParams(pending, initialParams), { replace: true });
        setPending(null);

        // Only now. `isRestoring` is what holds the URL still for the write
        // above, so releasing it any earlier would let the normalizer put the
        // defaults back in the same pass.
        setIsRestoring(false);
    }, [pending, initialParams, setSearchParams]);

    return { isRestoring };
};

/**
 * Saves where the page is, each time it changes.
 *
 * One request per move — per arrow press, per jump from a picker, per note
 * opened. Nothing is batched or held back: a saved place the reader cannot
 * count on is worse than none, and the request is small next to the chapter
 * fetch the same move already sets off.
 *
 * `isPaused` covers everything that has to finish before the page is showing a
 * real place: the restore, and the canon load behind it. Until the catalog is
 * in, every position reads as its default whatever the URL says — a position is
 * only validated against the books it names — so an unpaused pass before then
 * would take Genesis 1 for the reader's answer.
 */
export const useRecordLocation = ({ primary, compare, noteId, isPaused }) => {
    const key = locationKey({ primary, compare, noteId });

    // The location behind `key`, for the effect below and for the flush on the
    // way out. A ref rather than a dependency because both fire on the key
    // rather than on the objects, which this page rebuilds every render. Kept
    // up to date after each commit, and declared before the effects that read
    // it so it is already current when they run.
    const locationRef = useRef(null);
    useEffect(() => {
        locationRef.current = { primary, compare, noteId };
    });

    // What the server has been told. Null means "not yet established": the
    // first unpaused pass seeds it instead of saving, because at that moment
    // the page is showing either what was just restored — which the server
    // already has — or what a link asked for, which is not yet this reader's
    // place. Either way there is nothing new to record until the reader moves.
    const savedKeyRef = useRef(null);

    useEffect(() => {
        if (isPaused) return;

        if (savedKeyRef.current === null) {
            savedKeyRef.current = key;
            return;
        }

        if (key === savedKeyRef.current) return;

        const previousKey = savedKeyRef.current;
        savedKeyRef.current = key;

        fetchJson(LOCATION_PATH, { method: 'PUT', body: toPayload(locationRef.current) })
            .catch(() => {
                // Put back what the server is known to hold, so the next move
                // is a fresh attempt rather than a save skipped as redundant.
                // Not surfaced: a reader cannot act on this, and the cost of it
                // failing every time is one page opening where it always used
                // to open.
                savedKeyRef.current = previousKey;
            });
    }, [key, isPaused]);

    // The backstop, not the mechanism: every move above is already on its way
    // out when it happens. This covers the one pass the effect cannot — a
    // position committed and then unmounted before the effect for it ran.
    useEffect(() => () => {
        const pending = locationRef.current;
        if (!pending || savedKeyRef.current === null) return;

        const pendingKey = locationKey(pending);
        if (pendingKey === savedKeyRef.current) return;

        savedKeyRef.current = pendingKey;
        fetchJson(LOCATION_PATH, { method: 'PUT', body: toPayload(pending) })
            .catch(() => {
                // The page is gone; there is nothing left to retry into.
            });
    }, []);
};
