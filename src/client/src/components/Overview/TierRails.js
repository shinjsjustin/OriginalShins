import React from 'react';
import { AXIS, RAILS, RAIL_LABEL_Y, pinnedX } from './overviewLayout';

// The rails the arcs hang on: notes, ideas, topics.
//
// The lines and the headings only — what lands ON a rail is drawn elsewhere.
// The stems and arcs are sibling groups (TierStems, TierArcs) rather than
// children of a rail: a rail line lives at one x and is held there under zoom
// by a translation, while a stem or an arc spans two x values and needs a
// horizontal counter-scale instead. Nesting one inside the other would compose
// the two transforms into neither. They share the tier's colour through
// `data-rail`, which is all the group here has to publish for them.
//
// Drawn from 6a rather than added with the first arc, because these lines are
// what fix the page's proportions: introducing them later would move the axis
// and invalidate every judgement made about spacing in the meantime. The rails
// a reader has switched off are not drawn at all — a labelled line with
// nothing on it says "you have written nothing here", which is a different
// statement from "you asked not to see this".
const TierRails = ({ tiers }) => (
    <g className="overview-rails">
        {RAILS.filter(rail => tiers.includes(rail.key)).map(rail => (
            <g
                key={rail.key}
                className="overview-rail-group overview-pinned"
                data-rail={rail.key}
                style={{ '--ov-x-offset': pinnedX(rail.x) }}
            >
                <line
                    className="overview-rail"
                    x1={rail.x}
                    y1={AXIS.top}
                    x2={rail.x}
                    y2={AXIS.bottom}
                />
                <text className="overview-rail-label" x={rail.x} y={RAIL_LABEL_Y}>
                    {rail.label}
                </text>
            </g>
        ))}
    </g>
);

export default React.memo(TierRails);
