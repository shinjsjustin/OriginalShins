import React from 'react';
import { WORLD } from './overviewLayout';

// The band a shift-drag pulls out down the axis.
//
// ── Why it is outside the transformed scene ────────────────────────────────
//
// Everything else the page draws lives in the one <g> that carries the pan and
// zoom, and every one of those things pays for it: the ticks and the stems
// counter-scale out of the horizontal half, the labels and the rails counter-
// translate out of it, and the arcs need a vector-effect because neither
// correction fits a curve. The band needs none of that, because it is not part
// of the drawing — it is a report of where the pointer has been, and the
// pointer is in screen coordinates.
//
// So it hangs off the <svg> directly, in the fitted coordinates the viewBox
// establishes, and useZoomRegion writes its `y` and `height` from
// usePanZoom.toFittedY. It is under the reader's hand at 1x and at 400x with no
// arithmetic on either side and nothing to keep in step with the transform.
//
// ── Why it spans the full width ────────────────────────────────────────────
//
// The gesture selects a range of the CANON, not a rectangle of the picture:
// there is nothing to magnify horizontally (the axis is one line and the rails
// are pinned a fixed distance from it), so a box that narrowed sideways would
// be offering a choice the zoom cannot honour. A full-width band says exactly
// what will happen — this stretch of the axis, and everything on every rail
// beside it.
//
// Always in the tree, never re-rendered: it is `data-active` that makes it
// visible, and that is an attribute write like every other on this page. Its
// props never change, so the memo below is not an optimisation so much as a
// statement that a marquee at pointer speed does not reach React.
const ZoomBand = ({ attach }) => (
    <rect
        ref={attach}
        className="overview-zoom-band"
        data-testid="overview-zoom-band"
        x={0}
        y={0}
        width={WORLD.width}
        height={0}
    />
);

export default React.memo(ZoomBand);
