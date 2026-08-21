import React, { useEffect, useMemo, useState } from 'react';
import { fetchJson } from '../../config/api';
import ConfirmButton from './ConfirmButton';

// One row of the pinned panel, and — when its pencil is pressed — the form that
// row becomes.
//
// ── Why the form lives here and nowhere else ───────────────────────────────
//
// "Editing requires pinning" is the page's one structural rule, and it is true
// by construction rather than by enforcement: this is the only component in
// /thoughts that renders an input for a topic, an idea or a note, and it is
// only ever rendered from the pinned list. There is no check anywhere that
// says "refuse to edit an unpinned item" — there is nowhere to type.
//
// ── Why the form fetches its own item ──────────────────────────────────────
//
// A pin carries a pointer and a title (see src/lib/pins.js): the title is all
// the panel needs to LIST it. A form needs the rest — a topic's description, an
// idea's or a note's body — and the page cannot supply that for every pin.
// Topics and ideas it has in full, but notes are loaded one idea at a time, and
// a note pinned from an idea that is not open is not in any array the page
// holds. A form seeded from what happened to be loaded would silently save an
// empty body over a written one.
//
// So the form asks for the item it is about to edit, when it opens, one item at
// a time. It is also the freshest possible read of that item, which matters
// here more than elsewhere: this is a full-field save, and the row may have
// been sitting in the panel since the page loaded.
//
// ── The pencil is mounted, not merely invisible ────────────────────────────
//
// Same reasoning as the pin toggle on a card (see BubbleCard): a hidden button
// is still in the tab order and still read aloud, so twenty pinned rows would
// be twenty phantom Edit buttons. It appears on hover, on focus — that is how a
// keyboard reaches what a mouse reveals — and never otherwise.

export const KIND_LABELS = Object.freeze({ topic: 'TOPIC', idea: 'IDEA', note: 'NOTE' });

// What a row calls an item nobody titled. Rows are read as a list, so a blank
// line would look like a rendering fault rather than an untitled note.
export const UNTITLED_LABEL = 'Untitled';

export const PENCIL = '✏️';

// Shown when an item cannot be read back — a note deleted in another tab, say.
// The form stays open with the message in it rather than closing, so the
// pressed pencil does not look like it did nothing.
export const LOAD_FAILURE_PREFIX = 'Could not open this for editing.';

// Where each kind's full row comes from, and the two fields of it this panel
// edits. One table, so the label, the input, the draft key and the PATCH body
// are all the same list of names and cannot drift apart.
//
// `block` is the field that gets a textarea: the second field of every kind is
// prose, and the first is the line it is filed under.
export const EDIT_FORMS = Object.freeze({
    topic: Object.freeze({
        detailPath: (id) => `/topics/${id}`,
        detailKey: 'topic',
        fields: Object.freeze([
            Object.freeze({ name: 'name', label: 'Name', type: 'line' }),
            Object.freeze({ name: 'description', label: 'Description', type: 'block' }),
        ]),
    }),
    idea: Object.freeze({
        detailPath: (id) => `/ideas/${id}`,
        detailKey: 'idea',
        fields: Object.freeze([
            Object.freeze({ name: 'title', label: 'Title', type: 'line' }),
            Object.freeze({ name: 'body', label: 'Body (markdown)', type: 'block' }),
        ]),
    }),
    note: Object.freeze({
        detailPath: (id) => `/notes/${id}`,
        detailKey: 'note',
        fields: Object.freeze([
            Object.freeze({ name: 'title', label: 'Title', type: 'line' }),
            Object.freeze({ name: 'body', label: 'Body (markdown)', type: 'block' }),
        ]),
    }),
});

export const labelFor = (pin) => pin.title || UNTITLED_LABEL;

// A field the server has never been given reads as null, and a null in a
// textarea is React's uncontrolled-input warning followed by the string
// "null" being saved back.
const draftFrom = (form, detail) => Object.fromEntries(
    form.fields.map(field => [field.name, detail[field.name] || ''])
);

// Only what the reader actually changed. The PATCH routes take a partial body
// and refuse an empty one, so an untouched field must not be sent — and a Save
// pressed on an untouched form must not be a request at all.
const changesIn = (draft, detail, form) => Object.fromEntries(
    form.fields
        .map(field => [field.name, draft[field.name]])
        .filter(([name, value]) => value !== (detail[name] || ''))
);

/** The item behind a pin, read once the form holding this hook is mounted. */
const useItemDetail = (pin) => {
    const [detail, setDetail] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const { itemType, itemId } = pin;

    useEffect(() => {
        const form = EDIT_FORMS[itemType];
        const controller = new AbortController();
        setIsLoading(true);

        fetchJson(form.detailPath(itemId), { signal: controller.signal })
            .then(payload => {
                setDetail(payload[form.detailKey] || {});
                setError('');
            })
            .catch(err => {
                if (err.name === 'AbortError') return;
                setDetail(null);
                setError(`${LOAD_FAILURE_PREFIX} ${err.message}`);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            });

        return () => controller.abort();
    }, [itemType, itemId]);

    return { detail, isLoading, error };
};

/**
 * The row, as a form.
 *
 * Save closes it only when the write landed — the page's action banner says
 * what went wrong, and closing over a failed save would throw away what was
 * typed.
 */
const PinnedItemForm = ({ pin, onSave, onDelete, onCancel }) => {
    const form = EDIT_FORMS[pin.itemType];
    const { detail, isLoading, error } = useItemDetail(pin);
    const [draft, setDraft] = useState(null);

    useEffect(() => {
        setDraft(detail === null ? null : draftFrom(form, detail));
    }, [detail, form]);

    // Ids have to be unique across a panel that can hold twenty rows, and the
    // label of a row's Name field must point at that row's input.
    const fieldId = (name) => `pinned-${pin.itemType}-${pin.itemId}-${name}`;

    const handleSubmit = async (event) => {
        event.preventDefault();

        const changes = changesIn(draft, detail, form);
        // Nothing was touched. Closing is the honest answer to "save this": the
        // saved state and the typed state already agree.
        if (Object.keys(changes).length === 0) {
            onCancel();
            return;
        }

        const saved = await onSave(pin, changes);
        if (saved) {
            onCancel();
        }
    };

    if (isLoading || (draft === null && !error)) {
        return <p className="thoughts-message">Loading…</p>;
    }

    if (error) {
        return (
            <>
                <p className="thoughts-message thoughts-message--error" role="alert">{error}</p>
                <div className="thoughts-form-actions">
                    <button type="button" className="thoughts-panel-button" onClick={onCancel}>
                        Cancel
                    </button>
                </div>
            </>
        );
    }

    return (
        <form className="thoughts-pin-form" onSubmit={handleSubmit}>
            {form.fields.map(field => (
                <React.Fragment key={field.name}>
                    <label className="thoughts-form-label" htmlFor={fieldId(field.name)}>
                        {field.label}
                    </label>
                    {field.type === 'block' ? (
                        <textarea
                            id={fieldId(field.name)}
                            className="thoughts-form-textarea"
                            rows={6}
                            value={draft[field.name]}
                            onChange={event => setDraft({ ...draft, [field.name]: event.target.value })}
                        />
                    ) : (
                        <input
                            id={fieldId(field.name)}
                            className="thoughts-form-input"
                            type="text"
                            value={draft[field.name]}
                            onChange={event => setDraft({ ...draft, [field.name]: event.target.value })}
                        />
                    )}
                </React.Fragment>
            ))}

            <div className="thoughts-form-actions">
                <button
                    type="submit"
                    className="thoughts-panel-button thoughts-panel-button--primary"
                >
                    Save
                </button>
                <button type="button" className="thoughts-panel-button" onClick={onCancel}>
                    Cancel
                </button>
                {/* Delete is asked about twice, and the question names the kind:
                    deleting an idea is not the same size of act as deleting a
                    note, and the reader is being asked in a panel that lists
                    all three. */}
                <ConfirmButton
                    label="Delete"
                    question={`Delete this ${pin.itemType}?`}
                    confirmLabel={`Delete ${pin.itemType}`}
                    cancelLabel="Keep"
                    className="thoughts-panel-button--danger"
                    onConfirm={() => onDelete(pin)}
                />
            </div>
        </form>
    );
};

/**
 * One pinned item.
 *
 * @param pin          { itemType, itemId, title } from usePins
 * @param isSelected   in the panel's current selection
 * @param isEditing    this row is the one open as a form — the panel allows one
 * @param onToggleSelect / onStartEdit / onCancelEdit  the panel's own state
 * @param onSave       (pin, changes) -> the saved item, or null when it failed
 * @param onDelete     (pin) -> the item and its pin, gone
 */
const PinnedItem = ({
    pin,
    isSelected = false,
    isEditing = false,
    onToggleSelect,
    onStartEdit,
    onCancelEdit,
    onSave,
    onDelete,
}) => {
    const [isPointerOver, setIsPointerOver] = useState(false);
    const [hasFocus, setHasFocus] = useState(false);

    const label = useMemo(() => labelFor(pin), [pin]);
    const showPencil = !isEditing && (isPointerOver || hasFocus);

    const className = [
        'thoughts-pin-row',
        `thoughts-pin-row--${pin.itemType}`,
        isSelected ? 'is-selected' : '',
        isEditing ? 'is-editing' : '',
    ].filter(Boolean).join(' ');

    // A click that ends a text drag is the reader copying a title, not choosing
    // a row — the same judgement VerseRow makes about a verse.
    const handleRowClick = () => {
        if (isEditing) return;

        const domSelection = window.getSelection();
        if (domSelection && !domSelection.isCollapsed) return;

        onToggleSelect(pin);
    };

    return (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
        <div
            className={className}
            data-pin-key={`${pin.itemType}:${pin.itemId}`}
            onClick={handleRowClick}
            onMouseEnter={() => setIsPointerOver(true)}
            onMouseLeave={() => setIsPointerOver(false)}
            onFocus={() => setHasFocus(true)}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setHasFocus(false);
            }}
        >
            {isEditing ? (
                <PinnedItemForm
                    pin={pin}
                    onSave={onSave}
                    onDelete={onDelete}
                    onCancel={onCancelEdit}
                />
            ) : (
                <>
                    {/* The checkbox and the row say the same thing, so the
                        checkbox must not let its click reach the row as well —
                        the two toggles would cancel each other out and the box
                        would appear stuck. */}
                    <input
                        type="checkbox"
                        className="thoughts-pin-check"
                        checked={isSelected}
                        aria-label={`Select ${label}`}
                        onClick={event => event.stopPropagation()}
                        onChange={() => onToggleSelect(pin)}
                    />

                    <span className={`thoughts-pin-kind thoughts-pin-kind--${pin.itemType}`}>
                        {KIND_LABELS[pin.itemType]}
                    </span>

                    <span className="thoughts-pin-title">{label}</span>

                    {showPencil && (
                        <button
                            type="button"
                            className="thoughts-pin-edit"
                            aria-label={`Edit ${label}`}
                            title={`Edit ${label}`}
                            onClick={event => {
                                event.stopPropagation();
                                onStartEdit(pin);
                            }}
                        >
                            <span aria-hidden="true">{PENCIL}</span>
                        </button>
                    )}
                </>
            )}
        </div>
    );
};

export default PinnedItem;
