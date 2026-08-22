import {
    buildFan,
    FAN_CARD,
    FAN_CARD_SCALES,
    FAN_TIGHTEN_THRESHOLD,
    FAN_ROW_CAPACITY,
    FAN_RADIUS,
    FAN_SPREAD,
    FAN_EDGE_PADDING,
} from './fanLayout';

// ─── What the spotlight fan has to get right ────────────────────────────────
//
// The fan is the only way into an idea. It opens on hover, out of a topic card
// that may be anywhere in the field, and everything it draws has to end up
// somewhere the reader can actually put a cursor. Two failures matter:
//
//   • A fan that runs off the canvas. The topic the reader hovers is as often
//     on the outside of the field as the inside, and the canvas clips — so an
//     idea drawn past the edge is not "mostly visible", it is unreachable.
//     Hence the fan aims itself inward and is then clamped as a backstop.
//   • A fan that keeps its angular step as the count grows. Twenty ideas at a
//     comfortable step is nearly two full turns: the arc wraps onto itself and
//     the last ideas are drawn over the first. The arc tightens instead, and
//     past what one arc holds a second one opens behind a chip.
//
// The counts below are the thresholds themselves — 1, 5, 15, 30 — because
// every one of them is a different branch and the seams between them are where
// a fan stops being a fan.

const CANVAS = { width: 1200, height: 800 };
const CENTRE = { x: CANVAS.width / 2, y: CANVAS.height / 2 };

const centreOf = (card) => ({ x: card.x + card.width / 2, y: card.y + card.height / 2 });

// Positions come back rounded to the CSS pixel, so a radius recovered from
// them is exact to a rounding error rather than to the last bit. One decimal
// is still two orders of magnitude tighter than anything that would make an
// arc stop looking like one.
const RADIUS_PRECISION = 1;

const radiusOf = (card, origin) => {
    const middle = centreOf(card);
    return Math.hypot(middle.x - origin.x, middle.y - origin.y);
};

const rowOf = (fan, row) => fan.cards.filter(card => card.row === row);

const stepsIn = (cards) =>
    cards.slice(1).map((card, index) => card.angle - cards[index].angle);

const isInside = (box, canvas) =>
    box.x >= 0 && box.y >= 0
    && box.x + box.width <= canvas.width
    && box.y + box.height <= canvas.height;

describe('buildFan — one idea', () => {
    test('places the single card straight out along the fan\'s bearing', () => {
        // Arrange / Act — with nothing to spread against, an arc of one is a
        // point, and the point belongs on the axis the fan opens along.
        const fan = buildFan(1, CENTRE, CANVAS);

        // Assert
        expect(fan.cards).toHaveLength(1);
        expect(fan.cards[0].angle).toBeCloseTo(fan.bearing, 6);
        expect(fan.rows).toBe(1);
        expect(fan.overflow).toBeNull();
    });

    test('draws one idea at the full card size', () => {
        // Arrange / Act / Assert — shrinking is what a crowded arc does, not
        // the resting state of the fan.
        expect(buildFan(1, CENTRE, CANVAS).scale).toBe(FAN_CARD_SCALES.full);
    });
});

describe('buildFan — a handful of ideas', () => {
    test('spreads five ideas at the fan\'s comfortable step', () => {
        // Arrange — five is well under what one arc holds, so the step is the
        // resting one and the arc is only as wide as it needs to be.
        // Act
        const fan = buildFan(5, CENTRE, CANVAS);

        // Assert
        stepsIn(fan.cards).forEach(step => expect(step).toBeCloseTo(FAN_SPREAD.perCard, 6));
        expect(fan.cards).toHaveLength(5);
        expect(fan.rows).toBe(1);
        expect(fan.overflow).toBeNull();
    });

    test('keeps five ideas at the full card size', () => {
        // Arrange / Act / Assert
        expect(buildFan(5, CENTRE, CANVAS).scale).toBe(FAN_CARD_SCALES.full);
    });

    test('shrinks the cards one step once the arc gets crowded', () => {
        // Arrange — one step, at one threshold. Two sizes on this page, not a
        // sliding scale: a fan whose card size varies continuously with the
        // count makes two topics of similar size look different for no reason
        // the reader can name.
        // Act
        const roomy = buildFan(FAN_TIGHTEN_THRESHOLD, CENTRE, CANVAS);
        const crowded = buildFan(FAN_TIGHTEN_THRESHOLD + 1, CENTRE, CANVAS);

        // Assert
        expect(roomy.scale).toBe(FAN_CARD_SCALES.full);
        expect(crowded.scale).toBe(FAN_CARD_SCALES.tight);
        expect(crowded.cards[0].width).toBe(Math.round(FAN_CARD.width * FAN_CARD_SCALES.tight * 100) / 100);
    });

    test('centres the arc on the bearing whatever the count', () => {
        // Arrange — the fan opens symmetrically out of the topic. An arc that
        // grew off one end would swing away from the card it belongs to as the
        // count rose.
        // Act / Assert
        [2, 5, FAN_ROW_CAPACITY].forEach(count => {
            const fan = buildFan(count, CENTRE, CANVAS);
            const mean = fan.cards.reduce((sum, card) => sum + card.angle, 0) / count;
            expect(mean).toBeCloseTo(fan.bearing, 6);
        });
    });
});

describe('buildFan — a full arc', () => {
    test('holds fifteen ideas on one arc, tightened to its widest spread', () => {
        // Arrange — fifteen is what one arc takes. The spread has hit its
        // ceiling by now, so the step has to give instead: the cards move
        // closer together along an arc that is as wide as it will ever be.
        // Act
        const fan = buildFan(FAN_ROW_CAPACITY, CENTRE, CANVAS);
        const steps = stepsIn(fan.cards);
        const spread = fan.cards[fan.cards.length - 1].angle - fan.cards[0].angle;

        // Assert
        expect(fan.cards).toHaveLength(FAN_ROW_CAPACITY);
        expect(fan.rows).toBe(1);
        expect(fan.overflow).toBeNull();
        expect(spread).toBeCloseTo(FAN_SPREAD.max, 6);
        steps.forEach(step => expect(step).toBeLessThan(FAN_SPREAD.perCard));
    });

    test('never wraps the arc past a full turn', () => {
        // Arrange — the failure the ceiling exists to prevent: an arc wider
        // than 2π draws its last cards on top of its first.
        // Act / Assert
        [FAN_ROW_CAPACITY, FAN_ROW_CAPACITY * 2, 100].forEach(count => {
            const fan = buildFan(count, CENTRE, CANVAS);
            const angles = rowOf(fan, 0).map(card => card.angle);
            expect(Math.max(...angles) - Math.min(...angles)).toBeLessThan(Math.PI * 2);
        });
    });

    test('puts every card of one arc the same distance out', () => {
        // Arrange / Act — it is an arc, not a spiral.
        const fan = buildFan(FAN_ROW_CAPACITY, CENTRE, CANVAS);

        // Assert
        fan.cards.forEach(card => {
            expect(radiusOf(card, CENTRE)).toBeCloseTo(FAN_RADIUS.first, RADIUS_PRECISION);
        });
    });
});

describe('buildFan — past what one arc holds', () => {
    test('opens a second arc and a chip for thirty ideas', () => {
        // Arrange — thirty is two full arcs. The first holds its fifteen, the
        // chip says how many are behind it, and the rest sit on the second.
        // Act
        const fan = buildFan(30, CENTRE, CANVAS);

        // Assert
        expect(fan.rows).toBe(2);
        expect(rowOf(fan, 0)).toHaveLength(FAN_ROW_CAPACITY);
        expect(rowOf(fan, 1)).toHaveLength(30 - FAN_ROW_CAPACITY);
        expect(fan.overflow.count).toBe(30 - FAN_ROW_CAPACITY);
    });

    test('draws every one of the thirty ideas, dropping none behind the chip', () => {
        // Arrange — the chip counts the second arc; it does not replace it.
        // An idea that is neither on an arc nor reachable by expanding one is
        // an idea the reader cannot open.
        // Act
        const fan = buildFan(30, CENTRE, CANVAS);

        // Assert
        expect(fan.cards).toHaveLength(30);
        expect(fan.cards.map(card => card.index)).toEqual(
            Array.from({ length: 30 }, (unused, index) => index)
        );
    });

    test('opens the second arc for a single overflowing idea', () => {
        // Arrange — the seam. One past the capacity is still a second arc, of
        // one, and a chip that says one.
        // Act
        const fan = buildFan(FAN_ROW_CAPACITY + 1, CENTRE, CANVAS);

        // Assert
        expect(fan.rows).toBe(2);
        expect(rowOf(fan, 1)).toHaveLength(1);
        expect(fan.overflow.count).toBe(1);
    });

    test('sets the second arc outside the first', () => {
        // Arrange — concentric, and the overflow goes further out. Inside
        // would put it between the topic card and its own first arc.
        // Act
        const fan = buildFan(30, CENTRE, CANVAS);

        // Assert
        rowOf(fan, 1).forEach(card => {
            expect(radiusOf(card, CENTRE)).toBeCloseTo(FAN_RADIUS.second, RADIUS_PRECISION);
        });
        expect(FAN_RADIUS.second).toBeGreaterThan(FAN_RADIUS.first);
    });

    test('puts the chip at the end of the first arc, past its last card', () => {
        // Arrange — "+N more" belongs where the arc runs out, which is the
        // place the reader's eye is already travelling towards.
        // Act
        const fan = buildFan(30, CENTRE, CANVAS);
        const last = rowOf(fan, 0)[FAN_ROW_CAPACITY - 1];

        // Assert
        expect(fan.overflow.angle).toBeGreaterThan(last.angle);
        expect(radiusOf(fan.overflow, CENTRE)).toBeCloseTo(FAN_RADIUS.first, RADIUS_PRECISION);
    });
});

describe('buildFan — a topic near the edge of the canvas', () => {
    const NEAR_EDGE = [
        ['left', { x: 40, y: 400 }],
        ['right', { x: CANVAS.width - 40, y: 400 }],
        ['top', { x: 600, y: 40 }],
        ['bottom', { x: 600, y: CANVAS.height - 40 }],
        ['top-left corner', { x: 40, y: 40 }],
        ['bottom-right corner', { x: CANVAS.width - 40, y: CANVAS.height - 40 }],
    ];

    test.each(NEAR_EDGE)('keeps a thirty-idea fan on the canvas at the %s', (unused, origin) => {
        // Arrange / Act
        const fan = buildFan(30, origin, CANVAS);

        // Assert — including the chip, which is as clickable as any card.
        fan.cards.forEach(card => expect(isInside(card, CANVAS)).toBe(true));
        expect(isInside(fan.overflow, CANVAS)).toBe(true);
    });

    test.each(NEAR_EDGE)('aims the fan away from the %s edge', (unused, origin) => {
        // Arrange — clamping alone would pile the cards up along the edge.
        // The fan turns to face the room it has first, and the clamp is only
        // the backstop for what is left.
        // Act
        const fan = buildFan(5, origin, CANVAS);
        const mean = fan.cards.reduce(
            (sum, card) => ({ x: sum.x + centreOf(card).x / 5, y: sum.y + centreOf(card).y / 5 }),
            { x: 0, y: 0 }
        );

        // Assert — the fan's mass ends up nearer the middle of the canvas
        // than the topic it opened from.
        const distance = (point) => Math.hypot(point.x - CENTRE.x, point.y - CENTRE.y);
        expect(distance(mean)).toBeLessThan(distance(origin));
    });

    test('holds a fan clear of the very edge it was clamped against', () => {
        // Arrange / Act — clamped to the padding, not to zero, so a card is
        // never flush against the clip boundary.
        const fan = buildFan(30, { x: 10, y: 10 }, CANVAS);

        // Assert
        fan.cards.forEach(card => {
            expect(card.x).toBeGreaterThanOrEqual(FAN_EDGE_PADDING);
            expect(card.y).toBeGreaterThanOrEqual(FAN_EDGE_PADDING);
        });
    });
});

describe('buildFan — stability', () => {
    test.each([1, 5, FAN_ROW_CAPACITY, 30])('returns the same fan twice for %i ideas', (count) => {
        // Arrange — the fan is rebuilt on every render while it is open. A
        // fan that differs between two identical renders shimmers under the
        // cursor that is holding it open.
        // Act / Assert
        expect(buildFan(count, CENTRE, CANVAS)).toEqual(buildFan(count, CENTRE, CANVAS));
    });
});

describe('buildFan — a fan that is not what it should be', () => {
    const EMPTY = { cards: [], rows: 0, overflow: null };

    test.each([
        ['zero', 0],
        ['negative', -3],
        ['missing', undefined],
        ['not a number', 'seven'],
        ['fractional', 2.5],
    ])('draws nothing when the idea count is %s', (unused, count) => {
        // Arrange / Act / Assert — a topic with no ideas hovers to nothing,
        // which is the honest answer and not an empty arc.
        expect(buildFan(count, CENTRE, CANVAS)).toMatchObject(EMPTY);
    });

    test.each([
        ['missing', undefined],
        ['incomplete', { x: 100 }],
        ['not numeric', { x: 'a', y: 'b' }],
    ])('draws nothing when the topic position is %s', (unused, origin) => {
        // Arrange / Act / Assert — the origin is measured from the DOM, so
        // the first render can happen before there is one.
        expect(buildFan(5, origin, CANVAS)).toMatchObject(EMPTY);
    });

    test.each([
        ['missing', undefined],
        ['zero-sized', { width: 0, height: 0 }],
    ])('draws nothing when the canvas is %s', (unused, canvas) => {
        // Arrange / Act / Assert
        expect(buildFan(5, CENTRE, canvas)).toMatchObject(EMPTY);
    });
});
