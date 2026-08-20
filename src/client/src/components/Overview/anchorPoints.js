import { yForIndex } from './axisModel';

// Pure: one tier of /api/overview -> each group's anchor points, placed on the
// axis.
//
// A "group" is whatever the tier is grouped by: a note on the notes rail, an
// idea on the ideas rail, a topic on the topics rail. All three arrive in the
// same shape — [groupId, [verseIndex, ...]] — because all three are the same
// references collected differently (see src/lib/overview.js), so nothing below
// this line knows or needs to know which rail it is placing.
//
// ── Why this is its own module ─────────────────────────────────────────────
//
// Two things draw from the same points and must never disagree about them: the
// stems (one horizontal line per point, stemModel.js) and the arcs (one chain
// per group, arcModel.js). If each validated the payload for itself, a rule
// tightened in one would silently leave the other drawing a point the first no
// longer believes in — and an arc chaining a point that has no stem is exactly
// the kind of wrongness this page renders beautifully.
//
// ── What is done here, and what the server already did ─────────────────────
//
// The server collapsed each reference to the midpoint of its verse_index
// range, sorted a group's anchors and deduplicated them. What is left is the
// one thing only the client can do — turn a verse_index into a y on the axis it
// happens to be drawing — and it is done with the same yForIndex the book and
// chapter ticks use. That shared function is why a stem lands exactly on the
// tick of the book it belongs to rather than nearly on it, and why the same
// verse lines up across all three rails: they are three readings of one
// mapping, not three mappings.
//
// ── Why the payload is validated at all ────────────────────────────────────
//
// It arrives over the network, so it is external data and gets checked like any
// other. But the interesting case is not a malicious one: `totalVerses` is
// re-derived on the client from /api/books, while the anchors come from the
// verse_index column the importer wrote. Those two agree today because both
// come from the same import. Should a re-import ever leave them disagreeing, an
// anchor past the end of the axis would be drawn just below the last book and
// would look like a perfectly ordinary stem. Dropping it instead means the mark
// is missing, which is at least visibly wrong.

const FIRST_VERSE_INDEX = 1;

const isDrawableIndex = (verseIndex, totalVerses) =>
    Number.isInteger(verseIndex)
    && verseIndex >= FIRST_VERSE_INDEX
    && verseIndex <= totalVerses;

// One [groupId, anchors] pair as the server ships it, or null if it is not one.
const asAnchorPair = (entry) => {
    if (!Array.isArray(entry) || entry.length < 2) return null;

    const [groupId, anchors] = entry;
    if (!Number.isInteger(groupId) || !Array.isArray(anchors)) return null;

    return { groupId, anchors };
};

/**
 * Every group in the tier that has at least one drawable anchor, in payload
 * order, with its points already placed on the axis.
 *
 * @param tier        one tier of the payload: [[groupId, [verseIndex, ...]], ...]
 * @param totalVerses the last verse_index on the axis, from the axis model
 * @returns [{ groupId, points: [{ verseIndex, y }] }] — points in payload
 *          order, which the server made ascending by verse_index
 */
export const toAnchorPoints = (tier, totalVerses) => {
    if (!Array.isArray(tier) || !(totalVerses > 0)) return [];

    return tier.flatMap(entry => {
        const pair = asAnchorPair(entry);
        if (!pair) return [];

        const points = pair.anchors
            .filter(verseIndex => isDrawableIndex(verseIndex, totalVerses))
            .map(verseIndex => ({ verseIndex, y: yForIndex(verseIndex, totalVerses) }));

        return points.length === 0 ? [] : [{ groupId: pair.groupId, points }];
    });
};

export default toAnchorPoints;
