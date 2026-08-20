import React, { useState } from 'react';

const EMPTY_DRAFT = { title: '', body: '' };

// A blank title is left out of the request entirely rather than sent as '' —
// the API only falls back to "Untitled idea" for a field that is absent.
const bodyFor = ({ title, body }) => (
    title.trim() ? { title: title.trim(), body } : { body }
);

// Quick capture for a standalone idea, inline in the notes panel.
//
// A note is anchored to verses and is made by selecting them, so there is no
// button here that makes one. An idea has no anchor, which is exactly why it
// needs a place to start, and this is it: the same two fields the Ideas page
// uses and nothing more. Topics are filed there, where there is room to see
// them.
const IdeaComposer = ({ onCreate, onClose }) => {
    const [draft, setDraft] = useState(EMPTY_DRAFT);
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setIsSaving(true);

        const created = await onCreate(bodyFor(draft));

        setIsSaving(false);

        if (created) {
            setDraft(EMPTY_DRAFT);
            onClose();
        }
    };

    return (
        <form className="analyze-composer" onSubmit={handleSubmit}>
            <label className="analyze-editor-label" htmlFor="idea-title">Title</label>
            <input
                id="idea-title"
                className="analyze-editor-input"
                type="text"
                value={draft.title}
                placeholder="Untitled idea"
                onChange={event => setDraft(previous => ({ ...previous, title: event.target.value }))}
            />

            <label className="analyze-editor-label" htmlFor="idea-body">Body (markdown)</label>
            <textarea
                id="idea-body"
                className="analyze-editor-textarea"
                value={draft.body}
                onChange={event => setDraft(previous => ({ ...previous, body: event.target.value }))}
                rows={5}
            />

            <div className="analyze-editor-actions">
                <button
                    type="submit"
                    className="analyze-editor-button analyze-editor-button--primary"
                    disabled={isSaving}
                >
                    Save idea
                </button>
                <button type="button" className="analyze-editor-button" onClick={onClose}>
                    Cancel
                </button>
            </div>
        </form>
    );
};

export default IdeaComposer;
