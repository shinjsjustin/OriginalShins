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
// ── Groups ────────────────────────────────────────────────────────────────
//
// The options arrive in groups because the editor's are not all alike: the
// ideas imported into the chapter being read are the ones a note written there
// is usually filed under, and they go first under a heading of their own. A
// group with no heading is a plain run of options, which is what a single
// ungrouped list is expressed as — so there is one code path here rather than
// a grouped one and a flat one that would drift apart.
//
// The selection stays whole across the groups: a heading is a place in the
// list, not a second list, and every change still reports every checked id.
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

/**
 * @param groups      [{ heading?, options: [{ id, label }] }]; a group without
 *                    a heading is drawn as a bare run of options
 * @param selectedIds the checked ids, across every group
 * @param onChange    handed the COMPLETE selection, never the one clicked
 */
const MultiSelect = ({
    legend,
    groups,
    selectedIds,
    onChange,
    emptyMessage,
    isDisabled = false,
}) => {
    const renderOptions = (options) => (
        <ul className="analyze-multiselect-list">
            {options.map(option => (
                <li key={option.id} className="analyze-multiselect-option">
                    <label className="analyze-multiselect-label">
                        <input
                            type="checkbox"
                            checked={selectedIds.includes(option.id)}
                            disabled={isDisabled}
                            onChange={() => onChange(toggleSelection(selectedIds, option.id))}
                        />
                        <span>{option.label}</span>
                    </label>
                </li>
            ))}
        </ul>
    );

    const isEmpty = groups.every(group => group.options.length === 0);

    return (
        <fieldset className="analyze-multiselect">
            <legend className="analyze-multiselect-legend">{legend}</legend>

            {isEmpty ? (
                <p className="analyze-multiselect-message">{emptyMessage}</p>
            ) : (
                groups
                    .filter(group => group.options.length > 0)
                    .map((group, index) => (
                        <div
                            key={group.heading || `group-${index}`}
                            className="analyze-multiselect-group"
                        >
                            {group.heading && (
                                <h5 className="analyze-multiselect-heading">{group.heading}</h5>
                            )}
                            {renderOptions(group.options)}
                        </div>
                    ))
            )}
        </fieldset>
    );
};

export default MultiSelect;
