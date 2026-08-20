import React, { useCallback, useEffect, useRef, useState } from 'react';
import useDebouncedValue from '../Search/useDebouncedValue';

// The box that narrows the diagram to the arcs whose group is called something.
//
// ── Why the URL is the authority and this only types into it ───────────────
//
// Which rails are drawn and which topic the page is restricted to already live
// in the query string, and the search term joins them for the same reasons: a
// reload keeps it, and "look at this, topics only, everything I called
// covenant" is a link rather than a list of instructions. So there is exactly
// one thing that decides what is dimmed, and it is `?q=`, not a value held in
// here.
//
// What IS held in here is the text of the box, and only because a controlled
// input has to have one. It is the URL's value at mount, it leads the URL by a
// debounce while a burst of typing settles, and it adopts the URL again the
// moment the URL changes for a reason that is not this component — a link
// arriving with ?q=, or the back button unwinding a rail toggle to an entry
// that carried a different term.
//
// ── Why the debounce is on the write and not on the match ──────────────────
//
// Two things happen per keystroke if nothing is debounced: a history entry is
// replaced, and the whole drawing is re-marked. The second is affordable — it
// is three selector runs (see useArcSearch) — but the first is not: browsers
// rate-limit replaceState, and a search box is precisely the control that would
// find the limit. So the box is instant, the URL settles, and everything
// downstream of the URL settles with it.
//
// ── Why the term is replaced into history, not pushed ──────────────────────
//
// A rail toggle pushes, because unticking a box is a thing the reader did and
// the back button should undo it. Typing is not one thing: pushing per burst
// would bury the previous page under one entry per word, and the reader who
// searched and then wanted to leave would press back eight times to get out.
// See useOverviewParams for the write itself.

// Long enough to swallow a burst of typing, short enough that a reader who
// stops to look has already been answered. The same order as /search's own
// debounce, which is protecting a network request rather than a history entry.
export const SEARCH_DEBOUNCE_MS = 200;

const statusOf = (matches) => {
    if (matches === null) return '';
    if (matches.count === 0) {
        return `Nothing on the diagram is called “${matches.term}”.`;
    }

    return `${matches.count} of ${matches.total} highlighted; the rest are dimmed, not hidden.`;
};

const OverviewSearch = ({ query, matches, onQueryChange }) => {
    const [text, setText] = useState(query);
    const settled = useDebouncedValue(text, SEARCH_DEBOUNCE_MS);
    // The last term this component and the URL agreed on, which is what tells
    // "the reader typed" apart from "the URL changed underneath us". Without
    // it the two effects below feed each other.
    const agreedRef = useRef(query);

    useEffect(() => {
        if (settled === agreedRef.current) return;

        agreedRef.current = settled;
        onQueryChange(settled);
    }, [settled, onQueryChange]);

    useEffect(() => {
        if (query === agreedRef.current) return;

        agreedRef.current = query;
        setText(query);
    }, [query]);

    const handleChange = useCallback((event) => setText(event.target.value), []);

    return (
        <div className="overview-search">
            <label className="overview-search-label" htmlFor="overview-search-input">
                Filter by title
            </label>
            <input
                id="overview-search-input"
                className="overview-search-input"
                type="search"
                value={text}
                onChange={handleChange}
                placeholder="e.g. faith"
                autoComplete="off"
                aria-describedby="overview-search-status"
            />
            {/* Announced rather than focused, so typing is never interrupted —
                and load-bearing rather than decorative: a term matching nothing
                dims every arc on the page, which is the correct answer and
                looks exactly like a page that has lost its data. This is the
                line that says which of the two it is. */}
            <p className="overview-search-status" id="overview-search-status" role="status">
                {statusOf(matches)}
            </p>
        </div>
    );
};

export default React.memo(OverviewSearch);
