import React from 'react';

// Expanded, the arrow points away from the centre — the direction the panel
// travels when it closes.
const ARROW = { left: '◀', right: '▶' };

// The tab in a side panel's outer top corner that pushes it out of the way.
//
// `side` is which edge of the page the panel sits against, which is all this
// needs to know: it decides both the corner the tab occupies and the way the
// arrow points.
const CollapseTab = ({ side, label, onCollapse }) => (
    <button
        type="button"
        className={`analyze-collapse-tab analyze-collapse-tab--${side}`}
        onClick={onCollapse}
        aria-label={`Hide ${label}`}
        title={`Hide ${label}`}
    >
        <span aria-hidden="true">{ARROW[side]}</span>
    </button>
);

export default CollapseTab;
