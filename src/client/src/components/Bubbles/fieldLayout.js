// Pure: N topics + a canvas size -> where each topic card sits.
//
// ── Why a function and not CSS ─────────────────────────────────────────────
//
// A flex-wrap grid would place these cards for free. What it would not give
// back is the coordinates, and the spotlight hover needs them: the fan of a
// topic's ideas opens from the topic's own centre (fanLayout.js), and it has to
// know which way the canvas edge is. Once the fan needs the numbers, the field
// may as well own them, and owning them makes the arrangement testable without
// a browser — which is the difference between "no card is off the canvas" being
// an assertion and being a thing someone eyeballs at one window size.
//
// ── Grid-ish, and centred ──────────────────────────────────────────────────
//
// The column count comes from the shape of the canvas rather than from a fixed
// number, so a wide window gets a wide field and a tall one a tall field, and
// neither gets the twenty-five-in-a-row that a fixed count produces at the
// other aspect ratio. The field is then centred as a block, with a short last
// row centred within itself, so the field reads as one object on the canvas
// rather than as something anchored to the top-left with an empty corner.
//
// ── Shrinking is how it fits ───────────────────────────────────────────────
//
// A field with more topics than the canvas holds at full size scales the cards
// down uniformly until it fits. The alternative — keep the card size and let
// the field overflow — is worse than it sounds: this canvas clips, so an
// overflowing card is not merely off-screen, it is a topic the reader has no
// way to hover and therefore no way to open. A card that got smaller is still
// a card.

// One topic card at rest. Wide rather than square because the card carries a
// name that is usually a phrase, plus its idea count underneath.
export const TOPIC_CARD = Object.freeze({ width: 168, height: 104 });

// The gap between neighbouring cards. Wider than it needs to be for looks: the
// spotlight hover treats a topic and its fan as one region, and the reader
// travels between topics through these gaps, so they have to be big enough to
// be aimed at.
export const FIELD_GUTTER = Object.freeze({ x: 28, y: 24 });

// The margin the field keeps off every canvas edge — the room a fan belonging
// to a topic on the outside of the field opens into.
export const FIELD_PADDING = 32;

// Two decimals: below what a display can resolve, and enough to stop a card's
// left edge from carrying seventeen digits into a style attribute that React
// diffs on every hover.
const PRECISION = 2;

const round = (value) => Number(value.toFixed(PRECISION));

const CELL = Object.freeze({
    width: TOPIC_CARD.width + FIELD_GUTTER.x,
    height: TOPIC_CARD.height + FIELD_GUTTER.y,
});

const isUsableCanvas = (canvas) =>
    Boolean(canvas)
    && Number.isFinite(canvas.width) && Number.isFinite(canvas.height)
    && canvas.width - FIELD_PADDING * 2 > 0
    && canvas.height - FIELD_PADDING * 2 > 0;

/**
 * How many columns a field of `count` gets on a canvas of this shape.
 *
 * The square root of the count is the square arrangement; dividing the canvas
 * aspect by the cell aspect stretches that square to the canvas, so the field
 * ends up about as wide-to-tall as the space it is drawn in. Rounding rather
 * than flooring keeps 8 at three columns instead of two, which is the
 * difference between three tidy rows and four.
 */
const columnsFor = (count, canvas) => {
    const cellAspect = CELL.width / CELL.height;
    const ideal = Math.sqrt((count * (canvas.width / canvas.height)) / cellAspect);

    return Math.min(Math.max(Math.round(ideal), 1), count);
};

/**
 * Where every topic card goes.
 *
 * @param topics [{ id, ... }] in the order they should be laid out
 * @param canvas { width, height } of the drawing area, measured from the DOM
 * @returns [{ id, x, y, width, height }] — x,y is the card's top-left corner,
 *          in canvas coordinates; [] if there is nothing, or nowhere, to draw
 */
export const buildField = (topics, canvas) => {
    if (!Array.isArray(topics) || topics.length === 0) return [];
    if (!isUsableCanvas(canvas)) return [];

    const columns = columnsFor(topics.length, canvas);
    const rows = Math.ceil(topics.length / columns);

    // The field at full size. The trailing gutter of the last column and last
    // row is not part of it — a gutter is a gap between two cards, and there
    // is no card after the last one.
    const fullWidth = columns * CELL.width - FIELD_GUTTER.x;
    const fullHeight = rows * CELL.height - FIELD_GUTTER.y;

    // Never above 1: a field that fits is drawn at its own size, not blown up
    // to fill the canvas.
    const scale = Math.min(
        1,
        (canvas.width - FIELD_PADDING * 2) / fullWidth,
        (canvas.height - FIELD_PADDING * 2) / fullHeight
    );

    const cardWidth = TOPIC_CARD.width * scale;
    const cardHeight = TOPIC_CARD.height * scale;
    const cellWidth = CELL.width * scale;
    const cellHeight = CELL.height * scale;

    const top = (canvas.height - fullHeight * scale) / 2;

    return topics.map((topic, index) => {
        const row = Math.floor(index / columns);
        const column = index % columns;

        // Each row is centred on its own count, so a last row of two under a
        // grid of five sits under the middle of the field rather than under
        // its left edge.
        const inRow = Math.min(columns, topics.length - row * columns);
        const rowWidth = inRow * cellWidth - FIELD_GUTTER.x * scale;
        const rowLeft = (canvas.width - rowWidth) / 2;

        return {
            id: topic.id,
            x: round(rowLeft + column * cellWidth),
            y: round(top + row * cellHeight),
            width: round(cardWidth),
            height: round(cardHeight),
        };
    });
};

export default buildField;
