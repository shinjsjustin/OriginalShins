import React from 'react';

// One chained path per group, hung on one rail.
//
// One component for all three tiers, parameterised by `rail` — the notes rail
// chains a note's own references, the ideas rail chains the references of every
// note linked to an idea, the topics rail those of every note under a topic's
// ideas. Three groupings of one set of references, so one renderer: the
// geometry differs only in the x the chain hangs on, which arcModel.js was
// given as an argument for exactly this reason.
//
// ── Why this is a sibling of the rails, not a child ────────────────────────
//
// The same reason TierStems is: an arc spans two x values — the rail it starts
// on and the bulge out from it — and TierRails' `.overview-pinned` group holds
// ONE x still, letting everything else drift from it by the zoom factor. A
// point `d` away from the pin ends up `d * scale` away, so at 10x an arc's apex
// would be eight hundred units off the side of the world. Arcs get the same
// horizontal counter-scale the ticks and stems get instead, which maps every x
// to x/s so the scene's own scale puts it back. That is a sibling transform,
// not a nested one, so this group hangs off the scene directly and takes its
// tier colour from `data-rail` rather than by inheritance.
//
// ── The two paths per group ────────────────────────────────────────────────
//
// A chain is drawn about a pixel wide, which is a target nobody can hit. So
// each group gets a second path with the same `d`, no visible stroke and a wide
// one for hit-testing, and `pointer-events: stroke` in the CSS confines both to
// the line itself rather than to the region the curve encloses — an arc must
// not swallow the clicks of everything drawn inside its sweep. That matters
// more on the upper rails, where a topic's chain routinely spans the canon.
//
// That is 3 elements per group (a group and two paths) rather than 3 per ARC.
// The chain being one continuous path is what buys that; see arcModel.js.
//
// ── Hover and click do not come through here ───────────────────────────────
//
// No element below carries a handler. The listeners are on the <svg>, and they
// find the group by walking up from the event target to this group's
// `data-group-id` and on to the enclosing `data-rail` — see
// useArcInteraction.js. At a few thousand groups the difference between one
// listener and three thousand closures is the whole interaction budget, and
// the plan asks for delegation by name.
//
// The highlight is applied the same way: `data-active` is written straight onto
// this group's DOM node, and CSS does the dimming. So this component is
// memoised on props that change once, at load, and nothing a pointer does ever
// re-renders it.
//
// ── Where virtualisation would go ──────────────────────────────────────────
//
// The plan reserves it for "when you actually have thousands", which is not
// yet. When it is: the filter belongs here and nowhere else — take the current
// viewport (usePanZoom already holds it) and render only the arcs whose y span
// intersects it, keyed by groupId so React reuses the paths that survive. Two
// things make that safe to defer. buildArcs is pure and returns each group's
// points, so the filter is a predicate over data this component already has;
// and the highlight walks the live DOM by attribute, so an arc scrolled out of
// the tree simply is not found rather than being found and stale. What it will
// cost is a re-render per pan, which is exactly the thing this page is arranged
// to avoid — which is why it waits for a page that is measurably too slow
// without it.
const TierArcs = ({ rail, arcs }) => (
    <g className="overview-arcs" data-rail={rail} data-testid={`overview-arcs-${rail}`}>
        {arcs.map(arc => (
            <g key={arc.groupId} className="overview-arc-group" data-group-id={arc.groupId}>
                <path className="overview-arc-hit" d={arc.d} />
                <path className="overview-arc" d={arc.d} />
            </g>
        ))}
    </g>
);

export default React.memo(TierArcs);
