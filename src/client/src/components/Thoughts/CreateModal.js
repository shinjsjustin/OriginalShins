import React, { useEffect, useState } from 'react';
import { slugify } from './slug';

// The two things a reader can make on this page, as one modal.
//
// ── Why a modal at all, and why it closes on success ───────────────────────
//
// Creating is rare next to reading the canvas, and the canvas is the page: a
// form standing permanently in the chrome would cost every reader space for
// something most of them are not doing. So it is asked for, it takes the
// screen while it is open, and it goes away when it has done its work.
//
// It can afford to go away because the item it just made is pinned (see
// Thoughts.js). The panel is this page's only editing surface, so a create
// that left nothing pinned would hand the reader a topic they had just named
// and could no longer touch. Closing is therefore not the end of the edit —
// it is the handover to the row that can do the rest.
//
// ── The fields are the old Library forms' fields ───────────────────────────
//
// components/Library is going away, but what its two forms asked for was
// right: a topic is a name, a slug and a description; an idea is a title and a
// markdown body. They are declared as a table here for the same reason
// PinnedItem declares its edit forms as one — the label, the input, the draft
// key and the POST body are then the same list of names and cannot drift.
//
// ── Why the shell is here rather than Analyze's Modal ──────────────────────
//
// Analyze/Modal.js is the same three dismissals (Escape, backdrop, a close
// button) and this keeps its behaviour to the letter. What it cannot borrow is
// the markup: those class names are styled in Analyze.css off custom
// properties declared on `.analyze-page`, which is not an ancestor of anything
// here, so the imported dialog would arrive with no width to be. The page's
// own frame is in Thoughts.css and this dialog belongs to it.

/**
 * What each kind asks for.
 *
 * `type` picks the control — a `block` field gets a textarea, the way the
 * pinned panel's forms read the same distinction. `follows` marks a field that
 * trails another as it is typed: the slug follows the name (see below), and it
 * is the only such field on the page.
 */
export const CREATE_FORMS = Object.freeze({
    topic: Object.freeze({
        title: 'New topic',
        submitLabel: 'Create topic',
        fields: Object.freeze([
            Object.freeze({ name: 'name', label: 'Name', type: 'line', isRequired: true }),
            Object.freeze({ name: 'slug', label: 'Slug', type: 'line', follows: 'name' }),
            Object.freeze({ name: 'description', label: 'Description', type: 'block', rows: 3 }),
        ]),
    }),
    idea: Object.freeze({
        title: 'New idea',
        submitLabel: 'Create idea',
        fields: Object.freeze([
            Object.freeze({ name: 'title', label: 'Title', type: 'line' }),
            Object.freeze({ name: 'body', label: 'Body (markdown)', type: 'block', rows: 6 }),
        ]),
    }),
});

const emptyDraft = (form) => Object.fromEntries(form.fields.map(field => [field.name, '']));

const followerOf = (form, name) => form.fields.find(field => field.follows === name) || null;

/**
 * The create form, in a dialog.
 *
 * @param kind      'topic' or 'idea'
 * @param onCreate  (fields) -> the created item, or null when the write failed
 * @param onClose   dismissed, by any of the three ways or by a create landing
 */
const CreateModal = ({ kind, onCreate, onClose }) => {
    const form = CREATE_FORMS[kind];

    const [draft, setDraft] = useState(() => emptyDraft(form));
    // Fields the reader has typed into themselves, which are therefore no
    // longer allowed to follow anything.
    const [claimedNames, setClaimedNames] = useState([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // A slug can end up in a URL, so it is offered rather than imposed: it is
    // derived from the name as you type, and the moment you edit it yourself it
    // is yours and this stops rewriting it. The server derives one again from
    // the name it receives either way — this is a convenience for the form,
    // never the authority.
    const handleChange = (field, value) => {
        const follower = followerOf(form, field.name);
        const shouldFollow = follower !== null && !claimedNames.includes(follower.name);

        setDraft(previous => ({
            ...previous,
            [field.name]: value,
            ...(shouldFollow ? { [follower.name]: slugify(value) } : {}),
        }));

        if (field.follows && !claimedNames.includes(field.name)) {
            setClaimedNames(previous => [...previous, field.name]);
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setIsSaving(true);

        const created = await onCreate(draft);

        setIsSaving(false);

        // Only on success. A failed write is explained by the page's action
        // banner, and closing over it would throw away what was typed at the
        // moment the reader most needs it back.
        if (created) {
            onClose();
        }
    };

    const fieldId = (name) => `create-${kind}-${name}`;

    return (
        <div className="thoughts-modal-backdrop" onClick={onClose} role="presentation">
            <div
                className="thoughts-modal"
                role="dialog"
                aria-modal="true"
                aria-label={form.title}
                // The backdrop closes on click; without this every click inside
                // the dialog would bubble up and close it too.
                onClick={event => event.stopPropagation()}
            >
                <header className="thoughts-modal-header">
                    <h2 className="thoughts-modal-title">{form.title}</h2>
                    <button
                        type="button"
                        className="thoughts-modal-close"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ×
                    </button>
                </header>

                <form className="thoughts-modal-body" onSubmit={handleSubmit}>
                    {form.fields.map(field => (
                        <React.Fragment key={field.name}>
                            <label className="thoughts-form-label" htmlFor={fieldId(field.name)}>
                                {field.label}
                            </label>
                            {field.type === 'block' ? (
                                <textarea
                                    id={fieldId(field.name)}
                                    className="thoughts-form-textarea"
                                    rows={field.rows}
                                    value={draft[field.name]}
                                    onChange={event => handleChange(field, event.target.value)}
                                />
                            ) : (
                                <input
                                    id={fieldId(field.name)}
                                    className="thoughts-form-input"
                                    type="text"
                                    value={draft[field.name]}
                                    required={Boolean(field.isRequired)}
                                    onChange={event => handleChange(field, event.target.value)}
                                />
                            )}
                        </React.Fragment>
                    ))}

                    <div className="thoughts-form-actions">
                        <button
                            type="submit"
                            className="thoughts-panel-button thoughts-panel-button--primary"
                            disabled={isSaving}
                        >
                            {form.submitLabel}
                        </button>
                        <button
                            type="button"
                            className="thoughts-panel-button"
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateModal;
