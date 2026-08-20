import { toAnchorPoints } from './anchorPoints';
import { ARC_BULGE, AXIS } from './overviewLayout';

// Pure: one tier of /api/overview -> one chained arc path per group.
//
// ── Chained, not pairwise ──────────────────────────────────────────────────
//
// This is the rule the plan is emphatic about and the one thing here worth
// getting wrong slowly. A note with five references does NOT produce the ten
// arcs of every pair; it produces four, joining consecutive points down the
// axis. Two reasons, and the second is the one that bites:
//
//   • It reads as one connected structure — a thread running down the canon —
//     rather than as a cat's cradle whose density says nothing about the note.
//   • The count is O(n) in anchor points, not O(n²). At the plan's ceiling the
//     difference between the two is the difference between a page that draws
//     and a page that does not.
//
// It matters more at every tier up. A note has a handful of references; a topic
// has the references of every note under every one of its ideas, and the
// pairwise count of a few hundred points is tens of thousands of curves for
// one topic.
//
// The points arrive already sorted ascending by verse_index, sorted and
// deduplicated server-side (see src/lib/overview.js), so "consecutive" is
// simply adjacent in the array and no client sorts anything.
//
// ── One <path> per group, not one per arc ──────────────────────────────────
//
// The segments of a chain share their endpoints, so they are subpaths of one
// continuous path: `M x,y0 Q c1 x,y1 Q c2 x,y2` — each Q starting where the
// last ended. That makes the DOM O(groups) rather than O(anchors), and it makes
// the hover rule fall out for free: a pointer anywhere on the chain is on the
// group's own element, so "highlight all of that idea's arcs" needs no lookup.
//
// ── Why the arcs bulge away from the axis ──────────────────────────────────
//
// Both endpoints sit on the group's own rail, so an arc has to leave it
// somewhere, and the space between the rail and the axis already belongs to
// the stems. Bulging outward keeps the two readable at once: stems in the
// gutter, arcs on the far side of the rail — and, with three rails, it keeps
// each tier's arcs inside the gap before the next rail. See ARC_BULGE in
// overviewLayout.js for how far.
//
// ── One renderer, three rails ──────────────────────────────────────────────
//
// `railX` is the only thing that differs between the tiers. Everything else —
// the chaining, the bulge, the precision — is the same arithmetic over the
// same shape of data, because the three tiers ARE the same references grouped
// three ways. A second copy of this file per tier is how the three would drift
// into telling three different stories about one corpus.

const AXIS_SPAN = AXIS.bottom - AXIS.top;

// Two decimals of a 1000-unit world is a tenth of a verse at rest — below what
// any zoom this page allows can resolve — and it keeps a few thousand path
// strings from carrying seventeen digits each.
const PRECISION = 2;

const round = (value) => Number(value.toFixed(PRECISION));

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

/**
 * How far out from the rail an arc spanning `span` world units reaches.
 *
 * Square root rather than proportional: most arcs are short — several
 * references inside one book is the common case — and a bulge in proportion to
 * a span of half a unit is a straight line the reader cannot tell from the
 * rail itself. The root lifts those into visibility while still ordering a
 * whole-canon arc outside a single-book one.
 */
export const bulgeForSpan = (span) =>
    clamp(
        ARC_BULGE.max * Math.sqrt(Math.abs(span) / AXIS_SPAN),
        ARC_BULGE.min,
        ARC_BULGE.max
    );

/**
 * The `d` of one group's chain: a move to the first point, then one quadratic
 * segment per consecutive pair.
 *
 * The control point of a segment sits at the midpoint's y and `bulge` out from
 * the rail. A quadratic through it does not pass through the control point, so
 * the curve's own apex is half that far out — which is why ARC_BULGE is read
 * as "how far the control point is", not "how fat the arc looks".
 */
const chainPath = (points, railX) => {
    const start = `M ${railX} ${round(points[0].y)}`;

    const segments = points.slice(1).map((point, index) => {
        const previous = points[index];
        const controlX = railX + bulgeForSpan(point.y - previous.y);
        const controlY = round((previous.y + point.y) / 2);

        return `Q ${round(controlX)} ${controlY} ${railX} ${round(point.y)}`;
    });

    return [start, ...segments].join(' ');
};

/**
 * Every chain one rail draws, in payload order.
 *
 * A group with one anchor is absent: there is nothing to chain it to. It still
 * gets its stem, which is the whole of what one reference has to say.
 *
 * @param tier        one tier of the payload: [[groupId, [verseIndex, ...]], ...]
 * @param totalVerses the last verse_index on the axis, from the axis model
 * @param railX       the x of the rail this tier hangs on, from RAIL_X
 * @returns [{ groupId, d, arcCount, points }] — one entry per group that chains
 */
export const buildArcs = (tier, totalVerses, railX) =>
    toAnchorPoints(tier, totalVerses)
        .filter(group => group.points.length > 1)
        .map(group => ({
            groupId: group.groupId,
            d: chainPath(group.points, railX),
            // n points, n-1 arcs. Asserted in the tests, because "chained, not
            // pairwise" is the one property of this page that is invisible
            // until it is far too late.
            arcCount: group.points.length - 1,
            // Kept for the click: the reader clicks somewhere on the chain and
            // the drawer opens at the reference nearest that y.
            points: group.points,
        }));

export default buildArcs;
