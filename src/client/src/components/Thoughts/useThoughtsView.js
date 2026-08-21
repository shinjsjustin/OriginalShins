import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IDEA_PARAM } from './thoughtsUrl';

// Which of the page's two views is showing, held in the query string.
//
//   /thoughts             the topics view — the field of topic cards
//   /thoughts?idea=123    the idea view — idea 123 centred, its notes orbiting
//
// One param, because there is only one thing to say: the idea view IS an idea,
// and the topics view is the absence of one. The rest of the page's state —
// which topic is hovered, which fan is locked, what is selected in the panel —
// is a pointer's business and belongs nowhere near a URL.
//
// It lives in the query string for the reasons the Analyze panels and the
// Overview rails do (see panelParams.js and useOverviewParams.js): the back
// button leaves an idea, a reload stays in it, and "look at this one" is a
// link. Reset View is then a navigation rather than a state reset, which is why
// this hook has no state of its own at all.
//
// Opening an idea PUSHES a history entry. It is the reader's decision and the
// biggest one this page offers — the whole canvas changes — so back must undo
// it. Nothing here normalises the URL, so nothing here replaces.

// Re-exported so the page's own modules and tests can read the param name from
// the hook that owns the behaviour, while thoughtsUrl.js stays the one place it
// is spelled.
export { IDEA_PARAM };

/**
 * The idea a raw `?idea=` value names, or null for the topics view.
 *
 * Defensive because the value is a URL: it survives bookmarks, shared links and
 * hand-editing, and the page it lands on has to be a page. So anything that is
 * not a positive integer — absent, empty, `abc`, `-1`, `0`, `1.5`, `2e3` — is
 * the topics view rather than an error, by the same rule
 * overviewParams.topicIdFromParams follows for a stale `?topicId=`.
 *
 * A well-formed id naming an idea that no longer exists is deliberately NOT
 * handled here. That is a question about the corpus, only the server can answer
 * it, and it answers 404 — which the page shows as its error banner, with the
 * URL still saying what was asked for.
 *
 * Takes the raw string rather than the URLSearchParams so it can be tested
 * without a router, and so the hook can memoise on the one primitive if it ever
 * needs to.
 */
export const parseIdeaId = (raw) => {
    if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;

    const ideaId = Number(raw);
    return ideaId >= 1 ? ideaId : null;
};

/** The same, read off a URL. */
export const ideaIdFromParams = (searchParams) => parseIdeaId(searchParams.get(IDEA_PARAM));

const useThoughtsView = () => {
    const [searchParams, setSearchParams] = useSearchParams();

    const ideaId = ideaIdFromParams(searchParams);

    // Written through the same parser that reads it, so the URL can never carry
    // a value this hook would then refuse — which is the one way the view could
    // get stuck: an address bar saying `?idea=abc` over a topics view that has
    // no idea it is meant to be showing anything. A bad id resets instead.
    const showIdea = useCallback((id) => {
        const wanted = parseIdeaId(String(id));

        setSearchParams(previous => {
            const next = new URLSearchParams(previous);

            if (wanted === null) {
                next.delete(IDEA_PARAM);
            } else {
                next.set(IDEA_PARAM, String(wanted));
            }

            return next;
        });
    }, [setSearchParams]);

    // Deletes the param rather than navigating to a bare '/thoughts', so any
    // other param the page later grows survives leaving an idea.
    const resetView = useCallback(() => {
        setSearchParams(previous => {
            const next = new URLSearchParams(previous);
            next.delete(IDEA_PARAM);
            return next;
        });
    }, [setSearchParams]);

    return { ideaId, showIdea, resetView };
};

export default useThoughtsView;
