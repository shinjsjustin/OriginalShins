import React from 'react';
import { AXIS, RAIL_X } from './overviewLayout';

// One horizontal line per anchor point, from the axis across to one rail.
//
// One component for all three tiers, parameterised by `rail`. The notes,
// ideas and topics rails carry the same thing — the same references, grouped
// by note, by idea and by topic — so a stem differs between them only in which
// x it stops at and which colour it takes. Three copies of this file is how
// the three rails would come to disagree about where a verse is.
//
// ── Why this is not inside the rail's group ────────────────────────────────
//
// TierRails wraps each rail in a `.overview-pinned` group, which counteracts
// the zoom by translating the group so a feature at the rail's own x lands
// back on the rail. That is exactly right for something living at ONE x — the
// rail line, its heading — and exactly wrong for a stem, which spans two. A
// point sitting `d` away from the pin ends up `d * scale` away from it, so at
// 10x a stem that starts on the axis would start a thousand units off the left
// edge of the world.
//
// A stem needs both of its ends held, so it gets the full horizontal
// counter-scale instead — the same `scaleX(--ov-inverse-scale)` the ticks use,
// which maps every x to x/s so the scene's own scale puts it back. That is a
// sibling transform, not a nested one, so this group hangs off the scene
// directly and carries its tier colour by `data-rail` rather than by being
// inside the rail it lands on.
//
// ── Why it is one <line> and not a <path> of many ──────────────────────────
//
// The interaction hangs off individual stems: hovering a group lights every
// stem belonging to it, which is a query for `data-group-id` and not an offset
// into a path. At the plan's scale — low thousands of notes — a few thousand
// <line> elements is what SVG is for, and virtualisation is explicitly
// deferred until the count actually demands it.
//
// ── The two attributes ─────────────────────────────────────────────────────
//
// `data-group-id` alone is not an identity: note 7, idea 7 and topic 7 are
// three different things and all three may be on the page at once. The rail is
// what disambiguates, and it is already on the group above — so the highlight
// selects `[data-rail="ideas"] [data-group-id="7"]` rather than duplicating
// the tier onto every line. See useArcInteraction.js.
//
// Memoised, and given no handlers: nothing here changes between the mount that
// loads the payload and the next one, and pan and zoom never re-render at all.
const TierStems = ({ rail, stems }) => (
    <g
        className="overview-stems"
        data-rail={rail}
        data-testid={`overview-stems-${rail}`}
    >
        {stems.map(stem => (
            <line
                key={stem.key}
                className="overview-stem"
                data-group-id={stem.groupId}
                data-verse-index={stem.verseIndex}
                x1={AXIS.x}
                y1={stem.y}
                x2={RAIL_X[rail]}
                y2={stem.y}
            />
        ))}
    </g>
);

export default React.memo(TierStems);
