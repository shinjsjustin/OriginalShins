import { toAnchorPoints } from './anchorPoints';

// Pure: one tier of /api/overview -> one stem per anchor point.
//
// ── What this does and does not do ─────────────────────────────────────────
//
// Nothing but flattening. Reading the payload, dropping what it should not
// contain and placing each anchor on the axis is anchorPoints.js, shared with
// the arcs so the two cannot disagree about which points exist. All this file
// adds is the one-line-per-point shape and the y of that line.
//
// It takes a tier rather than the notes tier: the ideas and topics rails draw
// stems from the same function against a different grouping of the same
// references, which is what makes the same verse line up across all three.

// ── The 6b verification, as it was actually run ────────────────────────────
//
// The plan asks for the stems to be checked against the Analyze page rather
// than against themselves, because "is this line in the right place?" has no
// answer you can see. Four notes were created through POST /api/notes with one
// reference each, spread across the canon; each anchor's y was computed with
// the mapping below, inverted back to a verse_index, and looked up in the
// chapter spans /api/books ships. That book and chapter was then compared with
// the chapter whose GET /api/notes?bookId=&chapter= returns the note — which
// is exactly the list the Analyze page's notes panel renders.
//
// Against the WEB canon as imported here: 66 books, 1,189 chapters, 31,095
// verses, so verse_index 1 is y 40 and verse_index 31,095 is y 980.
//
//   reference        anchor (verse_index)      y         y maps back to
//   ───────────────────────────────────────────────────────────────────────
//   Genesis 1:1-5              3          40.060       Genesis 1        ✓
//   Psalm 23:1-6           14,240        470.458       Psalms 23        ✓
//   Matthew 5:3-12         23,243        742.627       Matthew 5        ✓
//   Revelation 22:1-5      31,077        979.456       Revelation 22    ✓
//
// All four notes were returned by GET /api/notes for the chapter their stem
// landed in, and by no other. A twelve-book spread was then rendered in the
// browser and read back off the DOM: every stem's y fell inside the tick span
// of the book its reference names (Exodus 20 -> Exodus, Deuteronomy 6 ->
// Deuteronomy, Psalm 1 / 23 / 119 -> Psalms, Isaiah 53 -> Isaiah, Ezekiel 37
// -> Ezekiel, and so on down to Revelation).
//
// Two further things that only the browser could answer, checked at the same
// time: a stem's horizontal span stayed pixel-identical from 1x to 400x zoom,
// with its left end on the axis and its right on the notes rail (the
// counter-scale in Overview.css), and adding then deleting a reference was
// reflected by /api/overview on the next read (the server-side cache
// invalidation). The generic form of both assertions lives in
// Overview.test.js; the table above is the concrete check behind them.

/**
 * Every stem one rail draws, in payload order.
 *
 * @param tier        one tier of the payload: [[groupId, [verseIndex, ...]], ...]
 * @param totalVerses the last verse_index on the axis, from the axis model
 * @returns [{ key, groupId, verseIndex, y }] — one entry per anchor point
 */
export const buildStems = (tier, totalVerses) =>
    toAnchorPoints(tier, totalVerses).flatMap(group =>
        group.points.map(point => ({
            // A verse alone is not unique: two groups anchored to the same
            // verse are ordinary and both get a stem.
            key: `${group.groupId}.${point.verseIndex}`,
            groupId: group.groupId,
            verseIndex: point.verseIndex,
            y: point.y,
        })));

export default buildStems;
