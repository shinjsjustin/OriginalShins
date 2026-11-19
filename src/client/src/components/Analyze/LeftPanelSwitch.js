import React from 'react';

// Swaps the left slot between the compare passage and the scrolls.
const LeftPanelSwitch = ({ side, onShowCompare, onShowScrolls }) => (
    <div className="analyze-left-switch">
        <button type="button" aria-pressed={side === 'compare'} onClick={onShowCompare}>
            Compare
        </button>
        <button type="button" aria-pressed={side === 'scrolls'} onClick={onShowScrolls}>
            Scrolls
        </button>
    </div>
);

export default LeftPanelSwitch;
