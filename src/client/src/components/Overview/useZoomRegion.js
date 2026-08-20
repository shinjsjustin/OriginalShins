import { useCallback, useRef } from 'react';
import { capturePointer, releasePointer } from './pointerCapture';

// Shift-drag a band down the axis; let go and fly to it.
//
// ── The plan's second option, and why it is the one built ──────────────────
//
// "Magnify — a fisheye on the axis, or simpler, a zoom-to-region on drag."
// A fisheye is a second, non-linear mapping from verse_index to y running
// alongside the linear one, and every tick, stem and arc on the page is placed
// through the mapping — so it is either applied as one transform (which a
// non-linear mapping cannot be) or re-derived per frame for a few thousand
// elements. That is the exact cost the whole page is arranged to avoid, for a
// gesture the plan itself calls "the feature most likely to be cut".
//
// A region drag needs no new mapping at all. It produces a scale and a
// translation — the same pair a wheel notch produces — so everything already
// written to hold strokes, labels and stems still under zoom holds them still
// under this, and the magnified view is the ordinary view, correct by the same
// construction rather than by a second one that has to agree with the first.
//
// ── Why shift, and not a mode ──────────────────────────────────────────────
//
// Plain drag already means pan, and it has to keep meaning that: it is how the
// reader moves around at every zoom and the one gesture that needs no learning.
// A toolbar toggle would free the plain drag but adds a mode — a state in which
// the page's primary gesture does something else, which the reader has to
// remember being in, and which the page then has to say out loud somewhere.
// A modifier is stateless: it lasts exactly as long as the key is held, cannot
// be left switched on, and is the convention every map and every timeline
// already uses. The hint line beside the toggles is what makes it discoverable,
// since a modifier is otherwise invisible.
//
// ── Two coordinate systems, on purpose ─────────────────────────────────────
//
// The band is DRAWN in fitted coordinates — outside the transformed scene, so
// it needs no counter-transform and sits exactly under the pointer at any zoom
// (see ZoomBand.js). The range it RESOLVES to is in world coordinates, the ones
// the diagram is drawn in, because that is what has to be flown to and it must
// not move when the transform does. So both ends of the drag are recorded
// twice, once through each conversion, at the moment they happen. Converting
// one to the other afterwards would mean reading a transform that the flight
// itself is in the middle of changing.
//
// ── What it writes, and what it does not ───────────────────────────────────
//
// Nothing here is React state. A marquee updates on every pointer move, which
// is the same budget a hover has, and the band is a single <rect> whose y and
// height are two attribute writes. `data-selecting` on the <svg> is what stops
// the arcs answering the pointer mid-drag, so pulling a band across a dense
// rail does not trail a tooltip behind it.

/**
 * Whether a press is asking for a region rather than a pan. Exported rather
 * than applied here because the page routes the press: usePanZoom and
 * useArcInteraction both want the same pointerdown, and exactly one of the
 * three should have it. Keeping the test here and the routing there is what
 * lets neither pan nor hover know this gesture exists.
 */
export const isRegionGesture = (event) => event.shiftKey === true;

// The band a drag has to reach, in fitted units — a hundredth of the box's
// height, so a few pixels on any screen. Below it the gesture is discarded
// rather than obeyed: a shift-click is a slip of the hand, and obeying it would
// fly to MAX_SCALE somewhere the reader did not choose, which is the one
// outcome of this feature that is genuinely hard to recover from.
export const MIN_REGION_SPAN = 10;

const useZoomRegion = ({ toFittedY, toWorldY, onZoomToRange }) => {
    const svgRef = useRef(null);
    const bandRef = useRef(null);
    const dragRef = useRef(null);

    const attachSvg = useCallback((node) => {
        svgRef.current = node;
    }, []);

    const attachBand = useCallback((node) => {
        bandRef.current = node;
    }, []);

    /** Puts the band between two fitted y values. */
    const drawBand = useCallback((from, to) => {
        const band = bandRef.current;
        if (!band) return;

        band.setAttribute('y', String(Math.min(from, to)));
        band.setAttribute('height', String(Math.abs(to - from)));
    }, []);

    /** Takes the band and the drag state away; safe to call twice. */
    const endBand = useCallback(() => {
        dragRef.current = null;

        if (bandRef.current) bandRef.current.removeAttribute('data-active');
        if (svgRef.current) svgRef.current.removeAttribute('data-selecting');
    }, []);

    const start = useCallback((event) => {
        const fitted = toFittedY(event.clientY);
        const world = toWorldY(event.clientY);
        // No box to measure means no gesture. Nothing has been captured or
        // written yet, so there is nothing to undo.
        if (fitted === null || world === null) return;

        dragRef.current = {
            pointerId: event.pointerId,
            fromFitted: fitted,
            toFitted: fitted,
            fromWorld: world,
            toWorld: world,
        };

        capturePointer(event.currentTarget, event.pointerId);

        if (bandRef.current) bandRef.current.setAttribute('data-active', '');
        if (svgRef.current) svgRef.current.setAttribute('data-selecting', '');
        drawBand(fitted, fitted);
    }, [toFittedY, toWorldY, drawBand]);

    const move = useCallback((event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;

        const fitted = toFittedY(event.clientY);
        const world = toWorldY(event.clientY);
        if (fitted === null || world === null) return;

        dragRef.current = { ...drag, toFitted: fitted, toWorld: world };
        drawBand(drag.fromFitted, fitted);
    }, [toFittedY, toWorldY, drawBand]);

    const end = useCallback((event) => {
        const drag = dragRef.current;
        endBand();
        if (!drag) return;

        releasePointer(event.currentTarget, drag.pointerId);

        // Measured on the band the reader saw rather than on the range it
        // resolves to: at 40x zoom a world span of 10 is most of the screen,
        // and "did they drag far enough to mean it?" is a question about the
        // hand, not about the canon.
        if (Math.abs(drag.toFitted - drag.fromFitted) < MIN_REGION_SPAN) return;

        onZoomToRange(drag.fromWorld, drag.toWorld);
    }, [endBand, onZoomToRange]);

    // A cancelled pointer — the browser took it, the window lost focus, a
    // touch became a scroll — is not a released one. The band goes away and
    // nothing is flown to: the reader never let go, so they never said where.
    const cancel = useCallback((event) => {
        const drag = dragRef.current;
        endBand();
        if (drag) releasePointer(event.currentTarget, drag.pointerId);
    }, [endBand]);

    return {
        attachSvg,
        attachBand,
        regionHandlers: { start, move, end, cancel },
    };
};

export default useZoomRegion;
