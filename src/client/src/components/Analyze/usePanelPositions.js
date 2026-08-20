import { useCallback, useEffect } from 'react';
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
// exist, or a chapter past the end of one, resolves to the panel's default.
const usePanelPositions = (books) => {
    const [searchParams, setSearchParams] = useSearchParams();

    const primary = parsePosition(searchParams.get(PRIMARY_PARAM), books, DEFAULT_PRIMARY);
    const compare = parsePosition(searchParams.get(COMPARE_PARAM), books, DEFAULT_COMPARE);

    const primaryValue = formatPosition(primary);
    const compareValue = formatPosition(compare);

    // Write the resolved positions back once the canon is known, so that a bare
    // /analyze — or one carrying a stale or malformed param — becomes a URL that
    // can be copied and shared. Replaces rather than pushes: normalizing is not
    // a navigation the back button should have to walk through.
    useEffect(() => {
        if (books.length === 0) return;

        const isNormalized = searchParams.get(PRIMARY_PARAM) === primaryValue
            && searchParams.get(COMPARE_PARAM) === compareValue;
        if (isNormalized) return;

        const next = new URLSearchParams(searchParams);
        next.set(PRIMARY_PARAM, primaryValue);
        next.set(COMPARE_PARAM, compareValue);
        setSearchParams(next, { replace: true });
    }, [books.length, searchParams, primaryValue, compareValue, setSearchParams]);

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
