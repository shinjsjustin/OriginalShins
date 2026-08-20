import { useCallback, useRef, useState } from 'react';
import { capturePointer, releasePointer } from './pointerCapture';
import {
    INITIAL_VIEWPORT,
    areChaptersVisible,
    detailTierForScale,
    interpolateViewports,
    panBy,
    screenToWorld,
    toTransform,
    viewportForRange,
    worldPerPixel,
    zoomAt,
} from './viewport';

// Wheel to zoom, drag to pan — written onto the DOM, not into React state.
//
// ── Why this hook holds the viewport in a ref ──────────────────────────────
//
// A wheel gesture is fifty events a second. If the viewport were state, each
// one would re-render the axis: 66 ticks, 66 labels, and, across three rails,
// every stem and arc on the page, all producing byte-identical output that
// React then diffs against itself. The transform is the only thing that
// actually changed, so the transform is the only thing this writes.
//
// Two DOM writes per event, both on elements React does not manage:
//
//   • the scene <g>'s transform attribute — where the diagram is
//   • two custom properties on the <svg> — how big things look on it
//
// `--ov-inverse-scale` is the reciprocal of the zoom. Overview.css sizes every
// stroke and every font as its design size times that number, so a 3x zoom
// draws a 1/3-width stroke and the reader sees no change. `data-detail-tier`
// is the highest label tier the zoom has reached, which is all CSS needs to
// resolve crowded labels on its own.
//
// A drag does not even get that much: the grab cursor is `.overview-svg:active`
// in CSS, because holding "am I panning?" in state would put a React commit at
// the start and end of every drag for the sake of one cursor.
//
// The one thing that cannot be done this way is chapter detail: those ticks
// have to enter and leave the DOM, so React has to run. That is a single
// boolean, set only when the threshold is actually crossed — once per gesture
// at most, never per event.

// Turns a wheel delta into a zoom factor. Exponential rather than a fixed step
// per notch: a trackpad sends a stream of small deltas and a mouse wheel sends
// occasional large ones, and exp() makes the two feel the same because equal
// total delta gives equal total zoom however it was chopped up.
const ZOOM_SENSITIVITY = 0.002;

// A pointerdown with no `button` is not a real mouse event — some synthetic
// and pen events omit it. Treating that as the primary button is right for
// touch and pen; what matters is that a right-click never starts a drag.
const isPrimaryButton = (event) => (event.button ?? 0) === 0;

// How long the flight to a dragged region takes. Long enough that the reader
// sees WHERE the new view came from — which is the entire reason it is animated
// rather than cut, since a hard jump from the whole canon to four chapters of
// it leaves nobody any way to tell what they are now looking at — and short
// enough that it is never a thing to wait for.
const ZOOM_ANIMATION_MS = 320;

// Ease in and out, so the flight leaves and arrives at rest. Cubic on both
// halves: the standard curve, written out rather than pulled in.
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

// A reader who has asked their system for less motion gets the destination
// rather than the journey. Guarded rather than called directly because jsdom
// implements no matchMedia at all, and a test environment saying nothing about
// motion must not be read as saying "reduce it".
const prefersReducedMotion = () =>
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// requestAnimationFrame is not universal in test environments, and a viewport
// that never arrives because no frame ever fires is a page stuck mid-flight.
// Where there are no frames there is no animation, only the destination.
const canAnimate = () => typeof requestAnimationFrame === 'function';

const usePanZoom = () => {
    const svgRef = useRef(null);
    const sceneRef = useRef(null);
    const viewportRef = useRef(INITIAL_VIEWPORT);
    const dragRef = useRef(null);
    // The frame an in-flight zoom-to-region is waiting on, or null. One at a
    // time: a second gesture takes the picture over from wherever the first
    // had got to rather than the two writing alternate frames.
    const frameRef = useRef(null);

    // Mirrored in a ref so `apply` can decide whether React needs to run at
    // all without reading state it would have to list as a dependency.
    const chaptersShownRef = useRef(areChaptersVisible(INITIAL_VIEWPORT.scale));
    const [areChapterMarksVisible, setAreChapterMarksVisible] = useState(chaptersShownRef.current);

    /** Commits a viewport to the DOM. The only writer in this hook. */
    const apply = useCallback((viewport) => {
        viewportRef.current = viewport;

        if (sceneRef.current) {
            sceneRef.current.setAttribute('transform', toTransform(viewport));
        }
        if (svgRef.current) {
            svgRef.current.style.setProperty('--ov-inverse-scale', String(1 / viewport.scale));
            svgRef.current.setAttribute('data-detail-tier', String(detailTierForScale(viewport.scale)));
        }

        const shouldShowChapters = areChaptersVisible(viewport.scale);
        if (chaptersShownRef.current !== shouldShowChapters) {
            chaptersShownRef.current = shouldShowChapters;
            setAreChapterMarksVisible(shouldShowChapters);
        }
    }, []);

    /** Abandons an in-flight flight, wherever it has reached. */
    const stopAnimation = useCallback(() => {
        if (frameRef.current !== null) {
            cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        }
    }, []);

    /**
     * Flies the viewport to `target` over ZOOM_ANIMATION_MS.
     *
     * The one thing on this page that writes the transform repeatedly without a
     * pointer driving it, and it writes it exactly the way a wheel notch does —
     * through `apply`, straight onto the scene's transform attribute. So an
     * animation is frames of the same two DOM writes and still no re-render,
     * and the reset button, the wheel and a drag can all interrupt it simply by
     * calling `apply` themselves once this has stopped scheduling.
     *
     * The last frame is `apply(target)` exactly rather than the eased value at
     * progress 1, so a flight always lands on the viewport that was asked for
     * and never a floating-point hair away from it.
     */
    const animateTo = useCallback((target) => {
        stopAnimation();

        if (prefersReducedMotion() || !canAnimate()) {
            apply(target);
            return;
        }

        const from = viewportRef.current;
        const startedAt = Date.now();

        const step = () => {
            const progress = Math.min((Date.now() - startedAt) / ZOOM_ANIMATION_MS, 1);

            if (progress >= 1) {
                frameRef.current = null;
                apply(target);
                return;
            }

            apply(interpolateViewports(from, target, easeInOut(progress)));
            frameRef.current = requestAnimationFrame(step);
        };

        frameRef.current = requestAnimationFrame(step);
    }, [apply, stopAnimation]);

    /**
     * 6e's magnify: fly to the content range the reader dragged out, so that
     * range fills the box.
     *
     * Takes world y values — the coordinates the diagram is drawn in, which
     * `toWorldY` returns — rather than a verse_index range, because the axis
     * mapping is linear and this hook has no business knowing what a verse is.
     * useZoomRegion turns the two ends of a drag into these two numbers, and
     * axisModel.indexForY is what makes them a range of the canon.
     */
    const zoomToRange = useCallback((from, to) => {
        animateTo(viewportForRange(viewportRef.current, from, to));
    }, [animateTo]);

    const handleWheel = useCallback((event) => {
        // Without this the page scrolls behind the diagram. It is the reason
        // the listener is registered by hand below: React's onWheel is passive
        // and preventDefault there does nothing.
        event.preventDefault();
        // The reader steering by hand outranks a flight already under way.
        stopAnimation();

        const rect = svgRef.current.getBoundingClientRect();
        const cursor = screenToWorld({ x: event.clientX, y: event.clientY }, rect);

        apply(zoomAt(viewportRef.current, cursor, Math.exp(-event.deltaY * ZOOM_SENSITIVITY)));
    }, [apply, stopAnimation]);

    // Callback refs rather than an effect: the <svg> is not in the tree until
    // the canon has loaded, so an effect keyed on mount would attach its wheel
    // listener to nothing. Both are stable, so React calls them once each.
    const attachSvg = useCallback((node) => {
        if (svgRef.current) {
            svgRef.current.removeEventListener('wheel', handleWheel);
        }
        // Called with null on unmount, which is the only chance this hook gets
        // to stop a flight that would otherwise keep asking for frames and
        // writing to a detached node.
        stopAnimation();

        svgRef.current = node;

        if (node) {
            node.addEventListener('wheel', handleWheel, { passive: false });
            apply(viewportRef.current);
        }
    }, [apply, handleWheel, stopAnimation]);

    const attachScene = useCallback((node) => {
        sceneRef.current = node;
        if (node) apply(viewportRef.current);
    }, [apply]);

    const handlePointerDown = useCallback((event) => {
        if (!isPrimaryButton(event)) return;
        stopAnimation();

        dragRef.current = {
            pointerId: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
        };
        capturePointer(event.currentTarget, event.pointerId);
    }, [stopAnimation]);

    const handlePointerMove = useCallback((event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;

        const perPixel = worldPerPixel(svgRef.current.getBoundingClientRect());

        apply(panBy(viewportRef.current, {
            x: (event.clientX - drag.clientX) * perPixel,
            y: (event.clientY - drag.clientY) * perPixel,
        }));

        dragRef.current = { ...drag, clientX: event.clientX, clientY: event.clientY };
    }, [apply]);

    const handlePointerUp = useCallback((event) => {
        const drag = dragRef.current;
        if (!drag) return;

        // Cleared first: the drag is over whatever the browser says about the
        // capture it may or may not be holding.
        dragRef.current = null;
        releasePointer(event.currentTarget, drag.pointerId);
    }, []);

    // Immediate, not animated. Reset is the escape hatch — the reader is lost
    // and wants the whole canon back — and an escape hatch that takes a third of
    // a second to open is one you press twice.
    const reset = useCallback(() => {
        stopAnimation();
        apply(INITIAL_VIEWPORT);
    }, [apply, stopAnimation]);

    /**
     * A client y -> the y it sits at in the fitted viewBox, with the letterbox
     * and the fit removed but the pan/zoom transform still on.
     *
     * That is the coordinate system anything drawn OUTSIDE the transformed
     * scene lives in, which is exactly one thing: the band a region drag pulls
     * out. Drawing it there rather than inside the scene is what keeps it under
     * the pointer with no counter-transform of its own — see ZoomBand.js.
     *
     * Null when the <svg> is not in the tree, which is the same "no answer"
     * every other reader of svgRef has to handle.
     */
    const toFittedY = useCallback((clientY) => {
        if (!svgRef.current) return null;

        return screenToWorld({ x: 0, y: clientY }, svgRef.current.getBoundingClientRect()).y;
    }, []);

    /**
     * A client y -> the world y under it, with both the viewBox fit and the
     * current pan and zoom removed.
     *
     * 6c's click-through needs it: the reader clicks somewhere along a note's
     * chain and the drawer opens at the reference nearest that point, so the
     * click has to be turned back into a place on the axis. The alternative is
     * getScreenCTM().inverse() on the arcs group, which would work in a browser
     * and returns nothing in jsdom — and this hook already holds both halves of
     * the answer, so it is arithmetic rather than a matrix.
     *
     * Null when the <svg> is not in the tree, which is the same "no answer"
     * every other reader of svgRef has to handle.
     */
    const toWorldY = useCallback((clientY) => {
        const fitted = toFittedY(clientY);
        if (fitted === null) return null;

        const { y, scale } = viewportRef.current;
        return (fitted - y) / scale;
    }, [toFittedY]);

    return {
        attachSvg,
        attachScene,
        areChapterMarksVisible,
        reset,
        toFittedY,
        toWorldY,
        zoomToRange,
        panHandlers: {
            onPointerDown: handlePointerDown,
            onPointerMove: handlePointerMove,
            onPointerUp: handlePointerUp,
            onPointerCancel: handlePointerUp,
        },
    };
};

export default usePanZoom;
