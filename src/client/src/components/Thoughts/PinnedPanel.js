import React, { useCallback, useState } from 'react';
import PinnedItem from './PinnedItem';
import ConfirmButton from './ConfirmButton';
import { evaluateLink } from './linkRules';

// The right-docked pinned panel: the list of what the reader has pinned, the
// two things they can do to a selection of it, and the page's only editing
// surface.
//
// ── The collapse is the Analyze pattern, in this page's clothes ────────────
//
// Analyze's CollapseTab and PanelSpine settled how a side panel gets out of the
// way: a small tab in the panel's OUTER top corner whose arrow points the way
// the panel travels, and, once it is gone, a spine — the whole of it the
// control, turned on its end like a book back on a shelf, with the arrow
// pointing back toward the centre in the same corner it was pressed in. That
// behaviour is copied here exactly, including which way each arrow points.
//
// What is not copied is the class names, and so not the components. Those carry
// `analyze-` classes whose rules live in Analyze.css, scoped to `.analyze-page`
// and sized in that page's local custom properties (`--analyze-spine-width`
// among them). Rendered here they would resolve to nothing at all — a spine
// with no width — so this page states the same shape in its own tokens rather
// than importing another page's stylesheet to borrow six lines from it.
//
// ── One selection, one authority on what may be done with it ───────────────
//
// Unpin needs nothing but the selection. Link needs to know whether the
// selection spans two adjacent tiers, and if so which items pair with which —
// and that question is answered in exactly one place, linkRules.evaluateLink.
// The button's `disabled`, the hint under it and the pairs the click sends are
// three reads of ONE call, made here on every render. Nothing in this file
// counts tiers or knows that a note goes under an idea.

export const PANEL_LABEL = 'Pinned';

export const EMPTY_MESSAGE = 'Nothing pinned yet. Pin a topic, idea or note on the canvas to edit it here.';

export const CLEAR_QUESTION = 'Unpin everything?';

// Expanded, the arrow points away from the centre — the direction the panel
// travels when it closes. Collapsed, it points back: press it and the panel
// comes back. Right-docked, so these are Analyze's `right` arrows.
export const COLLAPSE_ARROW = '▶';
export const EXPAND_ARROW = '◀';

const keyOf = (pin) => `${pin.itemType}:${pin.itemId}`;

const countLabel = (count) => `${count} selected`;

// usePins' writes answer `false`, and linkPairs answers `null`, when nothing
// landed. Either way the selection stays put so the reader can try again with
// the same items still in hand.
const succeeded = (result) => result !== false && result !== null;

/**
 * @param pins       usePins' hydrated list, in pin order
 * @param isLoading  the pin list itself is still in flight
 * @param onUnpin    (items) -> usePins.unpinMany
 * @param onClear    () -> usePins.clearPins
 * @param onLink     (pairs) -> useThoughtsData.linkPairs
 * @param onSave     (pin, changes) -> the edit form's save
 * @param onDelete   (pin) -> the edit form's delete
 */
const PinnedPanel = ({
    pins,
    isLoading = false,
    onUnpin,
    onClear,
    onLink,
    onSave,
    onDelete,
}) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [selectedKeys, setSelectedKeys] = useState([]);
    const [editingKey, setEditingKey] = useState(null);

    // Derived from `pins` rather than held as its own list of items, which is
    // what keeps a selection honest across an unpin, a delete or a reload: a
    // key naming a row that is no longer here simply selects nothing.
    const selectedItems = pins.filter(pin => selectedKeys.includes(keyOf(pin)));

    const toggleSelect = useCallback((pin) => {
        const key = keyOf(pin);
        setSelectedKeys(previous => (previous.includes(key)
            ? previous.filter(existing => existing !== key)
            : [...previous, key]));
    }, []);

    const clearSelection = useCallback(() => setSelectedKeys([]), []);

    // One call, three uses: the button's state, the hint, and the writes.
    const { canLink, reason, pairs } = evaluateLink(selectedItems);

    const handleUnpin = async () => {
        if (succeeded(await onUnpin(selectedItems))) {
            clearSelection();
        }
    };

    const handleLink = async () => {
        if (succeeded(await onLink(pairs))) {
            clearSelection();
        }
    };

    // Clearing the pins clears what was selected among them by definition, and
    // leaves no row open as a form.
    const handleClear = () => {
        clearSelection();
        setEditingKey(null);
        onClear();
    };

    if (isCollapsed) {
        return (
            <button
                type="button"
                className="thoughts-spine"
                onClick={() => setIsCollapsed(false)}
                aria-label={`Show ${PANEL_LABEL}`}
                title={`Show ${PANEL_LABEL}`}
            >
                <span className="thoughts-spine-arrow" aria-hidden="true">{EXPAND_ARROW}</span>
                <span className="thoughts-spine-text">
                    <span className="thoughts-spine-label">{PANEL_LABEL}</span>
                    <span className="thoughts-spine-caption">{pins.length}</span>
                </span>
            </button>
        );
    }

    return (
        <aside className="thoughts-panel" aria-label={PANEL_LABEL}>
            <header className="thoughts-panel-header">
                <h2 className="thoughts-panel-title">{PANEL_LABEL} ({pins.length})</h2>

                <ConfirmButton
                    label="Clear"
                    question={CLEAR_QUESTION}
                    confirmLabel="Unpin all"
                    disabled={pins.length === 0}
                    onConfirm={handleClear}
                />

                {/* The tab sits in the row rather than over it, so it can never
                    land on the heading however long the count runs. */}
                <button
                    type="button"
                    className="thoughts-collapse-tab"
                    onClick={() => setIsCollapsed(true)}
                    aria-label={`Hide ${PANEL_LABEL}`}
                    title={`Hide ${PANEL_LABEL}`}
                >
                    <span aria-hidden="true">{COLLAPSE_ARROW}</span>
                </button>
            </header>

            {/* Above the list, not beside the selected rows: a selection can run
                past the fold, and the reader who scrolled down to check a fifth
                row must not have to scroll back up to act on it. */}
            {selectedItems.length > 0 && (
                <div className="thoughts-selection-actions">
                    <span className="thoughts-selection-count">
                        {countLabel(selectedItems.length)}
                    </span>

                    <button
                        type="button"
                        className="thoughts-panel-button"
                        onClick={handleUnpin}
                    >
                        Unpin
                    </button>

                    <button
                        type="button"
                        className="thoughts-panel-button thoughts-panel-button--primary"
                        disabled={!canLink}
                        onClick={handleLink}
                    >
                        Link
                    </button>

                    <button
                        type="button"
                        className="thoughts-panel-button"
                        onClick={clearSelection}
                    >
                        Clear selection
                    </button>

                    {/* linkRules' own words. A disabled control provokes exactly
                        one question, and this is the answer to it. */}
                    {!canLink && <p className="thoughts-selection-hint">{reason}</p>}
                </div>
            )}

            <div className="thoughts-panel-body">
                {isLoading && <p className="thoughts-message">Loading pins…</p>}

                {!isLoading && pins.length === 0 && (
                    <p className="thoughts-message">{EMPTY_MESSAGE}</p>
                )}

                {pins.map(pin => (
                    <PinnedItem
                        key={keyOf(pin)}
                        pin={pin}
                        isSelected={selectedKeys.includes(keyOf(pin))}
                        isEditing={editingKey === keyOf(pin)}
                        onToggleSelect={toggleSelect}
                        onStartEdit={() => setEditingKey(keyOf(pin))}
                        onCancelEdit={() => setEditingKey(null)}
                        onSave={onSave}
                        onDelete={async (deleted) => {
                            if (succeeded(await onDelete(deleted))) {
                                setEditingKey(null);
                            }
                        }}
                    />
                ))}
            </div>
        </aside>
    );
};

export default PinnedPanel;
