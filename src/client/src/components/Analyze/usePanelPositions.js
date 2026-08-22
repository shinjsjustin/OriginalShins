import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PRIMARY_PARAM, COMPARE_PARAM } from './panelParams';
import {
    DEFAULT_PRIMARY,
    DEFAULT_COMPARE,
    formatPosition,
    parsePosition,
} from './navigation';

// Query params holding each scripture panel's position, e.g.
// /analyze?l=40.5&r=45.5 — named in panelParams.js, which the link builders in
// analyzeUrl.js read too, so a page linking here and this hook reading the URL
// cannot disagree about what the params are called.
export { PRIMARY_PARAM, COMPARE_PARAM };

// The URL is the single source of truth for where both scripture panels are
// pointed. Keeping it there — rather than in component state — is what makes
// the back button, reload and shared links all work without extra plumbing.
//
// `primary` is the centre panel: the passage under study, and the one the notes
// panel follows. `compare` is the side panel, a second passage read against it,
// independent by construction.
//
// `books` is needed to validate a position: a param naming a book that does not
// exist, or a chapter past the end of one, resolves the way an absent param
// does — see useRememberedPosition below.
//
// `isDeferred` holds the normalization below — and only that; the positions are
// read and reported throughout. The Analyze page passes its restore's
// `isRestoring`, because that restore writes the same two params from the
// reader's saved location. Both writing in one pass would leave whichever ran
// last in charge, and the defaults would win a race they have no business
// entering.

// One panel's position, read from the URL and remembered across a URL that
// stops saying where it is.
//
// A missing param falls back to where the panel already was, and only a panel
// that has never been anywhere falls back to its default. That distinction is
// what keeps the page from resetting itself: the Navbar's Analyze button
// navigates to a bare /analyze, and pressing it while already here drops both
// params without unmounting the page — so the restore, which runs once on
// arrival, is not there to answer, and the defaults would otherwise walk in.
// Nobody asked to be sent to Genesis 1 by pressing the button for the page they
// are on. The same holds for a link that pins one panel and leaves the other,
// which is how every link into this page is built.
//
// The remembered position lags one commit behind on purpose — it is written
// after each render, so during the render where the param goes missing it still
// holds the last place the panel was actually pointed at.
const useRememberedPosition = (value, books, defaultPosition) => {
    const lastRef = useRef(null);
    const position = parsePosition(value, books, lastRef.current || defaultPosition);

    useEffect(() => {
        lastRef.current = position;
    });

    return position;
};

const usePanelPositions = (books, isDeferred = false) => {
    const [searchParams, setSearchParams] = useSearchParams();

    const primary = useRememberedPosition(searchParams.get(PRIMARY_PARAM), books, DEFAULT_PRIMARY);
    const compare = useRememberedPosition(searchParams.get(COMPARE_PARAM), books, DEFAULT_COMPARE);

    const primaryValue = formatPosition(primary);
    const compareValue = formatPosition(compare);

    // Write the resolved positions back once the canon is known, so that a bare
    // /analyze — or one carrying a stale or malformed param — becomes a URL that
    // can be copied and shared. Replaces rather than pushes: normalizing is not
    // a navigation the back button should have to walk through.
    useEffect(() => {
        if (isDeferred) return;
        if (books.length === 0) return;

        const isNormalized = searchParams.get(PRIMARY_PARAM) === primaryValue
            && searchParams.get(COMPARE_PARAM) === compareValue;
        if (isNormalized) return;

        const next = new URLSearchParams(searchParams);
        next.set(PRIMARY_PARAM, primaryValue);
        next.set(COMPARE_PARAM, compareValue);
        setSearchParams(next, { replace: true });
    }, [isDeferred, books.length, searchParams, primaryValue, compareValue, setSearchParams]);

    // Each move pushes a history entry, so stepping through chapters is
    // reversible with the back button.
    const setPosition = useCallback((param, position) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set(param, formatPosition(position));
            return next;
        });
    }, [setSearchParams]);

    const setPrimary = useCallback(
        position => setPosition(PRIMARY_PARAM, position),
        [setPosition]
    );
    const setCompare = useCallback(
        position => setPosition(COMPARE_PARAM, position),
        [setPosition]
    );

    return { primary, compare, setPrimary, setCompare };
};

export default usePanelPositions;
