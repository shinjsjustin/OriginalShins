import React from 'react';

const verseCount = (count) => `${count} ${count === 1 ? 'verse' : 'verses'}`;

// What a verse selection offers, pinned to the top-right corner of the panel
// the selection is in.
//
// It lives in the corner rather than beside the verses because a selection can
// run past the fold: the reader scrolling down to click a fifth verse must not
// have to scroll back up to act on the first four.
const SelectionActions = ({ count, onAddNote, onClear }) => (
    <div className="analyze-selection-actions">
        <span className="analyze-selection-count">{verseCount(count)}</span>
        <button
            type="button"
            className="analyze-selection-button analyze-selection-button--primary"
            onClick={onAddNote}
        >
            Add note
        </button>
        <button
            type="button"
            className="analyze-selection-button"
            onClick={onClear}
        >
            Clear selection
        </button>
    </div>
);

export default SelectionActions;
