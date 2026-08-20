import {
    buildOrbit,
    NOTE_CARD,
    ORBIT_CARD_SCALES,
    ORBIT_SPLIT_THRESHOLD,
    ORBIT_CENTRE_CLEARANCE,
    ORBIT_START_ANGLE,
} from './orbitLayout';

// ─── What a ring of notes has to get right ──────────────────────────────────
//
// The idea view is one enlarged idea card at the centre with its notes around
// it, and the ring carries a claim the reader can read straight off the shape:
// these notes all belong to that idea, equally, and none of them is first.
// Two things hold that claim up.
//
//   • The spacing is even. An uneven ring reads as grouping — three notes
//     bunched on the left look related to each other in a way the fourth is
//     not — and that grouping is not in the data.
//   • The split is at a stated count, not at whatever happens to fit. Ten
//     notes ring comfortably; the eleventh has to go somewhere, and it goes on
//     a second, smaller ring inside the first rather than squeezing the ring
//     it could not fit on.
//
// The threshold is tested from both sides, because "more than ten" and "ten or
// more" differ by exactly the case a reader with ten notes sees.

const CANVAS = { width: 1200, height: 800 };
const CENTRE = { x: CANVAS.width / 2, y: CANVAS.height / 2 };

const centreOf = (card) => ({ x: card.x + card.width / 2, y: card.y + card.height / 2 });

const radiusOf = (card) => {
    const middle = centreOf(card);
    return Math.hypot(middle.x - CENTRE.x, middle.y - CENTRE.y);
};

const ringOf = (orbit, ring) => orbit.cards.filter(card => card.ring === ring);

const notes = (count) => buildOrbit(count, CANVAS);

// Angular gaps around the whole ring, including the wrap from last back to
// first — the gap an "evenly spaced" ring is most likely to get wrong.
const gapsAround = (cards) => {
    const angles = cards.map(card => card.angle);
    return angles.map((angle, index) =>
        (index === angles.length - 1
            ? angles[0] + Math.PI * 2 - angle
            : angles[index + 1] - angle)
    );
};

describe('buildOrbit — one ring', () => {
    test.each([1, 2, 5, ORBIT_SPLIT_THRESHOLD])('rings %i notes without splitting', (count) => {
        // Arrange / Act — ten is the last count that fits on one ring, and a
        // reader with exactly ten should not see the split.
        const orbit = notes(count);

        // Assert
        expect(orbit.rings).toHaveLength(1);
        expect(orbit.cards).toHaveLength(count);
        expect(ringOf(orbit, 0)).toHaveLength(count);
    });

    test.each([1, 3, 7, ORBIT_SPLIT_THRESHOLD])('spaces %i notes evenly around the ring', (count) => {
        // Arrange / Act
        const orbit = notes(count);

        // Assert — every gap equal, and equal to a full turn divided by the
        // count, which is the same statement made two ways on purpose: the
        // first catches bunching, the second catches a ring that is evenly
        // spaced across less than the whole circle.
        gapsAround(orbit.cards).forEach(gap => {
            expect(gap).toBeCloseTo((Math.PI * 2) / count, 6);
        });
    });

    test('puts every note on one ring the same distance out', () => {
        // Arrange / Act — a ring, not a spiral. Varying radii would read as a
        // ranking the notes do not have.
        const orbit = notes(8);

        // Assert
        const radii = orbit.cards.map(radiusOf);
        radii.forEach(radius => expect(radius).toBeCloseTo(orbit.rings[0].radius, 1));
    });

    test('starts the ring at twelve o\'clock', () => {
        // Arrange / Act / Assert — a stated starting angle, so the first note
        // is in the same place every time the view opens rather than wherever
        // the arithmetic happened to begin.
        expect(notes(6).cards[0].angle).toBeCloseTo(ORBIT_START_ANGLE, 6);
    });

    test('centres the orbit on the canvas, where the idea card is', () => {
        // Arrange / Act / Assert — the notes ring the idea, so they share its
        // centre by construction rather than by both being placed near it.
        expect(notes(6).centre).toEqual(CENTRE);
    });

    test('draws every note at the full card size on one ring', () => {
        // Arrange / Act / Assert
        notes(6).cards.forEach(card => {
            expect(card.width).toBe(NOTE_CARD.width);
            expect(card.height).toBe(NOTE_CARD.height);
        });
    });
});

describe('buildOrbit — the split into a second ring', () => {
    test('splits the moment there is one note too many', () => {
        // Arrange — the seam. Ten rings; eleven opens a second ring holding
        // exactly the one that did not fit.
        // Act
        const orbit = notes(ORBIT_SPLIT_THRESHOLD + 1);

        // Assert
        expect(orbit.rings).toHaveLength(2);
        expect(ringOf(orbit, 0)).toHaveLength(ORBIT_SPLIT_THRESHOLD);
        expect(ringOf(orbit, 1)).toHaveLength(1);
    });

    test('fills the first ring before it uses the second', () => {
        // Arrange — thirty notes: the outer ring keeps its ten and the rest
        // go inside. Splitting them evenly instead would make a reader's
        // eleventh note rearrange the ten they already knew the shape of.
        // Act
        const orbit = notes(30);

        // Assert
        expect(ringOf(orbit, 0)).toHaveLength(ORBIT_SPLIT_THRESHOLD);
        expect(ringOf(orbit, 1)).toHaveLength(30 - ORBIT_SPLIT_THRESHOLD);
    });

    test('draws every one of thirty notes exactly once, in order', () => {
        // Arrange / Act — a note on neither ring is a note with no way back
        // to it, since this view is the only place notes are shown.
        const orbit = notes(30);

        // Assert
        expect(orbit.cards.map(card => card.index)).toEqual(
            Array.from({ length: 30 }, (unused, index) => index)
        );
    });

    test('spaces the second ring evenly too', () => {
        // Arrange / Act — the inner ring is a ring in its own right, spread
        // over its own count, not the leftovers of the outer one's spacing.
        const orbit = notes(30);

        // Assert
        gapsAround(ringOf(orbit, 1)).forEach(gap => {
            expect(gap).toBeCloseTo((Math.PI * 2) / (30 - ORBIT_SPLIT_THRESHOLD), 6);
        });
    });

    test('sets the second ring inside the first', () => {
        // Arrange / Act — "smaller concentric ring", so the overflow tucks
        // into the space between the idea card and the notes already there
        // rather than pushing the whole orbit outwards.
        const orbit = notes(30);

        // Assert
        expect(orbit.rings[1].radius).toBeLessThan(orbit.rings[0].radius);
        ringOf(orbit, 1).forEach(card => {
            expect(radiusOf(card)).toBeCloseTo(orbit.rings[1].radius, 1);
        });
    });

    test('draws the second ring\'s cards one size step smaller', () => {
        // Arrange / Act — the inner ring has less circumference per card, and
        // the smaller card is also what marks it as the overflow rather than
        // as a second, equal ring.
        const orbit = notes(30);

        // Assert
        ringOf(orbit, 1).forEach(card => {
            expect(card.width).toBeLessThan(NOTE_CARD.width);
            expect(card.width).toBeCloseTo(NOTE_CARD.width * ORBIT_CARD_SCALES.secondary, 1);
        });
    });

    test('keeps the inner ring clear of the idea card at the centre', () => {
        // Arrange — the idea card is enlarged and holds the middle of the
        // canvas. A ring drawn inside its footprint would put note cards on
        // top of the body text the view exists to show.
        // Act
        const orbit = notes(30);
        const inner = orbit.rings[1];

        // Assert
        const reachesIn = inner.radius - Math.max(inner.width, inner.height) / 2;
        expect(reachesIn).toBeGreaterThanOrEqual(ORBIT_CENTRE_CLEARANCE);
    });
});

describe('buildOrbit — staying on the canvas', () => {
    test.each([1, ORBIT_SPLIT_THRESHOLD, 30])('keeps all %i note cards inside the canvas', (count) => {
        // Arrange / Act
        const orbit = notes(count);

        // Assert
        orbit.cards.forEach(card => {
            expect(card.x).toBeGreaterThanOrEqual(0);
            expect(card.y).toBeGreaterThanOrEqual(0);
            expect(card.x + card.width).toBeLessThanOrEqual(CANVAS.width);
            expect(card.y + card.height).toBeLessThanOrEqual(CANVAS.height);
        });
    });

    test('pulls the rings in rather than spilling off a small canvas', () => {
        // Arrange — a canvas with no room to honour both the centre clearance
        // and the edges. The edge wins: a card off the canvas is a note the
        // reader cannot open at all, while a ring drawn tight against the
        // idea card is only crowded.
        const small = { width: 520, height: 420 };

        // Act
        const orbit = buildOrbit(30, small);

        // Assert
        expect(orbit.cards).toHaveLength(30);
        orbit.cards.forEach(card => {
            expect(card.x).toBeGreaterThanOrEqual(0);
            expect(card.y).toBeGreaterThanOrEqual(0);
            expect(card.x + card.width).toBeLessThanOrEqual(small.width);
            expect(card.y + card.height).toBeLessThanOrEqual(small.height);
        });
    });
});

describe('buildOrbit — stability', () => {
    test.each([1, ORBIT_SPLIT_THRESHOLD, ORBIT_SPLIT_THRESHOLD + 1, 30])(
        'returns the same orbit twice for %i notes',
        (count) => {
            // Arrange / Act / Assert — the view re-renders on every pin toggle
            // and every edit in the panel. A ring that shifted between two
            // identical renders would animate on its own.
            expect(notes(count)).toEqual(notes(count));
        }
    );
});

describe('buildOrbit — an orbit that is not what it should be', () => {
    const EMPTY = { cards: [], rings: [] };

    test.each([
        ['zero', 0],
        ['negative', -4],
        ['missing', undefined],
        ['not a number', 'nine'],
        ['fractional', 3.5],
    ])('draws nothing when the note count is %s', (unused, count) => {
        // Arrange / Act / Assert — an idea with no notes yet is the common
        // case straight after creating one.
        expect(buildOrbit(count, CANVAS)).toMatchObject(EMPTY);
    });

    test.each([
        ['missing', undefined],
        ['zero-sized', { width: 0, height: 0 }],
        ['negative', { width: -10, height: 400 }],
    ])('draws nothing when the canvas is %s', (unused, canvas) => {
        // Arrange / Act / Assert — measured from the DOM, so the first render
        // happens before there is a size.
        expect(buildOrbit(6, canvas)).toMatchObject(EMPTY);
    });
});
