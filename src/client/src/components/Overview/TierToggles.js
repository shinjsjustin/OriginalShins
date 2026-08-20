import React from 'react';
import { RAILS } from './overviewLayout';

// One checkbox per rail: which tiers the diagram draws.
//
// ── Why they are checkboxes and not a segmented control ────────────────────
//
// The three rails are not alternatives. The whole point of the picture is that
// the same passage appears on more than one of them at once — a verse anchored
// by a note, under an idea, under a topic, lines up across all three — so the
// reader has to be able to hold any combination, including all of them.
//
// ── Why they are not local state ───────────────────────────────────────────
//
// The choice lives in the URL, so it survives a reload, unwinds with the back
// button, and travels in a link. See useOverviewParams; this component is
// given the answer and reports the clicks.
//
// Each swatch takes the rail's own colour from `data-rail`, the same custom
// property the rail, its stems and its arcs read, so a checkbox and the thing
// it turns on are the same colour by construction rather than by two literals
// that agree today.
const TierToggles = ({ tiers, onToggle }) => (
    <fieldset className="overview-toggles">
        <legend className="overview-toggles-legend">Tiers</legend>
        {RAILS.map(rail => (
            <label key={rail.key} className="overview-toggle" data-rail={rail.key}>
                <input
                    type="checkbox"
                    checked={tiers.includes(rail.key)}
                    onChange={() => onToggle(rail.key)}
                />
                <span className="overview-toggle-swatch" aria-hidden="true" />
                {rail.label}
            </label>
        ))}
    </fieldset>
);

export default React.memo(TierToggles);
