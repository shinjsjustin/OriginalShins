import { useCallback, useEffect, useRef } from 'react';

// The search result, applied to the drawing the way the hover highlight is:
// two attributes and a CSS rule, never a prop.
//
// ── Why this is not a prop on TierArcs ─────────────────────────────────────
//
// Passing the matched set down would be the obvious thing, and it would work.
// What it costs is the memo: TierArcs and TierStems exist to be reconciled
// once, when a payload lands, and a new prop on every settled keystroke
// re-reconciles a few thousand paths and lines whose `d`, `x1` and `y1` have
// not changed. The page already declined that trade for the hover highlight
// and for the whole of pan and zoom; a search box is not the place to start
// paying it.
//
// So the same mechanism is reused exactly: `data-searching` on the <svg> turns
// every arc and stem down, `data-match` on the ones that matched turns those
// back up, and CSS resolves the rest. The two attribute names are new because
// the two states are independent — a reader can hover a chain while a search
// is running, and hover has to win for the chain under the pointer without
// the search forgetting what it matched. See the highlight section of
// Overview.css for the order that gives.
//
// ── Why the write is per rail and not per group ────────────────────────────
//
// A query of one letter matches nearly everything, and one querySelectorAll
// per matched group would then be a few thousand selector runs on a keystroke.
// Asking each drawn rail once for everything it carries and testing membership
// against a Set bounds the work at three queries and one pass over the
// elements, whatever the query matched.
//
// The previously marked elements are remembered, so clearing a search is a
// loop over what was lit rather than a query over what was not.
//
// ── Why `drawing` is a dependency ──────────────────────────────────────────
//
// The attributes go onto elements React owns, so they have to be written after
// React has put those elements in the tree — and the tree changes for reasons
// that have nothing to do with the query: a payload lands, a rail is toggled
// back on. Depending on the geometry as well as on the matches is what makes a
// rail switched on during a search arrive already filtered instead of arriving
// at full strength.

/**
 * @param matches buildMatches' answer: { byRail, count } or null for no search
 * @param drawing the geometry currently rendered, so the write follows any
 *                change to what is in the tree
 * @returns { attachSvg } — the <svg> to scope the queries to
 */
const useArcSearch = ({ matches, drawing }) => {
    const svgRef = useRef(null);
    const markedRef = useRef([]);

    const apply = useCallback(() => {
        const root = svgRef.current;

        markedRef.current.forEach(element => element.removeAttribute('data-match'));
        markedRef.current = [];

        if (!root) return;

        if (matches === null) {
            root.removeAttribute('data-searching');
            return;
        }

        const marked = [];

        matches.byRail.forEach((groupIds, rail) => {
            if (groupIds.size === 0) return;

            root.querySelectorAll(`[data-rail="${rail}"] [data-group-id]`).forEach(element => {
                if (!groupIds.has(Number(element.getAttribute('data-group-id')))) return;

                element.setAttribute('data-match', '');
                marked.push(element);
            });
        });

        markedRef.current = marked;
        // Set even when nothing matched: a search that finds nothing dims the
        // whole diagram, which is the honest answer, and the status line beside
        // the box is what stops it reading as a page that has broken.
        root.setAttribute('data-searching', '');
    }, [matches]);

    // ── Why this callback must not depend on `apply` ───────────────────────
    //
    // React calls a callback ref with null and then with the node again every
    // time the callback's IDENTITY changes. Closing over `apply` would give it
    // a new identity per settled keystroke, and Overview.js composes this ref
    // with three others onto one <svg> — so a search would detach and reattach
    // the element from every hook that holds it, taking usePanZoom's wheel
    // listener off and putting it back on, and clearing this hook's record of
    // what it had marked while the marks themselves stayed on the elements.
    // The first search would then leave its highlight behind for the next one
    // to add to.
    //
    // So the ref does nothing but record the node — and clear up after itself
    // on the way out, which is the one moment the elements are still in hand.
    // The effect below is what applies anything.
    const attachSvg = useCallback((node) => {
        markedRef.current.forEach(element => element.removeAttribute('data-match'));
        markedRef.current = [];
        svgRef.current = node;
    }, []);

    // Runs after the ref has been set on mount, and again whenever either the
    // matches or the geometry beneath them changes.
    useEffect(() => { apply(); }, [apply, drawing]);

    return { attachSvg };
};

export default useArcSearch;
