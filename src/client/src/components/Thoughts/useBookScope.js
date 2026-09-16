import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchJson } from '../../config/api';
import { BOOK_PARAM, IDEA_PARAM, bookIdFromParams, parseBookId } from './useThoughtsView';
// The endpoint is spelled once, in the module that owns the saved location —
// this hook is a second reader of it, not a second definition.
import { LOCATION_PATH } from '../Analyze/savedLocation';

// Which book's topics the page is showing.
//
// ── Four sources, in priority order ───────────────────────────────────────
//
//   1. `?book=` in the URL          present -> resolved instantly, no request
//   2. the open idea's own bookId   `?idea=123` with no `?book=`
//   3. last_primary_book_id         a bare /thoughts
//   4. Genesis                      a new account, or the location read fails
//
// Source 2 also OVERRIDES source 1 when the two disagree — see `adoptIdeaBook`
// at the foot of this file.
//
// Two of them are asynchronous, which is the whole reason this is a hook and
// not a line in useThoughtsView. Until the question is settled the page has no
// scope, and a fetch issued before then would fetch the wrong book's topics
// and then immediately fetch again.
//
// ── Why `isResolving` exists ──────────────────────────────────────────────
//
// It is useRestoreLocation's `isRestoring` applied a second time, for the same
// reason its comment gives: two things writing the query string in one pass
// leave whichever ran last in charge. Here the collision would be the seed and
// the reader's own pick racing on entry. useThoughtsData holds its fetches
// until this goes false.
//
// ── Why sources 2 and 3 replace rather than push ──────────────────────────
//
// The scope was seeded, not chosen. A history entry for a value the reader
// never picked is a back button that steps through somebody else's decision.
//
// ── Why `showBook` ALSO replaces, unlike showIdea ─────────────────────────
//
// This is the one place the page diverges from its sibling, and it is on
// purpose. The scope is not a place the reader navigated to: every entry to
// this page writes a `?book=` of its own (see the effect below), so a pushed
// entry per pick would fill the history with the page's own handwriting and
// leave back stepping through book picks instead of leaving the page. The
// picker is the title block, always one press away, so nothing is lost by
// keeping back for pages.

// Where the Analyze page opens for a reader who has been nowhere, so it is
// where this page opens for one too. Named rather than spelled `1` at the two
// sites that need it.
export const GENESIS_BOOK_ID = 1;

/**
 * @param ideaId the open idea, or null in the topics view
 * @returns { bookId, isResolving, showBook, adoptIdeaBook }
 */
const useBookScope = (ideaId = null) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const fromUrl = bookIdFromParams(searchParams);

    // The seed, once it has been worked out. Null while that is in flight.
    const [seeded, setSeeded] = useState(null);

    useEffect(() => {
        // Both halves of this guard are read live, never frozen at mount. A
        // reader can leave `?book=` without leaving the page — the Navbar's
        // Thoughts button, pressed from /thoughts?book=41, re-renders this
        // component rather than remounting it — and a mount-time answer would
        // hold the page on a seed that can never run again.
        //
        // The effect below writes the query string itself, which is the reason
        // a naive re-read is a hazard: our own handwriting would come back as
        // the reader's choice. Reading `seeded` is what settles that. Once a
        // book has been seeded there is nothing left to search for, so the
        // early return is correct whether the `?book=` in hand was written by
        // this hook, a link or the reader.
        if (fromUrl !== null || seeded !== null) return undefined;

        const controller = new AbortController();

        // Source 2 before source 3: an idea the reader is looking at is a
        // better answer about which book they mean than where they last left a
        // different page.
        const seed = async () => {
            if (ideaId !== null) {
                // A `?idea=` that no longer resolves — deleted, mistyped, a
                // stale link — is not a reason to give up on the search. It
                // fails the same way an idea payload with no usable bookId
                // already falls through below: the reader's saved location is
                // still a better answer than Genesis, so only this step is
                // swallowed and the search continues to source 3.
                try {
                    const payload = await fetchJson(`/ideas/${ideaId}`, { signal: controller.signal });
                    const bookId = payload && payload.idea && payload.idea.bookId;
                    if (parseBookId(String(bookId)) !== null) return bookId;
                } catch (err) {
                    if (err.name === 'AbortError') throw err;
                }
            }

            const payload = await fetchJson(LOCATION_PATH, { signal: controller.signal });
            const primary = payload && payload.location && payload.location.primary;
            const bookId = primary && primary.bookId;

            return parseBookId(String(bookId)) === null ? GENESIS_BOOK_ID : bookId;
        };

        seed()
            .then(bookId => setSeeded(bookId))
            .catch(err => {
                if (err.name === 'AbortError') return;
                // A scope that cannot be seeded is a convenience lost, not a
                // page broken — the rule useRestoreLocation already follows.
                // Genesis is where Analyze opens in the same situation.
                setSeeded(GENESIS_BOOK_ID);
            });

        return () => controller.abort();
    }, [fromUrl, seeded, ideaId]);

    // Written to the URL so a reload, a shared link and Reset View all stay in
    // the book that was seeded. Replaced, never pushed — see the header.
    useEffect(() => {
        if (seeded === null || fromUrl !== null) return;

        setSearchParams(previous => {
            const next = new URLSearchParams(previous);
            next.set(BOOK_PARAM, String(seeded));
            return next;
        }, { replace: true });
    }, [seeded, fromUrl, setSearchParams]);

    // Written through the same parser that reads it, so the URL can never
    // carry a value this hook would then refuse — the one way a scope could
    // get stuck. A bad id is ignored rather than written.
    const showBook = useCallback((id) => {
        const wanted = parseBookId(String(id));
        if (wanted === null) return;

        setSearchParams(previous => {
            const next = new URLSearchParams(previous);
            next.set(BOOK_PARAM, String(wanted));
            // Leaving the book leaves the idea: an idea from the book just
            // left is not on the field just arrived at, and an orbit over a
            // scope that does not contain it is a view of nothing.
            next.delete(IDEA_PARAM);
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    // The idea wins, even over a `?book=` that names a different book.
    //
    // Source 2 above only runs when no book is in the URL, so `?idea=` and
    // `?book=` can arrive disagreeing — a search result for an idea carries no
    // book, and a single failed read of that idea while seeding is enough to
    // write the saved location's book beside it. The idea is the more specific
    // request of the two, and the field of the book it is NOT in cannot draw
    // it: the reader would be looking at a canvas with nothing on it.
    //
    // Unlike showBook this keeps `?idea=`, because here the idea is what
    // decided the book rather than what the book left behind. Replaced rather
    // than pushed: the reader never chose the book being corrected.
    //
    // The caller supplies the idea's own book — the page already reads it while
    // loading the idea's notes (see useThoughtsData), so asking for it again
    // here would be a second request for a payload the page has in hand.
    const adoptIdeaBook = useCallback((ideaBookId) => {
        const wanted = parseBookId(String(ideaBookId));
        if (wanted === null || wanted === fromUrl) return;

        setSearchParams(previous => {
            const next = new URLSearchParams(previous);
            next.set(BOOK_PARAM, String(wanted));
            return next;
        }, { replace: true });
    }, [fromUrl, setSearchParams]);

    const bookId = fromUrl !== null ? fromUrl : seeded;

    return { bookId, isResolving: bookId === null, showBook, adoptIdeaBook };
};

export default useBookScope;
