import React from 'react';

// A checkbox list standing in for a multi-select.
//
// It edits a note's ideas in the editor below, and saves through a PUT that
// replaces the whole set. So this component reports the COMPLETE selection on
// every change rather than "which one was clicked": the widget's shape and the
// endpoint's shape are the same shape, which is the whole reason the API was
// drawn that way.
//
// A native <select multiple> was the other option. It hides the current
// selection behind a scroll box and needs a modifier key to add to it, neither
// of which suits a list you are reading as much as editing.
//
// Its styles live in Analyze.css with the rest of the editor's, so nothing here
// imports a stylesheet of its own.

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
    <fieldset className="analyze-multiselect">
        <legend className="analyze-multiselect-legend">{legend}</legend>

        {options.length === 0 ? (
            <p className="analyze-multiselect-message">{emptyMessage}</p>
        ) : (
            <ul className="analyze-multiselect-list">
                {options.map(option => {
                    const isSelected = selectedIds.includes(option.id);

                    return (
                        <li key={option.id} className="analyze-multiselect-option">
                            <label className="analyze-multiselect-label">
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
