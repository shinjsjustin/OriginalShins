import { buildArcs, bulgeForSpan } from './arcModel';
import { ARC_BULGE, AXIS, RAIL_X, WORLD } from './overviewLayout';
import { yForIndex } from './axisModel';

// ─── What an arc has to get right ───────────────────────────────────────────
//
// One thing above all others: how many of them there are. "Chained, not
// pairwise" is the rule the plan states twice, and getting it wrong produces a
// page that looks busier and richer rather than one that looks broken — a note
// with eight references would draw 28 arcs instead of 7 and read as a dense
// and meaningful cluster. By the time that is noticed it is a rendering
// problem, and the count is quadratic in the data the reader has written.
//
// Everything else here is about the ends of those arcs landing on the rail at
// the y the axis puts their verse, which is the same assertion the stems make
// and for the same reason: a curve in the wrong place still reads as a curve.

const TOTAL_VERSES = 31095;

// Pulls the numbers back out of a path string, so the assertions are about
// geometry rather than about punctuation.
const numbersIn = (d) => (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
const commandsIn = (d) => (d.match(/[A-Z]/g) || []);

describe('buildArcs', () => {
    test('chains a group with five anchors into four arcs, not ten', () => {
        // Arrange — this is the whole phase in one assertion. Pairwise would
        // be n(n-1)/2 = 10; chained is n-1 = 4.
        const tier = [[9, [100, 2000, 9000, 15000, 30000]]];

        // Act
        const [arc] = buildArcs(tier, TOTAL_VERSES, RAIL_X.notes);

        // Assert
        expect(arc.arcCount).toBe(4);
        expect(commandsIn(arc.d).filter(command => command === 'Q')).toHaveLength(4);
    });

    test('keeps the arc count linear in the anchor points', () => {
        // Arrange — twenty references. Pairwise is 190 arcs; chained is 19.
        const anchors = Array.from({ length: 20 }, (unused, index) => 1 + index * 1000);

        // Act
        const [arc] = buildArcs([[9, anchors]], TOTAL_VERSES, RAIL_X.notes);

        // Assert
        expect(arc.arcCount).toBe(anchors.length - 1);
    });

    test('draws one continuous path per group, not one path per arc', () => {
        // Arrange — consecutive arcs share an endpoint, so the chain is a
        // single move followed by one quadratic each. That is what makes the
        // DOM O(groups) and what makes hovering the whole chain free.
        const tier = [[9, [100, 2000, 9000]]];

        // Act
        const [arc] = buildArcs(tier, TOTAL_VERSES, RAIL_X.notes);

        // Assert
        expect(commandsIn(arc.d)).toEqual(['M', 'Q', 'Q']);
    });

    test('starts and ends every arc on the rail it was given', () => {
        // Arrange — an arc joins two points that both live on the rail; only
        // its control point leaves it.
        const tier = [[9, [100, 2000, 9000]]];

        // Act
        const [arc] = buildArcs(tier, TOTAL_VERSES, RAIL_X.notes);
        const [startX, , controlX, , endX] = numbersIn(arc.d);

        // Assert
        expect(startX).toBe(RAIL_X.notes);
        expect(endX).toBe(RAIL_X.notes);
        expect(controlX).toBeGreaterThan(RAIL_X.notes);
    });

    test('puts each endpoint at the y the axis gives its verse', () => {
        // Arrange — the same linear mapping the ticks and the stems use. An
        // arc that ended half a book from its own reference would look exactly
        // like one that did not.
        const tier = [[9, [1, TOTAL_VERSES]]];

        // Act
        const [arc] = buildArcs(tier, TOTAL_VERSES, RAIL_X.notes);
        const [, startY, , , , endY] = numbersIn(arc.d);

        // Assert
        expect(startY).toBeCloseTo(yForIndex(1, TOTAL_VERSES), 2);
        expect(endY).toBeCloseTo(yForIndex(TOTAL_VERSES, TOTAL_VERSES), 2);
        expect(startY).toBe(AXIS.top);
        expect(endY).toBe(AXIS.bottom);
    });

    test('bulges away from the axis, never back across it', () => {
        // Arrange — the gutter between the axis and the rail belongs to the
        // stems. An arc reaching into it would cross a few hundred of them.
        const tier = [[9, [1, 15000, TOTAL_VERSES]]];

        // Act
        const [arc] = buildArcs(tier, TOTAL_VERSES, RAIL_X.notes);
        const controlXs = [numbersIn(arc.d)[2], numbersIn(arc.d)[6]];

        // Assert
        controlXs.forEach(x => {
            expect(x).toBeGreaterThan(RAIL_X.notes);
            expect(x).toBeLessThanOrEqual(RAIL_X.notes + ARC_BULGE.max);
        });
    });

    test('draws nothing for a group with a single anchor', () => {
        // Arrange — one reference has nothing to be chained to. It still gets
        // a stem, which is the whole of what one reference has to say.
        const tier = [[9, [400]], [11, [400, 900]]];

        // Act
        const arcs = buildArcs(tier, TOTAL_VERSES, RAIL_X.notes);

        // Assert
        expect(arcs.map(arc => arc.groupId)).toEqual([11]);
    });

    test('keeps the points of each group, so a click can find the nearest one', () => {
        // Arrange
        const tier = [[9, [100, 2000]]];

        // Act
        const [arc] = buildArcs(tier, TOTAL_VERSES, RAIL_X.notes);

        // Assert
        expect(arc.points.map(point => point.verseIndex)).toEqual([100, 2000]);
    });

    test('hangs the same tier on whichever rail it is given', () => {
        // Arrange — the one thing that differs between the three rails. The
        // ys must be identical (a verse is at one place on the axis, whatever
        // is drawn beside it) and the xs must all move to the new rail, or the
        // "same renderer, different grouping" of this phase is a renderer that
        // quietly knows about notes.
        const tier = [[9, [100, 2000, 9000]]];

        // Act
        const [onNotes] = buildArcs(tier, TOTAL_VERSES, RAIL_X.notes);
        const [onTopics] = buildArcs(tier, TOTAL_VERSES, RAIL_X.topics);

        // Assert
        expect(onTopics.points.map(point => point.y))
            .toEqual(onNotes.points.map(point => point.y));

        const endpointsOf = (arc) => [...arc.d.matchAll(/(?:^M|Q [\d.]+ [\d.]+) ([\d.]+) /g)]
            .map(match => Number(match[1]));
        expect(new Set(endpointsOf(onNotes))).toEqual(new Set([RAIL_X.notes]));
        expect(new Set(endpointsOf(onTopics))).toEqual(new Set([RAIL_X.topics]));
    });

    test('keeps a topics-rail arc inside the world it is drawn in', () => {
        // Arrange — the topics rail is the outermost, and its arcs bulge away
        // from the axis. A quadratic reaches half way to its control point, so
        // the widest possible chain on the widest rail has to stay inside the
        // 560-unit world or the page would clip the tier this phase adds.
        const tier = [[1, [1, TOTAL_VERSES]]];

        // Act
        const [arc] = buildArcs(tier, TOTAL_VERSES, RAIL_X.topics);
        const apex = RAIL_X.topics + bulgeForSpan(AXIS.bottom - AXIS.top) / 2;

        // Assert
        expect(numbersIn(arc.d)[2]).toBe(RAIL_X.topics + ARC_BULGE.max);
        expect(apex).toBeLessThan(WORLD.width);
    });

    describe('a payload that is not what it should be', () => {
        test.each([
            ['missing', undefined],
            ['not an array', { tier: [] }],
            ['null', null],
        ])('draws nothing when the tier is %s', (unused, tier) => {
            // Arrange / Act / Assert
            expect(buildArcs(tier, TOTAL_VERSES, RAIL_X.notes)).toEqual([]);
        });

        test('drops an anchor that names no verse, and chains what is left', () => {
            // Arrange — the axis total comes from /api/books and the anchors
            // from /api/overview. A stray anchor must not become an arc
            // endpoint hanging off the end of the axis.
            const tier = [[9, [0, 100, TOTAL_VERSES + 1, 2000, 9000]]];

            // Act
            const [arc] = buildArcs(tier, TOTAL_VERSES, RAIL_X.notes);

            // Assert
            expect(arc.points.map(point => point.verseIndex)).toEqual([100, 2000, 9000]);
            expect(arc.arcCount).toBe(2);
        });

        test('draws nothing when dropping anchors leaves fewer than two', () => {
            // Arrange / Act
            const arcs = buildArcs([[9, [0, 400, TOTAL_VERSES + 1]]], TOTAL_VERSES, RAIL_X.notes);

            // Assert
            expect(arcs).toEqual([]);
        });

        test('draws nothing when the axis has no verses to map onto', () => {
            // Arrange / Act / Assert
            expect(buildArcs([[9, [4, 90]]], 0, RAIL_X.notes)).toEqual([]);
        });
    });
});

describe('bulgeForSpan', () => {
    test('lifts a short arc clear of the rail it would otherwise lie on', () => {
        // Arrange — several references inside one chapter are a fraction of a
        // unit apart on a 940-unit axis. In proportion that arc is a straight
        // line and the reader cannot see the two points are joined at all.
        // Act / Assert
        expect(bulgeForSpan(0.4)).toBe(ARC_BULGE.min);
    });

    test('stops a whole-canon arc short of the next rail along', () => {
        // Arrange / Act / Assert — the next rail along is 120 units past this
        // one, and a tier's arcs must not reach into it.
        expect(bulgeForSpan(AXIS.bottom - AXIS.top)).toBe(ARC_BULGE.max);
        expect(bulgeForSpan(1e6)).toBe(ARC_BULGE.max);
    });

    test('orders a long arc outside a short one', () => {
        // Arrange / Act / Assert — the bulge carries the span, so a chain
        // across the testaments is visibly a wider curve than one inside a
        // book, even though the root compresses the difference.
        expect(bulgeForSpan(500)).toBeGreaterThan(bulgeForSpan(50));
        expect(bulgeForSpan(50)).toBeGreaterThan(bulgeForSpan(5));
    });

    test('measures a span the same in either direction', () => {
        // Arrange / Act / Assert — points arrive ascending, but nothing about
        // the shape of an arc should depend on that holding.
        expect(bulgeForSpan(-200)).toBe(bulgeForSpan(200));
    });
});
