// Pure: how many ideas + where the topic is + how big the canvas is
//       -> where each idea card sits on the fan, and whether a chip is needed.
//
// ── The fan is the navigation ──────────────────────────────────────────────
//
// Hovering a topic fades the rest of the field and opens its ideas in an arc
// around it. There is no list view behind this and no other route to an idea,
// so every card the fan places has to end up somewhere a cursor can reach.
// Two ways that fails, and the layout answers each differently:
//
//   • The topic is near an edge. About half of any field is on the outside of
//     it, and this canvas clips — a card drawn past the boundary is not partly
//     visible, it is gone. So the fan turns to face the middle of the canvas
//     before it draws anything (`bearing`), and every box is then clamped into
//     the canvas as a backstop for whatever the turn did not solve.
//
//   • The topic has a lot of ideas. Holding the angular step fixed as the
//     count rises walks the arc past a full turn, and the last cards land on
//     top of the first. So the arc has a ceiling (FAN_SPREAD.max) and the step
//     is what gives once the ceiling is reached: the cards tighten rather than
//     the arc widening.
//
// ── Two sizes, one threshold ───────────────────────────────────────────────
//
// Past FAN_TIGHTEN_THRESHOLD ideas the cards drop one size step and stay
// there. A size that slid continuously with the count would make two topics of
// nine and eleven ideas look meaningfully different, which is a distinction the
// data does not have; one step keeps "this topic is a big one" readable without
// implying a scale.
//
// ── Why the second arc, and why the chip counts it ─────────────────────────
//
// One arc holds FAN_ROW_CAPACITY cards at the tight step before the cards
// themselves start to touch. Everything past that goes on a second, wider arc
// behind a `+N more` chip, placed at the end of the first arc where the eye is
// already travelling. The chip does not hide those ideas from this function —
// they are all in `cards`, on row 1 — because the component needs their
// positions to animate them out from under the chip when it is pressed.

// One idea card on the fan: a title only, no body, so it is wide and short.
export const FAN_CARD = Object.freeze({ width: 148, height: 52 });

// The two sizes a fan card is ever drawn at, and nothing between them.
export const FAN_CARD_SCALES = Object.freeze({ full: 1, tight: 0.84 });

// The last count that still gets full-size cards.
export const FAN_TIGHTEN_THRESHOLD = 8;

// What one arc holds before a second one opens. At the tight scale and the
// maximum spread, fifteen cards of FAN_CARD.height very nearly touch along the
// inner arc — which is the point at which one more stops being readable.
export const FAN_ROW_CAPACITY = 15;

// How far out each arc sits from the topic's centre. The first clears the
// topic card itself with a gap the pointer can cross without the hover
// dropping; the second clears the first.
export const FAN_RADIUS = Object.freeze({ first: 190, second: 296 });

// `perCard` is the resting angular step — the gap a small fan uses, wide
// enough that neighbouring cards read as separate. `max` is the widest the arc
// ever opens: past two thirds of a turn the fan starts to enclose its own
// topic, and past a full turn it overlaps itself.
export const FAN_SPREAD = Object.freeze({ perCard: Math.PI / 9, max: Math.PI * 1.15 });

// The `+N more` chip. Sized for a short count, not for a card.
export const FAN_OVERFLOW_CHIP = Object.freeze({ width: 76, height: 30 });

// How close to the canvas edge a clamped box is allowed to get. Not zero:
// flush against the clip boundary reads as a card that has been cut off.
export const FAN_EDGE_PADDING = 16;

// Where the fan points when the topic is exactly at the centre of the canvas
// and there is no "away from the edge" to aim at. Rightwards, because the
// cards are wider than they are tall and have more room that way.
export const FAN_DEFAULT_BEARING = 0;

const PRECISION = 2;

const round = (value) => Number(value.toFixed(PRECISION));

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

const isFinitePoint = (point) =>
    Boolean(point) && Number.isFinite(point.x) && Number.isFinite(point.y);

const isUsableCanvas = (canvas) =>
    Boolean(canvas)
    && Number.isFinite(canvas.width) && Number.isFinite(canvas.height)
    && canvas.width > 0 && canvas.height > 0;

const EMPTY_FAN = Object.freeze({
    cards: [],
    rows: 0,
    overflow: null,
    scale: FAN_CARD_SCALES.full,
    bearing: FAN_DEFAULT_BEARING,
});

/**
 * How wide the arc of `count` cards opens.
 *
 * Proportional to the count until the ceiling, so a fan of three is a small
 * fan rather than three cards flung around a huge arc; flat afterwards, which
 * is what turns further growth into a tighter step instead of a wider arc.
 */
const spreadFor = (count) =>
    (count <= 1 ? 0 : Math.min(FAN_SPREAD.max, (count - 1) * FAN_SPREAD.perCard));

/**
 * The angles of one arc, centred on `bearing`.
 *
 * Centred rather than grown from one end: the fan belongs to the topic under
 * it, and an arc that extended in one direction would swing further off its
 * own card with every idea added.
 */
const anglesFor = (count, bearing) => {
    if (count <= 0) return [];
    if (count === 1) return [bearing];

    const spread = spreadFor(count);
    const step = spread / (count - 1);

    return Array.from({ length: count }, (unused, index) => bearing - spread / 2 + index * step);
};

/**
 * A box of this size centred on this point, pulled back inside the canvas.
 *
 * The clamp is a backstop, not the placement: `bearing` is what normally keeps
 * the fan on the canvas, and a fan relying on the clamp for most of its cards
 * would stack them along the edge. It still has to be here, because a topic in
 * a corner has a quadrant of nothing however the fan is aimed.
 */
const placeBox = (centre, size, canvas) => {
    const maxX = Math.max(FAN_EDGE_PADDING, canvas.width - size.width - FAN_EDGE_PADDING);
    const maxY = Math.max(FAN_EDGE_PADDING, canvas.height - size.height - FAN_EDGE_PADDING);

    return {
        x: round(clamp(centre.x - size.width / 2, FAN_EDGE_PADDING, maxX)),
        y: round(clamp(centre.y - size.height / 2, FAN_EDGE_PADDING, maxY)),
        width: round(size.width),
        height: round(size.height),
    };
};

const onArc = (origin, radius, angle) => ({
    x: origin.x + radius * Math.cos(angle),
    y: origin.y + radius * Math.sin(angle),
});

/**
 * Which way the fan opens: from the topic towards the middle of the canvas.
 *
 * The whole reason the fan does not simply always open rightwards. A topic on
 * the right edge fans left, one at the bottom fans up, and one in a corner
 * fans diagonally inwards — each into the room it actually has.
 */
const bearingFrom = (origin, canvas) => {
    const toCentre = { x: canvas.width / 2 - origin.x, y: canvas.height / 2 - origin.y };

    if (toCentre.x === 0 && toCentre.y === 0) return FAN_DEFAULT_BEARING;

    return Math.atan2(toCentre.y, toCentre.x);
};

/**
 * The spotlight fan for one hovered topic.
 *
 * @param ideaCount how many ideas the topic has
 * @param origin    { x, y } the centre of the topic card, in canvas coordinates
 * @param canvas    { width, height } of the drawing area
 * @returns {
 *   cards: [{ index, row, angle, x, y, width, height }],  // every idea, in order
 *   rows: 0 | 1 | 2,
 *   overflow: null | { count, angle, x, y, width, height },
 *   scale, bearing
 * }
 * `x, y` is each box's top-left corner. `overflow` is the `+N more` chip, and
 * its `count` is exactly how many cards sit on row 1.
 */
export const buildFan = (ideaCount, origin, canvas) => {
    if (!Number.isInteger(ideaCount) || ideaCount <= 0) return EMPTY_FAN;
    if (!isFinitePoint(origin) || !isUsableCanvas(canvas)) return EMPTY_FAN;

    const bearing = bearingFrom(origin, canvas);
    const scale = ideaCount > FAN_TIGHTEN_THRESHOLD
        ? FAN_CARD_SCALES.tight
        : FAN_CARD_SCALES.full;
    const size = { width: FAN_CARD.width * scale, height: FAN_CARD.height * scale };

    const firstCount = Math.min(ideaCount, FAN_ROW_CAPACITY);
    const secondCount = ideaCount - firstCount;
    const radii = [FAN_RADIUS.first, FAN_RADIUS.second];

    // Each arc is spread on its own count, so a second arc of two is a small
    // arc rather than two cards at opposite ends of a wide one.
    const angles = [anglesFor(firstCount, bearing), anglesFor(secondCount, bearing)];

    const cards = angles.flatMap((rowAngles, row) =>
        rowAngles.map((angle, position) => ({
            index: row === 0 ? position : firstCount + position,
            row,
            angle,
            ...placeBox(onArc(origin, radii[row], angle), size, canvas),
        }))
    );

    // Cards come out of the two arcs in row order; `index` is what puts them
    // back in the caller's idea order, so sorting keeps the two agreeing.
    cards.sort((left, right) => left.index - right.index);

    return {
        cards,
        rows: secondCount > 0 ? 2 : 1,
        overflow: secondCount > 0 ? buildChip(secondCount, angles[0], origin, canvas) : null,
        scale,
        bearing,
    };
};

/**
 * The `+N more` chip: one step past the last card of the first arc, on the
 * same arc, so it reads as the place that arc ran out rather than as a control
 * floating beside it.
 */
const buildChip = (count, firstRowAngles, origin, canvas) => {
    const last = firstRowAngles[firstRowAngles.length - 1];
    const step = firstRowAngles.length > 1
        ? last - firstRowAngles[firstRowAngles.length - 2]
        : FAN_SPREAD.perCard;
    const angle = last + step;

    return {
        count,
        angle,
        ...placeBox(onArc(origin, FAN_RADIUS.first, angle), FAN_OVERFLOW_CHIP, canvas),
    };
};

export default buildFan;
