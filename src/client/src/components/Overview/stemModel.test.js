import { buildStems } from './stemModel';
import { AXIS } from './overviewLayout';
import { yForIndex } from './axisModel';

// ─── What a stem has to get right ───────────────────────────────────────────
//
// One thing: its y. A stem in the wrong place is not a visible failure — it is
// a line that looks exactly like a correct one and points at the wrong book.
// Everything below is about the mapping from the server's verse_index to that
// y, and about not drawing a line for something the server did not send.
//
// The tier it is given is a notes tier, an ideas tier or a topics tier — the
// same shape either way, which is the property that lets one function place
// all three rails and the reason the same verse lines up across them.

const TOTAL_VERSES = 31095;

describe('buildStems', () => {
    test('makes one stem per anchor point', () => {
        // Arrange
        const tier = [[9, [4, 33]], [11, [5]]];

        // Act
        const stems = buildStems(tier, TOTAL_VERSES);

        // Assert
        expect(stems).toHaveLength(3);
        expect(stems.map(stem => stem.groupId)).toEqual([9, 9, 11]);
        expect(stems.map(stem => stem.verseIndex)).toEqual([4, 33, 5]);
    });

    test('places each stem at the y its verse_index maps to', () => {
        // Arrange — the same linear mapping the axis ticks use, so a stem and
        // the tick of the book it falls in land on the same line.
        const tier = [[1, [1, 15548, TOTAL_VERSES]]];

        // Act
        const stems = buildStems(tier, TOTAL_VERSES);

        // Assert
        expect(stems.map(stem => stem.y)).toEqual([
            yForIndex(1, TOTAL_VERSES),
            yForIndex(15548, TOTAL_VERSES),
            yForIndex(TOTAL_VERSES, TOTAL_VERSES),
        ]);
        expect(stems[0].y).toBe(AXIS.top);
        expect(stems[2].y).toBe(AXIS.bottom);
    });

    test('gives every stem a key that is unique across groups', () => {
        // Arrange — two notes anchored to the same verse is ordinary, and
        // both get a stem. A key derived from the verse alone would collapse
        // them into one.
        const tier = [[9, [4]], [11, [4]]];

        // Act
        const keys = buildStems(tier, TOTAL_VERSES).map(stem => stem.key);

        // Assert
        expect(new Set(keys).size).toBe(2);
    });

    test('places the same verse at the same y whatever tier it is in', () => {
        // Arrange — the acceptance criterion of the phase, at the level the
        // geometry can state it: a note, the idea it is filed under and that
        // idea's topic all anchor to the same verse, and their three stems
        // have to line up. They do because all three go through one mapping —
        // which is only worth asserting because three rails is exactly when
        // someone would be tempted to give each its own.
        const noteTier = [[9, [14240]]];
        const ideaTier = [[3, [14240]]];
        const topicTier = [[1, [14240]]];

        // Act
        const ys = [noteTier, ideaTier, topicTier]
            .map(tier => buildStems(tier, TOTAL_VERSES)[0].y);

        // Assert
        expect(new Set(ys).size).toBe(1);
        expect(ys[0]).toBe(yForIndex(14240, TOTAL_VERSES));
    });

    test('draws nothing for a group carrying no anchors', () => {
        // Arrange
        const tier = [[9, []], [11, [7]]];

        // Act
        const stems = buildStems(tier, TOTAL_VERSES);

        // Assert
        expect(stems.map(stem => stem.groupId)).toEqual([11]);
    });

    describe('a payload that is not what it should be', () => {
        test.each([
            ['missing', undefined],
            ['not an array', { tier: [] }],
            ['null', null],
        ])('draws nothing when the tier is %s', (unused, tier) => {
            // Arrange / Act / Assert
            expect(buildStems(tier, TOTAL_VERSES)).toEqual([]);
        });

        test('skips a pair that is not [id, anchors]', () => {
            // Arrange
            const tier = [[9], 'nonsense', [11, 'nonsense'], [12, [7]]];

            // Act
            const stems = buildStems(tier, TOTAL_VERSES);

            // Assert
            expect(stems.map(stem => stem.groupId)).toEqual([12]);
        });

        test('skips an anchor that names no verse on the axis', () => {
            // Arrange — the axis total comes from /api/books and the anchors
            // from /api/overview. If a re-import ever left the two disagreeing,
            // an out-of-range anchor would draw a stem off the end of the axis
            // and read as a real one.
            const tier = [[9, [0, -3, TOTAL_VERSES + 1, 4.5, NaN, '12', 7]]];

            // Act
            const stems = buildStems(tier, TOTAL_VERSES);

            // Assert
            expect(stems.map(stem => stem.verseIndex)).toEqual([7]);
        });

        test('draws nothing when the axis has no verses to map onto', () => {
            // Arrange / Act / Assert
            expect(buildStems([[9, [4]]], 0)).toEqual([]);
        });
    });
});
