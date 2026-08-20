// Pure: a search term -> which groups, on which rails, it names.
//
// ── Filter, not hide ───────────────────────────────────────────────────────
//
// The plan is specific about this: "Search — filter to matching arcs rather
// than hiding others outright." So nothing here removes anything. What it
// produces is a SET of groups that matched, and the page turns everything else
// down around them — the same mechanism the hover highlight uses, for the same
// reason. An arc taken out of the drawing takes its position with it, and
// position is the whole content of this page: a reader searching "Faith" needs
// to see where those chains fall AGAINST the rest of the corpus, not on an
// empty axis where every remaining chain looks equally central.
//
// ── Why the match is on the title alone ────────────────────────────────────
//
// A group is a note, an idea or a topic, and the one thing all three have that
// a reader can search for by name is a title. The references are already
// searchable by position — they are what the diagram draws — and the bodies
// are deliberately not in this page's payload at all (see useOverviewData), so
// matching them would mean a request per keystroke for a corpus this page has
// otherwise loaded whole. /search is the page that reads bodies; this box
// narrows the picture that is already on screen.
//
// ── Why every rail is matched independently ────────────────────────────────
//
// Searching a topic's name dims the unrelated arcs on the notes and ideas
// rails too, and lights only the groups whose own titles match. That looks
// like an omission — should a topic not light the notes under it? — but the
// page already has that question answered, better, by ?topicId=: the drawer's
// "show only this topic" restricts every tier to what falls under one topic,
// structurally, from the server. The two filters are deliberately different
// tools. `topicId` asks "what is filed here?"; `q` asks "what did I call it?",
// and a note whose title says "faith" is a real answer to the second question
// whether or not anyone ever filed it under the topic.
//
// ── Substring, not tokens ──────────────────────────────────────────────────
//
// Case-insensitive substring over the whole title, so "faith" finds "Justified
// by faith" and "thr" finds "A thread through the canon". Splitting the query
// into words and requiring all of them would be defensible, but this box is
// read as a filter that narrows as you type, and a token search widens again
// the moment a word is half-typed. Predictable beats clever on a control whose
// whole feedback loop is one keystroke long.
//
// Nothing here reads the DOM, the router or the network. useArcSearch applies
// the answer; this decides it.

/**
 * The comparable form of a term or a title: trimmed and case-folded.
 *
 * Both sides go through it, so "  FAITH " and "faith" are the same search.
 */
export const normalize = (text) => (typeof text === 'string' ? text.trim().toLowerCase() : '');

/** Whether one title answers to a normalized term. */
export const matchesTerm = (title, term) => normalize(title).includes(term);

/**
 * Which groups a search names, per rail.
 *
 * @param labels a Map from rail to that rail's Map of groupId -> label, as
 *               Overview.js builds it from tierLabels.buildLabels
 * @param query  the raw term the reader typed
 * @returns null when the query says nothing — no search is running and nothing
 *          should be dimmed — otherwise
 *          { term, byRail: Map<rail, Set<groupId>>, count, total }
 *
 * `total` counts only the rails that have labels loaded, which is exactly the
 * rails being drawn: a rail switched off is not fetched, so it contributes no
 * labels and is neither matched nor counted. That makes "3 of 812" a statement
 * about the picture on screen rather than about the corpus behind it.
 */
export const buildMatches = (labels, query) => {
    const term = normalize(query);
    if (term === '') return null;

    let count = 0;
    let total = 0;
    const byRail = new Map();

    labels.forEach((byGroupId, rail) => {
        const matched = new Set();

        byGroupId.forEach((label, groupId) => {
            total += 1;
            if (matchesTerm(label.title, term)) {
                matched.add(groupId);
                count += 1;
            }
        });

        byRail.set(rail, matched);
    });

    return { term, byRail, count, total };
};

export default buildMatches;
