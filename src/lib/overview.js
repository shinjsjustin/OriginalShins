// Builds the Overview page's payload: every anchor point the diagram draws,
// grouped by the thing it belongs to, plus the words the page puts beside one
// when the reader points at it.
//
// ── The payload shape, and why it is arrays ────────────────────────────────
//
//   {
//     notes:       [ [noteId,  [verseIndex, ...]], ... ],
//     ideas:       [ [ideaId,  [verseIndex, ...]], ... ],
//     topics:      [ [topicId, [verseIndex, ...]], ... ],
//     noteLabels:  [ [noteId,  title, [[anchor, bookId, chapter, from, to], ...]], ... ],
//     ideaLabels:  [ ... ],
//     topicLabels: [ ... ]
//   }
//
// The plan fixes the first of those. A note with five references is
// [17, [3, 34, 1051, 19203, 26840]] — 40 bytes, against the ~200 the same
// thing costs as { id, anchors: [...] } once every key is repeated a few
// thousand times. Nothing on the page ever looks a field up by name; the
// client turns each anchor into a y and forgets the rest.
//
// Six keys, but only two shapes: a geometry tier and a label tier per rail,
// built by the same two functions from rows that differ only in what they are
// grouped by. See src/lib/overviewQueries.js for the three joins.
//
// ── What an anchor is ──────────────────────────────────────────────────────
//
// The MIDPOINT of a reference's verse_index range, rounded. A reference is a
// span, but a stem is a single horizontal line and an arc endpoint is a single
// point, so each reference has to collapse to one number. The midpoint is the
// only choice that does not bias the picture toward the start of long
// passages.
//
// Anchors are sorted ascending and deduplicated WITHIN a group, because that
// is what the chained arcs need: sort the points, chain the consecutive pairs,
// and two references landing on the same verse must not produce a zero-length
// arc. Doing it here means the client never sorts anything.
//
// "Within a group" is the whole rule. Two different notes anchored to the same
// verse keep an anchor each and get a stem each; deduplication never crosses a
// group, and a note's references appear on all three rails — once under the
// note, once under each idea it is linked to, once under each of those ideas'
// topics. That repetition is the picture, not a fault in it.
//
// ── Why there is a second tier, and why it is separate ─────────────────────
//
// Hovering an arc has to name what it belongs to: "Romans 5:1–5; Hebrews 11:1",
// under the note's title. An anchor is one integer and cannot answer that —
// the midpoint of 45:1..45:5 is a verse_index with no memory of the range it
// came from — so the display data has to be shipped as well.
//
// It is a PARALLEL tier rather than a third element on each pair for three
// reasons. The geometry tier is read on every frame of the drawing and the
// label tier only when the pointer stops on something, so they are used at
// different times. The three rails carry three of each, and pairing them by
// name keeps a rail's two halves obviously the same rail. And nothing that
// already reads `notes` had to learn a new element when 6d arrived.
//
// Each label is [groupId, title, references], and each reference is the fixed
// 5-tuple [anchor, bookId, chapter, startVerse, endVerse]. The anchor is
// repeated from the geometry tier on purpose: it is the six bytes that let the
// client answer "which reference did the reader just click nearest to?" with
// an equality test instead of re-deriving chapter spans from /api/books.
//
// References are NOT deduplicated the way anchors are. Two references that
// collapse to the same anchor are still two references and both belong in the
// list the reader reads; it is only the point on the axis they share. What IS
// collapsed is the same reference reached twice by a fanned-out join — that
// happens in the query, not here.
//
// ── Size ───────────────────────────────────────────────────────────────────
//
// The notes tier measured 33 KB against 250 notes and 1,003 references, or
// ~390 KB extrapolated to the plan's ceiling of a few thousand notes. The two
// tiers above it re-list the same references under their ideas and topics, so
// the ceiling is that figure times (1 + ideas per note + topics per note) —
// low single digits for a corpus anyone has actually filed. Still inside the
// megabyte the plan budgets, and `?tiers=` is how a reader who does not want
// the wide ones stops paying for them.
//
// What is deliberately absent everywhere is the BODY: it is the one field with
// no bound on its length, and a few thousand of them would make the request
// the whole page waits on scale with how much the reader has written, to draw
// a picture that never shows a body. The drawer fetches the one it opens.
const { ROW_FINDERS } = require('./overviewQueries');

/**
 * A reference's single point on the axis: the middle of the range it covers.
 *
 * Rounded to an integer because verse_index IS an integer — an anchor at
 * 1204.5 would name no verse, and the client's linear mapping would happily
 * place it half a verse down the axis and hide the fact.
 */
const anchorForRange = (startIndex, endIndex) =>
    Math.round((Number(startIndex) + Number(endIndex)) / 2);

// The label tier's key for a geometry tier: `notes` -> `noteLabels`. Derived
// rather than listed, so a tier cannot be added to one half of the payload and
// forgotten in the other.
const labelKeyFor = (tier) => `${tier.replace(/s$/, '')}Labels`;

/**
 * Rows -> the compact [groupId, anchors] pairs, in one pass.
 *
 * A Set per group does the deduplication, and the sort is explicit rather than
 * inherited from the query: rows arrive ordered by start_index, but midpoints
 * are not — a reference covering 1..100 has a later midpoint than one covering
 * 10..12 despite starting first.
 *
 * Groups with no reference at all are absent rather than present with an empty
 * array. They are a legal state — an orphan note, an idea with no notes, a
 * topic whose ideas anchor nothing — but they anchor to nothing, so they draw
 * nothing, and shipping thousands of empty arrays would be paying for a
 * picture of what is not there. The joins are what leave them out.
 */
const toAnchorPairs = (rows) => {
    const anchorsByGroup = new Map();

    for (const row of rows) {
        if (!anchorsByGroup.has(row.group_id)) {
            anchorsByGroup.set(row.group_id, new Set());
        }
        anchorsByGroup.get(row.group_id).add(anchorForRange(row.start_index, row.end_index));
    }

    // Map iteration is insertion order, which the ORDER BY made group_id
    // ascending — so the payload is stable between calls.
    return [...anchorsByGroup].map(([groupId, anchors]) => [
        groupId,
        [...anchors].sort((a, b) => a - b),
    ]);
};

/**
 * The same rows -> [groupId, title, references], the tier a tooltip and the
 * drawer read.
 *
 * References keep the query's order, which is start_index ascending: that is
 * canonical order, and it is the order a reader expects a reference list to be
 * printed in. A null title becomes an empty string here rather than on the
 * client — "which of null, undefined and '' does an untitled note have?" is a
 * question the page should never be asked.
 */
const toLabels = (rows) => {
    const labelsByGroup = new Map();

    for (const row of rows) {
        if (!labelsByGroup.has(row.group_id)) {
            labelsByGroup.set(row.group_id, { title: row.title || '', references: [] });
        }

        labelsByGroup.get(row.group_id).references.push([
            anchorForRange(row.start_index, row.end_index),
            row.book_id,
            row.chapter,
            row.start_verse,
            row.end_verse,
        ]);
    }

    return [...labelsByGroup].map(([groupId, label]) => [
        groupId,
        label.title,
        label.references,
    ]);
};

/** One tier's two keys, from one read. */
const buildTier = async (tier, userId, topicId) => {
    const rows = await ROW_FINDERS[tier](userId, topicId);

    return {
        [tier]: toAnchorPairs(rows),
        [labelKeyFor(tier)]: toLabels(rows),
    };
};

/**
 * The whole response body for one user and one topic scope: all three tiers,
 * whatever the request asked for. Cached; see lib/overviewCache.js.
 *
 * All three, because the cache is what makes this affordable and a cache that
 * held "the tiers the last request happened to name" would answer half the
 * next request. `?tiers=` selects from the built payload in the route, so
 * turning a rail back on is served from memory rather than from three joins.
 *
 * The three reads are independent, so they run together: they touch different
 * tables at different depths and the pool has room for them.
 */
const buildOverviewPayload = async (userId, topicId = null) => {
    const tiers = await Promise.all(
        Object.keys(ROW_FINDERS).map(tier => buildTier(tier, userId, topicId))
    );

    return Object.assign({}, ...tiers);
};

/** The keys of `payload` belonging to `tiers`, geometry and labels together. */
const selectTiers = (payload, tiers) =>
    tiers.reduce((selected, tier) => ({
        ...selected,
        [tier]: payload[tier] || [],
        [labelKeyFor(tier)]: payload[labelKeyFor(tier)] || [],
    }), {});

module.exports = {
    anchorForRange,
    labelKeyFor,
    toAnchorPairs,
    toLabels,
    buildTier,
    buildOverviewPayload,
    selectTiers,
};
