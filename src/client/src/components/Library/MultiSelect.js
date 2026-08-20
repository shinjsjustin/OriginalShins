import React from 'react';
// The widget carries its own styles: it is used on the Analyze page too, and
// that page imports Analyze.css only.
import '../Styling/Library.css';

// A checkbox list standing in for a multi-select.
//
// It is used in two places — a note's ideas and an idea's topics — and both
// save through a PUT that replaces the whole set. So this component reports the
// COMPLETE selection on every change rather than "which one was clicked": the
// widget's shape and the endpoint's shape are the same shape, which is the
// whole reason the API was drawn that way.
//
// A native <select multiple> was the other option. It hides the current
// selection behind a scroll box and needs a modifier key to add to it, neither
// of which suits a list you are reading as much as editing.

// Adding or removing one id from a selection, immutably. Exported because it is
// the only piece of logic here worth testing on its own.
export const toggleSelection = (selectedIds, id) => (
    selectedIds.includes(id)
        ? selectedIds.filter(selectedId => selectedId !== id)
        : [...selectedIds, id]
);

const MultiSelect = ({
    legend,
    options,
    selectedIds,
    onChange,
    emptyMessage,
    isDisabled = false,
}) => (
    <fieldset className="library-multiselect">
        <legend className="library-multiselect-legend">{legend}</legend>

        {options.length === 0 ? (
            <p className="library-message">{emptyMessage}</p>
        ) : (
            <ul className="library-multiselect-list">
                {options.map(option => {
                    const isSelected = selectedIds.includes(option.id);

                    return (
                        <li key={option.id} className="library-multiselect-option">
                            <label className="library-multiselect-label">
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    disabled={isDisabled}
                                    onChange={() => onChange(toggleSelection(selectedIds, option.id))}
                                />
                                <span>{option.label}</span>
                            </label>
                        </li>
                    );
                })}
            </ul>
        )}
    </fieldset>
);

export default MultiSelect;
