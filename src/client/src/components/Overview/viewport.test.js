import { MAX_DETAIL_TIER, WORLD } from './overviewLayout';
import {
    CHAPTER_ZOOM_THRESHOLD,
    INITIAL_VIEWPORT,
    MAX_SCALE,
    MIN_SCALE,
    MIN_VISIBLE,
    areChaptersVisible,
    detailTierForScale,
    interpolateViewports,
    panBy,
    screenToWorld,
    toTransform,
    viewportForRange,
    zoomAt,
} from './viewport';

// Pan and zoom never re-render the SVG — they write one transform attribute.
// That makes this arithmetic the only place the behaviour can be checked, and
// the only place it can go wrong: an anchor that drifts, a scale that runs
// away, or a drag that loses the diagram off the edge of the page all look
// like "the zoom feels wrong" and nothing else.

// The cursor arrives in *fitted* space — the coordinates screenToWorld hands
// back, which have had the viewBox fit removed but not the pan/zoom transform.
// The content point sitting under it is a different thing, and the difference
// is the whole of the anchoring rule: at scale 1 with no pan the two coincide,
// which is why a test that conflates them passes on the first wheel notch from
// rest and drifts on every one after it.
const contentUnder = (viewport, fittedPoint) => ({
    x: (fittedPoint.x - viewport.x) / viewport.scale,
    y: (fittedPoint.y - viewport.y) / viewport.scale,
});

// And back: where a content point lands in fitted space under a viewport.
const project = (viewport, contentPoint) => ({
    x: contentPoint.x * viewport.scale + viewport.x,
    y: contentPoint.y * viewport.scale + viewport.y,
});

describe('the resting viewport', () => {
    test('starts as the identity, showing the whole canon fitted', () => {
        expect(INITIAL_VIEWPORT).toEqual({ scale: MIN_SCALE, x: 0, y: 0 });
    });

    test('renders as a translate then a scale, in that order', () => {
        // Arrange / Act / Assert — the order matters: the translation is in
        // world units, not in scaled ones.
        expect(toTransform({ scale: 2, x: 30, y: -40 })).toBe('translate(30 -40) scale(2)');
    });
});

describe('zoomAt', () => {
    test('multiplies the scale by the factor', () => {
        // Arrange / Act
        const zoomed = zoomAt(INITIAL_VIEWPORT, { x: 90, y: 500 }, 2);

        // Assert
        expect(zoomed.scale).toBe(2);
    });

    test('leaves the verse under the cursor under the cursor', () => {
        // Arrange — an off-centre cursor over an already panned, already
        // zoomed view. This is the case that separates anchoring on the
        // content point from anchoring on the cursor's own coordinates.
        const viewport = { scale: 3, x: -120, y: -700 };
        const cursor = { x: 210, y: 640 };
        const anchor = contentUnder(viewport, cursor);

        // Act
        const zoomed = zoomAt(viewport, cursor, 1.25);

        // Assert — the same verse is still at the cursor.
        expect(project(zoomed, anchor).y).toBeCloseTo(cursor.y, 10);
    });

    test('does not drift as the notches accumulate', () => {
        // Arrange — one wheel gesture is a stream of events, so an anchor that
        // is only right for the first one slides the diagram out from under
        // the reader a few pixels at a time.
        const start = { scale: 1, x: 0, y: 0 };
        const cursor = { x: 130, y: 330 };
        const anchor = contentUnder(start, cursor);

        // Act
        let viewport = start;
        for (let notch = 0; notch < 14; notch += 1) {
            viewport = zoomAt(viewport, cursor, 1.22);
        }

        // Assert
        expect(project(viewport, anchor).y).toBeCloseTo(cursor.y, 8);
    });

    test('does not move the view sideways, however far it zooms', () => {
        // Arrange — the horizontal layout does not magnify: labels and rails
        // counter-transform out of the zoom so they keep their distance from
        // the axis (see offsetFromAxis). Moving the view sideways as well
        // would therefore carry a rigid column off the edge for no gain, and
        // it is what a symmetric zoom-about-the-cursor does if left to it.
        const viewport = { scale: 2, x: -35, y: -400 };

        // Act
        const zoomed = zoomAt(viewport, { x: 400, y: 640 }, 6);

        // Assert — only panning moves x.
        expect(zoomed.x).toBe(-35);
    });

    test('holds the cursor when the factor is clamped away at the ceiling', () => {
        // Arrange — asking for more zoom than allowed still must not shift the
        // picture.
        const viewport = { scale: MAX_SCALE, x: -1000, y: -2000 };
        const cursor = { x: 150, y: 300 };
        const anchor = contentUnder(viewport, cursor);

        // Act
        const zoomed = zoomAt(viewport, cursor, 4);

        // Assert
        expect(zoomed.scale).toBe(MAX_SCALE);
        expect(project(zoomed, anchor).y).toBeCloseTo(cursor.y, 10);
    });

    test('will not zoom in past the ceiling', () => {
        expect(zoomAt({ scale: MAX_SCALE, x: 0, y: 0 }, { x: 0, y: 0 }, 10).scale)
            .toBe(MAX_SCALE);
    });

    test('will not zoom out past the fitted view', () => {
        // Arrange / Act / Assert — MIN_SCALE is the whole Bible on screen;
        // there is nothing further out to see.
        expect(zoomAt(INITIAL_VIEWPORT, { x: 0, y: 0 }, 0.1).scale).toBe(MIN_SCALE);
    });
});

describe('panBy', () => {
    test('moves the content by the world delta it is given', () => {
        // Arrange / Act
        const panned = panBy({ scale: 4, x: 0, y: 0 }, { x: 25, y: -60 });

        // Assert
        expect(panned).toMatchObject({ x: 25, y: -60, scale: 4 });
    });

    test('keeps a strip of the diagram on screen however far it is dragged', () => {
        // Arrange / Act — a flick that would carry the axis off the left edge.
        const panned = panBy(INITIAL_VIEWPORT, { x: -100000, y: -100000 });

        // Assert — the content's right/bottom edge stops at the margin rather
        // than leaving the reader with an empty page and no way back.
        expect(panned.x + WORLD.width * panned.scale).toBeCloseTo(MIN_VISIBLE, 10);
        expect(panned.y + WORLD.height * panned.scale).toBeCloseTo(MIN_VISIBLE, 10);
    });

    test('bounds the sideways drag by the resting width at any zoom', () => {
        // Arrange — the drawing is only ever WORLD.width across, whatever the
        // zoom, so a horizontal bound that grew with the scale would let the
        // reader drag a rigid column right off the page.
        const panned = panBy({ scale: 40, x: 0, y: 0 }, { x: -100000, y: 0 });

        // Act / Assert
        expect(panned.x).toBeCloseTo(MIN_VISIBLE - WORLD.width, 10);
    });

    test('keeps a strip on screen when dragged the other way too', () => {
        // Arrange / Act
        const panned = panBy(INITIAL_VIEWPORT, { x: 100000, y: 100000 });

        // Assert
        expect(panned.x).toBeCloseTo(WORLD.width - MIN_VISIBLE, 10);
        expect(panned.y).toBeCloseTo(WORLD.height - MIN_VISIBLE, 10);
    });

    test('clamps a zoom that would strand the reader off the edge', () => {
        // Arrange — the same rule has to hold for zoom, which also moves the
        // translation.
        const stranded = zoomAt({ scale: 2, x: 700, y: 0 }, { x: 0, y: 0 }, 1.5);

        // Assert
        expect(stranded.x).toBeLessThanOrEqual(WORLD.width - MIN_VISIBLE);
    });
});

describe('screenToWorld', () => {
    // The <svg> fits the world into its box with xMidYMid meet, so the mapping
    // back from a mouse position has to undo both the fit and the letterbox.
    // getScreenCTM would do it in a browser; doing the arithmetic here keeps
    // it testable and keeps the wheel handler honest about what it assumes.
    const rectOf = ({ left = 0, top = 0, width, height }) => ({ left, top, width, height });

    test('maps the middle of the box to the middle of the world', () => {
        // Arrange — a box of the world's own proportions: no letterbox.
        const rect = rectOf({ width: WORLD.width, height: WORLD.height });

        // Act
        const point = screenToWorld({ x: WORLD.width / 2, y: WORLD.height / 2 }, rect);

        // Assert
        expect(point).toEqual({ x: WORLD.width / 2, y: WORLD.height / 2 });
    });

    test('undoes the scale when the box is bigger than the world', () => {
        // Arrange — twice the world's size in both directions.
        const rect = rectOf({ width: WORLD.width * 2, height: WORLD.height * 2 });

        // Act
        const point = screenToWorld({ x: WORLD.width, y: WORLD.height }, rect);

        // Assert
        expect(point).toEqual({ x: WORLD.width / 2, y: WORLD.height / 2 });
    });

    test('undoes the letterbox when the box is wider than the world', () => {
        // Arrange — the world fits by height and is centred, leaving equal
        // empty bands left and right.
        const rect = rectOf({ width: WORLD.width + 200, height: WORLD.height });

        // Act — the left edge of the drawn world, not of the box.
        const point = screenToWorld({ x: 100, y: 0 }, rect);

        // Assert
        expect(point.x).toBeCloseTo(0, 10);
    });

    test('measures from the box, not from the page', () => {
        // Arrange — the same box scrolled down and across the page.
        const rect = rectOf({ left: 40, top: 15, width: WORLD.width, height: WORLD.height });

        // Act
        const point = screenToWorld({ x: 40, y: 15 }, rect);

        // Assert
        expect(point).toEqual({ x: 0, y: 0 });
    });

    test('reports the world origin for a box with no size yet', () => {
        // Arrange — a wheel event can arrive before layout has run.
        const rect = rectOf({ width: 0, height: 0 });

        // Act / Assert
        expect(screenToWorld({ x: 10, y: 10 }, rect)).toEqual({ x: 0, y: 0 });
    });
});

describe('what the current zoom reveals', () => {
    test('hides chapter ticks at rest', () => {
        expect(areChaptersVisible(MIN_SCALE)).toBe(false);
    });

    test('shows chapter ticks once the threshold is reached', () => {
        expect(areChaptersVisible(CHAPTER_ZOOM_THRESHOLD)).toBe(true);
    });

    test('leaves the resting page at the first label tier', () => {
        expect(detailTierForScale(MIN_SCALE)).toBe(0);
    });

    test('reaches the next label tier at twice the scale', () => {
        expect(detailTierForScale(2)).toBe(1);
    });

    test('reaches the tier after that at four times the scale', () => {
        expect(detailTierForScale(4)).toBe(2);
    });

    test('stops at the last tier, which is where every label is showing', () => {
        expect(detailTierForScale(MAX_SCALE)).toBe(MAX_DETAIL_TIER);
    });
});


// ─── 6e: zoom to a region ───────────────────────────────────────────────────
//
// The magnify gesture resolves to one call here, so this is where "the selected
// range fills the viewport" either is or is not true. A region zoom that lands
// slightly off reads as a view that drifted while flying, which is the sort of
// wrongness a reader blames on the gesture rather than on the arithmetic.

describe('zooming to a region', () => {
    test('scales the selected range up to fill the height of the box', () => {
        // Arrange: a tenth of the world, selected from rest.
        const range = { from: 400, to: 500 };

        // Act
        const zoomed = viewportForRange(INITIAL_VIEWPORT, range.from, range.to);

        // Assert
        expect(zoomed.scale).toBe(WORLD.height / (range.to - range.from));
    });

    test('puts both ends of the range inside the box, filling it', () => {
        // Arrange / Act
        const zoomed = viewportForRange(INITIAL_VIEWPORT, 400, 500);

        // Assert: the range projects onto exactly the fitted box.
        expect(project(zoomed, { x: 0, y: 400 }).y).toBeCloseTo(0, 6);
        expect(project(zoomed, { x: 0, y: 500 }).y).toBeCloseTo(WORLD.height, 6);
    });

    test('reads a range dragged upwards the same as one dragged down', () => {
        // Arrange / Act
        const downwards = viewportForRange(INITIAL_VIEWPORT, 400, 500);
        const upwards = viewportForRange(INITIAL_VIEWPORT, 500, 400);

        // Assert
        expect(upwards).toEqual(downwards);
    });

    test('centres the range when the zoom it asks for is past the ceiling', () => {
        // Arrange: a hairline band asks for far more than MAX_SCALE allows.
        const centre = 500;
        const range = { from: centre - 0.05, to: centre + 0.05 };

        // Act
        const zoomed = viewportForRange(INITIAL_VIEWPORT, range.from, range.to);

        // Assert: clamped, and what was selected is in the middle of the box
        // rather than pinned to the top with the rest lost below the fold.
        expect(zoomed.scale).toBe(MAX_SCALE);
        expect(project(zoomed, { x: 0, y: centre }).y).toBeCloseTo(WORLD.height / 2, 6);
    });

    test('never zooms further out than the fitted whole canon', () => {
        // Arrange: a range taller than the world itself.
        // Act
        const zoomed = viewportForRange(INITIAL_VIEWPORT, -500, WORLD.height + 500);

        // Assert
        expect(zoomed.scale).toBe(MIN_SCALE);
    });

    test('leaves the viewport alone when the range has no height', () => {
        // Arrange
        const panned = panBy(INITIAL_VIEWPORT, { x: 0, y: -100 });

        // Act / Assert
        expect(viewportForRange(panned, 300, 300)).toEqual(panned);
    });

    test('resolves a range against the content, not the screen it was drawn on', () => {
        // Arrange: the same content range, selected from two different views.
        const zoomedIn = zoomAt(INITIAL_VIEWPORT, { x: 0, y: 500 }, 8);

        // Act
        const fromRest = viewportForRange(INITIAL_VIEWPORT, 400, 500);
        const fromZoom = viewportForRange(zoomedIn, 400, 500);

        // Assert: where the reader was standing does not change where they land.
        expect(fromZoom.scale).toBeCloseTo(fromRest.scale, 6);
        expect(fromZoom.y).toBeCloseTo(fromRest.y, 6);
    });
});

describe('flying from one viewport to another', () => {
    const target = viewportForRange(INITIAL_VIEWPORT, 400, 500);

    test('starts exactly where it started', () => {
        expect(interpolateViewports(INITIAL_VIEWPORT, target, 0)).toEqual(INITIAL_VIEWPORT);
    });

    test('ends exactly where it was going', () => {
        const landed = interpolateViewports(INITIAL_VIEWPORT, target, 1);

        expect(landed.scale).toBeCloseTo(target.scale, 6);
        expect(landed.y).toBeCloseTo(target.y, 6);
    });

    test('steps the scale by a constant ratio rather than a constant amount', () => {
        // Arrange: three even steps of the same flight.
        // Act
        const scaleAt = (progress) =>
            interpolateViewports(INITIAL_VIEWPORT, target, progress).scale;

        // Assert: equal ratios, which is what makes 1x->2x and 5x->10x feel
        // like the same movement. A linear lerp would spend most of the flight
        // already past the halfway zoom.
        expect(scaleAt(2 / 3) / scaleAt(1 / 3)).toBeCloseTo(scaleAt(1 / 3) / scaleAt(0), 6);
    });

    test('moves the middle of the view at an even rate', () => {
        // Arrange
        const centreAt = (progress) => {
            const at = interpolateViewports(INITIAL_VIEWPORT, target, progress);
            return (WORLD.height / 2 - at.y) / at.scale;
        };

        // Act
        const first = centreAt(0.5) - centreAt(0.25);
        const second = centreAt(0.75) - centreAt(0.5);

        // Assert: the content under the middle of the box travels steadily,
        // which is the half of the flight the reader is actually watching.
        expect(second).toBeCloseTo(first, 6);
    });

    test('holds a progress past either end to the flight it was given', () => {
        expect(interpolateViewports(INITIAL_VIEWPORT, target, 2).scale)
            .toBeCloseTo(target.scale, 6);
        expect(interpolateViewports(INITIAL_VIEWPORT, target, -1).scale)
            .toBeCloseTo(INITIAL_VIEWPORT.scale, 6);
    });
});
