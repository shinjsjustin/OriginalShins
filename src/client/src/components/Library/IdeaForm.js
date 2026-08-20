import React, { useEffect, useState } from 'react';

const emptyDraft = { title: '', body: '' };

const draftFrom = (idea) => (idea ? { title: idea.title, body: idea.body } : emptyDraft);

// Create or edit one idea: a title and a markdown body, the same shape as a
// note. Topics are not part of this form — they are a link set, saved by their
// own full-set PUT the moment a checkbox changes, so mixing them into a form
// with a Save button would imply a transaction that does not exist.
const IdeaForm = ({ idea = null, submitLabel, onSubmit, onCancel = null }) => {
    const [draft, setDraft] = useState(draftFrom(idea));
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setDraft(draftFrom(idea));
    }, [idea]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setIsSaving(true);

        const saved = await onSubmit({ title: draft.title, body: draft.body });

        setIsSaving(false);

        if (saved && !idea) {
            setDraft(emptyDraft);
        }
    };

    const fieldId = (field) => `idea-${idea ? idea.id : 'new'}-${field}`;

    return (
        <form className="library-form" onSubmit={handleSubmit}>
            <label className="library-label" htmlFor={fieldId('title')}>Title</label>
            <input
                id={fieldId('title')}
                className="library-input"
                type="text"
                value={draft.title}
                onChange={event => setDraft(previous => ({ ...previous, title: event.target.value }))}
            />

            <label className="library-label" htmlFor={fieldId('body')}>Body (markdown)</label>
            <textarea
                id={fieldId('body')}
                className="library-textarea"
                value={draft.body}
                onChange={event => setDraft(previous => ({ ...previous, body: event.target.value }))}
                rows={6}
            />

            <div className="library-actions">
                <button
                    type="submit"
                    className="library-button library-button--primary"
                    disabled={isSaving}
                >
                    {submitLabel}
                </button>
                {onCancel && (
                    <button type="button" className="library-button" onClick={onCancel}>
                        Cancel
                    </button>
                )}
            </div>
        </form>
    );
};

export default IdeaForm;
