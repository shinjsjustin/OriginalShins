import React from 'react';

// Collapsed, the arrow points back toward the centre: press it and the panel
// comes back.
const ARROW = { left: '▶', right: '◀' };

// What a side panel becomes once it is pushed aside: a spine, turned on its
// end like a book back on the shelf, naming the panel and the passage it will
// return to. The whole spine is the control, so there is no small target to
// find — and the arrow tab stays in the same corner it was pressed in.
const PanelSpine = ({ side, label, caption, onExpand }) => (
    <button
        type="button"
        className={`analyze-spine analyze-spine--${side}`}
        onClick={onExpand}
        aria-label={`Show ${label}`}
        title={`Show ${label}`}
    >
        <span className="analyze-spine-arrow" aria-hidden="true">{ARROW[side]}</span>
        <span className="analyze-spine-text">
            <span className="analyze-spine-label">{label}</span>
            {caption && <span className="analyze-spine-caption">{caption}</span>}
        </span>
    </button>
);

export default PanelSpine;
