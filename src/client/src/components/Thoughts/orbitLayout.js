// Pure: how many notes + how big the canvas is -> where each note card orbits.
//
// ── What the ring says ─────────────────────────────────────────────────────
//
// The idea view is one enlarged idea at the centre with its notes around it,
// and the arrangement is the argument: a ring says these notes all attach to
// that idea, equally, with no first and no last. That only holds if the
// spacing is even — bunch three of them together and the shape starts claiming
// a relationship between those three that the data does not contain. So the
// angles here are a flat division of a full turn, per ring, and nothing
// adjusts them for card widths or text lengths.
//
// ── Why the overflow ring goes inside ──────────────────────────────────────
//
// Past ORBIT_SPLIT_THRESHOLD the notes no longer ring comfortably, and the
// extras go on a second, smaller ring rather than onto a tighter version of
// the first. Inside rather than outside for two reasons: the outer ring is
// already as far out as the canvas allows, so there is no "further out" to go;
// and keeping the first ten where they were means a reader's eleventh note
// does not rearrange the ten whose positions they had already learned.
//
// Inside is also the constrained direction, because the enlarged idea card
// owns the middle. ORBIT_CENTRE_CLEARANCE is the radius it is given, and the
// inner ring is pushed out to clear it.
//
// ── When the canvas cannot honour everything ───────────────────────────────
//
// A window too small to fit the outer ring, the inner ring and the clearance
// all at once has to give something up, and it gives up the clearance. The
// ordering is not aesthetic: a card pushed off this canvas is clipped, and a
// clipped note is one the reader cannot open, since this view is the only
// place notes are shown. A ring crowding the idea card is merely crowded.

// One note card: title plus a body clamped to about three lines, so it is
// appreciably taller than the title-only cards of the fan.
export const NOTE_CARD = Object.freeze({ width: 176, height: 108 });

// Full size on the outer ring; one step down on the inner one, which has less
// circumference to spend per card and is also the overflow.
export const ORBIT_CARD_SCALES = Object.freeze({ primary: 1, secondary: 0.78 });

// The last count that still rings on its own. Ten cards of NOTE_CARD.width
// around the outer ring leave a gap between neighbours that still reads as a
// gap; the eleventh is what closes it.
export const ORBIT_SPLIT_THRESHOLD = 10;

// The radius the centred idea card is given: it carries a title and a full
// markdown body, and it is the thing the whole view is about.
export const ORBIT_CENTRE_CLEARANCE = 150;

// The inner ring's radius as a fraction of the outer one, before the centre
// clearance is applied. It is the smaller of the two pressures on a canvas
// with room to spare, which is why the clearance usually wins.
export const ORBIT_SECONDARY_RATIO = 0.62;

// How much room the outer ring keeps between its cards and the canvas edge.
export const ORBIT_RING_PADDING = 24;

// Twelve o'clock. A stated start, so the first note is in the same place every
// time the view opens rather than wherever the arithmetic began.
export const ORBIT_START_ANGLE = -Math.PI / 2;

const PRECISION = 2;

const round = (value) => Number(value.toFixed(PRECISION));

const isUsableCanvas = (canvas) =>
    Boolean(canvas)
    && Number.isFinite(canvas.width) && Number.isFinite(canvas.height)
    && canvas.width > 0 && canvas.height > 0;

const EMPTY_ORBIT = Object.freeze({ centre: null, rings: [], cards: [] });

const sizeFor = (scale) => ({
    width: NOTE_CARD.width * scale,
    height: NOTE_CARD.height * scale,
});

/**
 * The outer ring: as far out as the canvas allows once a card's own half-size
 * and the edge padding are taken off, measured on whichever axis is tighter so
 * the ring stays a circle rather than becoming an ellipse.
 */
const primaryRadiusFor = (canvas, size) => Math.max(
    0,
    Math.min(
        canvas.width / 2 - size.width / 2,
        canvas.height / 2 - size.height / 2
    ) - ORBIT_RING_PADDING
);

/**
 * The inner ring: a fraction of the outer one, but never so close in that its
 * cards reach into the idea card's clearance — and never further out than the
 * outer ring, which is the concession a canvas too small for both forces.
 */
const secondaryRadiusFor = (primaryRadius, size) => Math.min(
    primaryRadius,
    Math.max(
        primaryRadius * ORBIT_SECONDARY_RATIO,
        ORBIT_CENTRE_CLEARANCE + Math.max(size.width, size.height) / 2
    )
);

// A flat division of a full turn. Not adjusted for anything: the evenness is
// the claim the ring makes.
const anglesFor = (count) =>
    Array.from({ length: count }, (unused, index) => ORBIT_START_ANGLE + (index * Math.PI * 2) / count);

const cardAt = (centre, radius, angle, size) => ({
    x: round(centre.x + radius * Math.cos(angle) - size.width / 2),
    y: round(centre.y + radius * Math.sin(angle) - size.height / 2),
    width: round(size.width),
    height: round(size.height),
});

/**
 * Where every note card orbits the centred idea.
 *
 * @param noteCount how many notes the idea has
 * @param canvas    { width, height } of the drawing area
 * @returns {
 *   centre: { x, y },                                   // the idea card's centre
 *   rings:  [{ ring, radius, count, width, height }],   // outer first
 *   cards:  [{ index, ring, angle, x, y, width, height }]
 * }
 * `x, y` is each card's top-left corner. `cards` is in note order, so `index`
 * lines up with the caller's own list across both rings.
 */
export const buildOrbit = (noteCount, canvas) => {
    if (!Number.isInteger(noteCount) || noteCount <= 0) return EMPTY_ORBIT;
    if (!isUsableCanvas(canvas)) return EMPTY_ORBIT;

    const centre = { x: round(canvas.width / 2), y: round(canvas.height / 2) };

    const primarySize = sizeFor(ORBIT_CARD_SCALES.primary);
    const secondarySize = sizeFor(ORBIT_CARD_SCALES.secondary);
    const primaryRadius = primaryRadiusFor(canvas, primarySize);

    const primaryCount = Math.min(noteCount, ORBIT_SPLIT_THRESHOLD);
    const secondaryCount = noteCount - primaryCount;

    const rings = [
        { ring: 0, radius: primaryRadius, count: primaryCount, ...primarySize },
    ];
    if (secondaryCount > 0) {
        rings.push({
            ring: 1,
            radius: secondaryRadiusFor(primaryRadius, secondarySize),
            count: secondaryCount,
            ...secondarySize,
        });
    }

    const cards = rings.flatMap(ring =>
        anglesFor(ring.count).map((angle, position) => ({
            index: ring.ring === 0 ? position : primaryCount + position,
            ring: ring.ring,
            angle,
            ...cardAt(centre, ring.radius, angle, { width: ring.width, height: ring.height }),
        }))
    );

    return { centre, rings, cards };
};

export default buildOrbit;
