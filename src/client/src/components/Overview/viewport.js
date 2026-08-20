import { MAX_DETAIL_TIER, WORLD } from './overviewLayout';

// Pure: the whole of pan and zoom, as arithmetic on a { scale, x, y } value.
//
// A viewport is applied as `translate(x y) scale(s)` on one <g>. Nothing here
// touches the DOM and nothing here is React state — usePanZoom keeps the
// current viewport in a ref and writes the result of these functions straight
// onto the group's transform attribute, which is what lets a wheel gesture run
// at frame rate without re-rendering a single element.

// MIN_SCALE is the fitted view: the whole canon on screen at once, and the
// resting state of the page. There is nothing further out to look at, so
// zooming out stops here rather than shrinking the axis into the middle of an
// empty page.
export const MIN_SCALE = 1;

// At 400x, a single verse is about 12 world units of axis — roughly a line of
// text. Past that the axis is emptier than the label sitting on it.
export const MAX_SCALE = 400;

// Chapter ticks are 1,189 marks over 940 units: at rest they would be a smear.
// At 12x the reader is looking at about five books, which is the scale at
// which a chapter is a thing you can point at.
export const CHAPTER_ZOOM_THRESHOLD = 12;

// However hard the reader flicks, this many world units of the diagram stay
// inside the fitted box. Without it a fast drag ends on a blank page whose
// only recovery is the reset button.
export const MIN_VISIBLE = 120;

export const INITIAL_VIEWPORT = { scale: MIN_SCALE, x: 0, y: 0 };

export const toTransform = ({ x, y, scale }) => `translate(${x} ${y}) scale(${scale})`;

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

/**
 * Keeps a translation inside the range that leaves MIN_VISIBLE units of the
 * scaled content overlapping the fitted box on this axis.
 */
const clampTranslation = (translation, worldExtent, scale) =>
    clamp(translation, MIN_VISIBLE - worldExtent * scale, worldExtent - MIN_VISIBLE);

// The drawing is WORLD.width across at every zoom — the axis labels and the
// rails counter-transform out of the horizontal half of the scale (see
// offsetFromAxis in overviewLayout.js) — so the sideways bound is the resting
// one at any scale. Only the vertical bound opens up as the reader zooms in.
const withTranslation = (scale, x, y) => ({
    scale,
    x: clampTranslation(x, WORLD.width, MIN_SCALE),
    y: clampTranslation(y, WORLD.height, scale),
});

/**
 * Zooms by `factor` about `fittedPoint` — the cursor, in the fitted
 * coordinates screenToWorld returns. The verse under the cursor stays under
 * the cursor; the view does not move sideways.
 *
 * ── The anchor ─────────────────────────────────────────────────────────────
 *
 * Two coordinate systems meet here and conflating them is the classic way to
 * get a zoom that slides. `fittedPoint` (f) has had the viewBox fit removed
 * but not the pan/zoom transform; the piece of the diagram actually under the
 * cursor is the *content* point p = (f - t) / s. Holding that piece still
 * across a scale change means placing it back at f afterwards:
 *
 *     p  = (f - t) / s          the content under the cursor
 *     t' = f - p * s'           put it back where the cursor is
 *
 * At scale 1 with no pan, f and p coincide — which is why anchoring on f
 * directly looks correct on the first wheel notch from rest and drifts on
 * every notch that follows a pan.
 *
 * ── Why only y ─────────────────────────────────────────────────────────────
 *
 * Horizontally there is nothing to magnify. The axis is one line, its labels
 * a rigid column beside it, the rails a fixed distance to the right, and all
 * of them counter-transform out of the horizontal half of the scale so they
 * keep that arrangement at any zoom. Anchoring x as well would slide that
 * rigid column sideways — several hundred pixels at 20x — without ever
 * showing the reader anything new. Sideways is the pan's business.
 *
 * The new scale is clamped *before* the translation is derived from it, or a
 * gesture at the ceiling would shift the picture.
 */
export const zoomAt = (viewport, fittedPoint, factor) => {
    const scale = clamp(viewport.scale * factor, MIN_SCALE, MAX_SCALE);
    const contentY = (fittedPoint.y - viewport.y) / viewport.scale;

    return withTranslation(scale, viewport.x, fittedPoint.y - contentY * scale);
};

/** Pans by a delta already converted to world units. */
export const panBy = (viewport, delta) =>
    withTranslation(viewport.scale, viewport.x + delta.x, viewport.y + delta.y);

/**
 * Undoes the <svg> viewBox fit: turns a client point into the world
 * coordinate under it, before the pan/zoom transform is applied.
 *
 * preserveAspectRatio="xMidYMid meet" scales the world by the smaller of the
 * two ratios and centres the result, so both the scale and the letterbox have
 * to come back off. Doing it arithmetically rather than through getScreenCTM
 * keeps the rule visible and testable.
 */
export const screenToWorld = (point, rect) => {
    const fit = Math.min(rect.width / WORLD.width, rect.height / WORLD.height);
    if (!(fit > 0)) return { x: 0, y: 0 };

    const letterboxX = (rect.width - WORLD.width * fit) / 2;
    const letterboxY = (rect.height - WORLD.height * fit) / 2;

    return {
        x: (point.x - rect.left - letterboxX) / fit,
        y: (point.y - rect.top - letterboxY) / fit,
    };
};

/** World units per client pixel, for turning a drag into a pan. */
export const worldPerPixel = (rect) => {
    const fit = Math.min(rect.width / WORLD.width, rect.height / WORLD.height);
    return fit > 0 ? 1 / fit : 0;
};

export const areChaptersVisible = (scale) => scale >= CHAPTER_ZOOM_THRESHOLD;

/**
 * The highest label tier the current zoom has reached — tier k appears at
 * scale 2^k. Published as one attribute on the <svg>, which is all CSS needs
 * to resolve every crowded label on the page at once.
 */
export const detailTierForScale = (scale) =>
    clamp(Math.floor(Math.log2(Math.max(scale, MIN_SCALE))), 0, MAX_DETAIL_TIER);

/**
 * The viewport that puts the content range [`from`, `to`] — two world y values,
 * before any transform — in the middle of the fitted box, filling its height.
 *
 * This is the whole of 6e's magnify. The plan offers two: "a fisheye on the
 * axis, or simpler, a zoom-to-region on drag". A fisheye is a second, non-
 * linear mapping from verse_index to y living alongside the linear one, and
 * every stem, arc and tick on the page is placed through that mapping — so it
 * is either applied in one transform (which it cannot be, being non-linear) or
 * re-derived per frame for a few thousand elements, which is the one cost this
 * page is arranged from top to bottom not to pay. Zoom-to-region asks for no
 * new mapping at all: it is a scale and a translation, the same two numbers a
 * wheel notch produces, so everything already written to hold the page still
 * under zoom holds it still under this.
 *
 * ── Why the range is centred rather than pinned to the top ─────────────────
 *
 * `scale` is clamped, so a reader who drags a hairline band asks for more zoom
 * than MAX_SCALE allows and gets MAX_SCALE. Pinning the top of the range to the
 * top of the box would then show them the first verse of their band and lose
 * the rest below the fold. Centring puts the band's middle in the middle of the
 * box at whatever scale was granted, so the selection is always the thing in
 * front of the reader.
 *
 * x is carried through untouched: there is nothing to magnify horizontally
 * (see zoomAt), so a region drag says nothing about it.
 *
 * An empty or inverted range leaves the viewport alone rather than dividing by
 * zero — the caller has already decided such a drag was not a gesture, and this
 * is the arithmetic agreeing rather than a second policy.
 */
export const viewportForRange = (viewport, from, to) => {
    const top = Math.min(from, to);
    const bottom = Math.max(from, to);
    const span = bottom - top;
    if (!(span > 0)) return viewport;

    const scale = clamp(WORLD.height / span, MIN_SCALE, MAX_SCALE);
    const centre = (top + bottom) / 2;

    return withTranslation(scale, viewport.x, WORLD.height / 2 - centre * scale);
};

/**
 * A viewport `progress` of the way from `from` to `to`, for animating between
 * the two.
 *
 * ── Why scale is interpolated geometrically ────────────────────────────────
 *
 * Zoom is multiplicative: 1x to 2x and 20x to 40x are the same movement to the
 * eye, and lerping the scale linearly spends most of a 1x -> 40x animation
 * already past 20x, so the flight reads as a lurch and then a crawl. Stepping
 * by a constant RATIO makes every frame the same apparent zoom, which is the
 * same reasoning behind the exponential wheel factor in usePanZoom.
 *
 * ── And why the translation is not ─────────────────────────────────────────
 *
 * Lerping `y` alongside a geometric scale sends the picture on a curve away
 * from both endpoints — the two terms are moving on different clocks, and what
 * the reader watches is the content, not the translation. So the thing
 * interpolated is the content point sitting at the CENTRE of the box, which
 * travels from wherever the reader was to the middle of what they selected at
 * an even rate, and `y` is derived from it at each step. Both endpoints come
 * out exactly `from` and `to`, because at progress 0 and 1 the centre and the
 * scale are each endpoint's own.
 */
export const interpolateViewports = (from, to, progress) => {
    const t = clamp(progress, 0, 1);
    const scale = from.scale * ((to.scale / from.scale) ** t);
    const centre = centreOf(from) + (centreOf(to) - centreOf(from)) * t;

    return withTranslation(scale, from.x + (to.x - from.x) * t, WORLD.height / 2 - centre * scale);
};

/** The content y sitting at the vertical middle of the fitted box. */
const centreOf = ({ y, scale }) => (WORLD.height / 2 - y) / scale;
