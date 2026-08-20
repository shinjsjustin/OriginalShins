import React from 'react';

// What a hovered chain says: which tier it is on, the group's title, and the
// passages it joins.
//
// ── Why the tier is named ──────────────────────────────────────────────────
//
// The three rails draw the same shape in three colours, and with all three on
// they are three columns of curves. "Faith" as a topic and "Faith" as an idea
// are different rows in the database and different chains on screen, and a
// tooltip that named only the title would leave the reader working out which
// they were pointing at from the colour. So the rail is printed above it.
//
// The reference line is capped by tierLabels.js rather than here: a topic
// gathers every reference of every note under every one of its ideas, which
// can be hundreds, and a tooltip that covers the diagram it describes is worse
// than one that says "and 214 more".
//
// ── Why it is HTML and not SVG ─────────────────────────────────────────────
//
// Everything inside the <svg> lives in a 560 x 1000 world under a pan/zoom
// transform, so a <text> tooltip would be scaled, sheared by the horizontal
// counter-transforms, and clipped by the figure. A tooltip belongs to the
// screen rather than to the drawing, so it is a plain element positioned in
// client coordinates — which is also the only way to get a wrapping paragraph,
// since SVG text does not wrap.
//
// Positioned `fixed` at the pointer for the same reason: no ancestor's box has
// to be measured, so showing it costs a paint and not a layout read.
//
// ── Not a live region ──────────────────────────────────────────────────────
//
// aria-hidden, deliberately. It repeats what hovering already showed, to a
// pointer the reader is holding; announcing it would interrupt a screen reader
// on every crossing of a dense rail with text it can reach by other means. The
// page's accessible description of the drawing is on the <svg> itself, and the
// group's own content is in the drawer a click opens.
const ArcTooltip = ({ hover, label }) => {
    if (!hover || !label) return null;

    return (
        <div
            className="overview-tooltip"
            data-testid="overview-tooltip"
            data-rail={hover.rail}
            aria-hidden="true"
            style={{ left: `${hover.x}px`, top: `${hover.y}px` }}
        >
            <p className="overview-tooltip-rail">{hover.rail.replace(/s$/, '')}</p>
            <p className="overview-tooltip-title">{label.title}</p>
            {label.summary && (
                <p className="overview-tooltip-references">{label.summary}</p>
            )}
        </div>
    );
};

export default ArcTooltip;
