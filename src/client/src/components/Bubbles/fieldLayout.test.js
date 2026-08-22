import { buildField, TOPIC_CARD, FIELD_GUTTER, FIELD_PADDING } from './fieldLayout';

// ─── What a field of topics has to get right ────────────────────────────────
//
// These assertions are invariants, not pixels. A test that pins the third card
// of eight to x=418.5 fails the first time anyone nudges a gutter, and it fails
// without saying anything true — the layout was never wrong, the number was.
// What must never change is the shorter list: every topic is drawn, none is
// drawn off the canvas where it cannot be hovered, none is drawn on top of
// another, and the same field twice is the same field (React re-renders this
// on every hover, and a layout that drifts by a subpixel per render animates
// on its own).
//
// The three counts are the three shapes the page actually has: one topic, a
// handful, and a corpus that has been used for a while.

const CANVAS = { width: 1200, height: 800 };

const topics = (count) =>
    Array.from({ length: count }, (unused, index) => ({ id: index + 1, name: `Topic ${index + 1}` }));

const overlaps = (a, b) =>
    a.x < b.x + b.width && b.x < a.x + a.width
    && a.y < b.y + b.height && b.y < a.y + a.height;

const boundsOf = (cards) => ({
    left: Math.min(...cards.map(card => card.x)),
    right: Math.max(...cards.map(card => card.x + card.width)),
    top: Math.min(...cards.map(card => card.y)),
    bottom: Math.max(...cards.map(card => card.y + card.height)),
});

const COUNTS = [1, 8, 25];

describe('buildField', () => {
    test.each(COUNTS)('draws every one of %i topics exactly once', (count) => {
        // Arrange / Act
        const cards = buildField(topics(count), CANVAS);

        // Assert — a topic the layout drops is a topic the reader cannot
        // reach at all; there is no list view to fall back on.
        expect(cards).toHaveLength(count);
        expect(cards.map(card => card.id)).toEqual(topics(count).map(topic => topic.id));
    });

    test.each(COUNTS)('keeps all %i cards inside the canvas', (count) => {
        // Arrange / Act
        const cards = buildField(topics(count), CANVAS);

        // Assert — the canvas clips, and a card half outside it is a hover
        // target the reader cannot land on.
        cards.forEach(card => {
            expect(card.x).toBeGreaterThanOrEqual(0);
            expect(card.y).toBeGreaterThanOrEqual(0);
            expect(card.x + card.width).toBeLessThanOrEqual(CANVAS.width);
            expect(card.y + card.height).toBeLessThanOrEqual(CANVAS.height);
        });
    });

    test.each(COUNTS)('overlaps none of the %i cards with another', (count) => {
        // Arrange / Act
        const cards = buildField(topics(count), CANVAS);

        // Assert — overlapping cards are two hover targets in one place, and
        // the spotlight hover on this page is what opens the fan.
        cards.forEach((card, index) => {
            cards.slice(index + 1).forEach(other => {
                expect(overlaps(card, other)).toBe(false);
            });
        });
    });

    test.each(COUNTS)('centres the field of %i in the canvas', (count) => {
        // Arrange / Act
        const bounds = boundsOf(buildField(topics(count), CANVAS));

        // Assert — equal margins on opposite sides. The last row may be short
        // and is centred within itself, so the field's own box stays square to
        // the canvas whatever the remainder is.
        expect(bounds.left).toBeCloseTo(CANVAS.width - bounds.right, 6);
        expect(bounds.top).toBeCloseTo(CANVAS.height - bounds.bottom, 6);
    });

    test.each(COUNTS)('returns the same field twice for %i topics', (count) => {
        // Arrange — this is recomputed on every hover. Anything non-
        // deterministic here reads on screen as cards that will not sit still.
        const input = topics(count);

        // Act
        const first = buildField(input, CANVAS);
        const second = buildField(input, CANVAS);

        // Assert
        expect(second).toEqual(first);
    });

    test('gives every card the same size', () => {
        // Arrange — a topic is a topic. Cards that differ in size read as a
        // ranking the data does not have.
        // Act
        const cards = buildField(topics(25), CANVAS);

        // Assert
        const sizes = new Set(cards.map(card => `${card.width}x${card.height}`));
        expect(sizes.size).toBe(1);
    });

    test('draws a small field at the full card size', () => {
        // Arrange — shrinking is the response to a field that will not fit,
        // not the resting state. Eight cards on a wide canvas fit.
        // Act
        const [card] = buildField(topics(8), CANVAS);

        // Assert
        expect(card.width).toBe(TOPIC_CARD.width);
        expect(card.height).toBe(TOPIC_CARD.height);
    });

    test('shrinks the cards rather than spilling off a small canvas', () => {
        // Arrange — the same 25 topics on a canvas too small to hold them at
        // full size. Something has to give, and it is the card size: a topic
        // pushed off the edge is unreachable, a topic drawn smaller is not.
        const small = { width: 600, height: 400 };

        // Act
        const cards = buildField(topics(25), small);

        // Assert
        expect(cards).toHaveLength(25);
        expect(cards[0].width).toBeLessThan(TOPIC_CARD.width);
        cards.forEach(card => {
            expect(card.x + card.width).toBeLessThanOrEqual(small.width);
            expect(card.y + card.height).toBeLessThanOrEqual(small.height);
        });
    });

    test('keeps the grid roughly square rather than one long row', () => {
        // Arrange — the arrangement is grid-ish on purpose. Twenty-five in a
        // row would be legible only after shrinking them to nothing.
        // Act
        const bounds = boundsOf(buildField(topics(25), CANVAS));

        // Assert
        const aspect = (bounds.right - bounds.left) / (bounds.bottom - bounds.top);
        expect(aspect).toBeGreaterThan(0.5);
        expect(aspect).toBeLessThan(2.5);
    });

    test('leaves a gutter between neighbouring cards', () => {
        // Arrange — the hover region is the whole cluster, so cards that touch
        // give the reader no gap in which to leave one and enter another.
        // Act
        const cards = buildField(topics(8), CANVAS);

        // Assert
        const rowTops = [...new Set(cards.map(card => card.y))];
        const firstRow = cards.filter(card => card.y === rowTops[0]);
        expect(firstRow[1].x - (firstRow[0].x + firstRow[0].width)).toBeCloseTo(FIELD_GUTTER.x, 6);
    });

    test('holds the field clear of the canvas edge', () => {
        // Arrange / Act
        const bounds = boundsOf(buildField(topics(25), CANVAS));

        // Assert — the padding is what the fan of a topic on the outside of
        // the field has to open into.
        expect(bounds.left).toBeGreaterThanOrEqual(FIELD_PADDING);
        expect(bounds.top).toBeGreaterThanOrEqual(FIELD_PADDING);
    });
});

describe('buildField — a field that is not what it should be', () => {
    test.each([
        ['missing', undefined],
        ['null', null],
        ['not an array', { topics: [] }],
        ['empty', []],
    ])('draws nothing when the topics are %s', (unused, input) => {
        // Arrange / Act / Assert — a reader with no topics yet sees the empty
        // state, not a crash on the first render of the page.
        expect(buildField(input, CANVAS)).toEqual([]);
    });

    test.each([
        ['missing', undefined],
        ['zero-sized', { width: 0, height: 0 }],
        ['negative', { width: -100, height: 400 }],
    ])('draws nothing when the canvas is %s', (unused, canvas) => {
        // Arrange / Act / Assert — the canvas is measured from the DOM, so
        // the first render happens before it has a size.
        expect(buildField(topics(8), canvas)).toEqual([]);
    });
});
