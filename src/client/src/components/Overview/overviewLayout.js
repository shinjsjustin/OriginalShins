// The Overview page's world coordinates.
//
// Everything the page draws is placed in one fixed 560 x 1000 "world", which
// the <svg> viewBox fits to whatever room the browser gives it. Pan and zoom
// are a transform applied on top of that world, never a change to it — so
// nothing in this file depends on the window size, and no coordinate here has
// to be recomputed when the reader zooms.
//
// All three tiers hang their stems and arcs off these same numbers: a stem runs
// from AXIS.x to its rail's x at the y the axis model gives it. Keeping the
// numbers here rather than in the components is what lets the rails line up
// with the axis, and with each other, without anything being measured.

export const WORLD = { width: 560, height: 1000 };

// The axis itself. `top` and `bottom` are the y of verse_index 1 and of the
// last verse; the margins above and below are where the rail headings sit and
// where a label at either end has room to breathe.
export const AXIS = { x: 130, top: 40, bottom: 980 };

// Ticks straddle the axis line. A chapter tick is deliberately shorter than a
// book tick and nests inside it, so the two read as a hierarchy rather than as
// two competing rulers.
//
// Overview.css undoes the horizontal half of the zoom for the whole tick group
// in one counter-scale, so these lengths are what a tick measures on screen at
// any zoom rather than only at rest.
export const BOOK_TICK = { left: 122, right: 138 };
export const CHAPTER_TICK = { left: 125, right: 135 };

// Book names sit to the left of the axis (right-aligned, ending at this x),
// chapter numbers to the right. Opposite sides, so a zoomed-in view never has
// to choose between them. The gutter is wide enough for the longest name in
// the canon — "1 Thessalonians" — at the resting label size; anything narrower
// clips it against the edge of the viewBox rather than wrapping it.
export const BOOK_LABEL_X = 118;
export const CHAPTER_LABEL_X = 142;

// The three tiers, in the order the plan gives them: notes are the leaves,
// topics the roots. Each carries the same two things — one stem per anchor and
// one chained arc per group — drawn by the same components against a different
// grouping of the same references. See TierStems.js and TierArcs.js.
export const RAILS = [
    { key: 'notes', label: 'notes', x: 270 },
    { key: 'ideas', label: 'ideas', x: 390 },
    { key: 'topics', label: 'topics', x: 510 },
];

// The tier keys alone, which is what the payload, the URL and the toggles all
// speak in. Derived from RAILS so there is one list of tiers and not two.
export const TIER_KEYS = RAILS.map(rail => rail.key);

export const RAIL_LABEL_Y = 28;

// The rails by key, for the tiers that draw onto one particular rail. A stem
// runs from AXIS.x to its own rail's x, and an arc hangs off the same number —
// which is the whole of what "parameterised by rail" means for the geometry.
// Derived from RAILS so a rail cannot be moved in one place and missed in the
// other.
export const RAIL_X = RAILS.reduce((byKey, rail) => ({ ...byKey, [rail.key]: rail.x }), {});

// ─── Arcs ──────────────────────────────────────────────────────────────────
//
// An arc joins two consecutive anchor points of the same note, drawn on the
// rail and bulging AWAY from the axis, so the space between the axis and the
// rail stays clear for the stems.
//
// `max` is how far the CONTROL POINT of the longest possible arc — one
// spanning the whole canon — sits out from the rail. It is bounded by the next
// rail along: the rails are 120 apart, so 80 keeps a tier's arcs clear of the
// tier outside it. A quadratic does not pass through its control point, so the
// curve itself reaches half that far: the topics rail at x 510 bulges to 550,
// inside the 560-unit world, which is why three tiers fit the frame 6a fixed
// without any of them being moved.
//
// `min` is what the shortest arc gets, and it exists because most arcs are
// short. Two references inside one chapter are a few tenths of a unit apart on
// a 940-unit axis; drawn to scale that arc is a straight line on the rail and
// invisible, when what the reader needs to see is that the two points are
// joined at all. So the bulge grows with the SQUARE ROOT of the span rather
// than in proportion to it — short chains stay visible, long ones stay
// distinguishable from each other, and the ordering is preserved either way.
export const ARC_BULGE = { min: 4, max: 80 };

/**
 * The pinning offset for a feature that lives at a fixed x, as a CSS length.
 *
 * ── Why anything is pinned at all ──────────────────────────────────────────
 *
 * The zoom is uniform, because a wheel gesture centred on the cursor has to
 * be. But this drawing has nothing to look at horizontally: the axis is one
 * line, its labels a column beside it, the rails a fixed distance to the
 * right. Left to scale, a 20x zoom stretches a 16-unit tick into a rule across
 * the whole panel and carries every book name a thousand pixels off the edge.
 *
 * ── Why the offset is the feature's own x ──────────────────────────────────
 *
 * Overview.css turns this into `translateX(offset * (1/s - 1))`, which moves a
 * feature at x to x/s in its own coordinates. The scene then scales it by s,
 * putting it back at x — the same place it sits at rest, at every zoom. So the
 * offset is x itself, not its distance from the axis: pinning relative to the
 * axis holds the gaps but lets the whole rigid column slide, because the axis
 * is at a fixed x too and scales along with everything else.
 *
 * It costs one static attribute per group and nothing per frame — the
 * arithmetic is CSS's, driven by the same --ov-inverse-scale as the strokes
 * and the type.
 */
export const pinnedX = (x) => `${x}px`;

// ─── Label crowding ────────────────────────────────────────────────────────
//
// 66 book labels over 940 world units is 14 units apart on average, but the
// canon is not evenly spaced: Psalms takes 75 units and Obadiah takes 0.6.
// Drawing every label at rest would stack Obadiah, Jonah, Micah and Nahum on
// top of each other.
//
// So each label is assigned a *tier* from the room it actually has, and the
// page publishes the tier the current zoom has reached. Tier k appears at
// scale 2^k. This is a comparison CSS can make on its own from one attribute,
// which is the whole point: crowding resolves as the reader zooms without
// React re-rendering anything.

// The world units a label needs between it and its neighbour to stay legible.
export const LABEL_MIN_GAP = 15;

// Tier 5 is scale 32. Past that even Obadiah has room, so nothing needs a
// higher tier and no label is unreachable.
export const MAX_DETAIL_TIER = 5;
