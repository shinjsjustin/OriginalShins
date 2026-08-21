import React, { useEffect, useState } from 'react';
import { slugify } from '../Thoughts/slug';

const emptyDraft = { name: '', slug: '', description: '' };

const draftFrom = (topic) => (topic
    ? { name: topic.name, slug: topic.slug, description: topic.description }
    : emptyDraft);

// Create or edit one topic. The same form serves both — the only difference is
// what it is seeded with and what its submit button says.
//
// The slug follows the name as you type until you edit it yourself, after which
// it is left alone: a slug can end up in a URL, so silently rewriting one you
// chose would be the wrong kind of helpful. The server derives it again from
// what it receives either way, so this is a convenience, never the authority.
const TopicForm = ({ topic = null, submitLabel, onSubmit, onCancel = null }) => {
    const [draft, setDraft] = useState(draftFrom(topic));
    const [isSlugEdited, setIsSlugEdited] = useState(Boolean(topic));
    const [isSaving, setIsSaving] = useState(false);

    // Re-seed when a different topic is opened, or when this one comes back
    // from the server changed, so a save elsewhere is never overwritten by a
    // stale field.
    useEffect(() => {
        setDraft(draftFrom(topic));
        setIsSlugEdited(Boolean(topic));
    }, [topic]);

    const handleNameChange = (name) => setDraft(previous => ({
        ...previous,
        name,
        slug: isSlugEdited ? previous.slug : slugify(name),
    }));

    const handleSubmit = async (event) => {
        event.preventDefault();
        setIsSaving(true);

        const saved = await onSubmit({
            name: draft.name,
            // An untouched slug field on a name of nothing but punctuation
            // resolves to empty; send the name and let the server say so.
            slug: draft.slug,
            description: draft.description,
        });

        setIsSaving(false);

        // Creating clears the form for the next one; editing leaves the fields
        // as saved, because the row stays open.
        if (saved && !topic) {
            setDraft(emptyDraft);
            setIsSlugEdited(false);
        }
    };

    const fieldId = (field) => `topic-${topic ? topic.id : 'new'}-${field}`;

    return (
        <form className="library-form" onSubmit={handleSubmit}>
            <label className="library-label" htmlFor={fieldId('name')}>Name</label>
            <input
                id={fieldId('name')}
                className="library-input"
                type="text"
                value={draft.name}
                onChange={event => handleNameChange(event.target.value)}
                required
            />

            <label className="library-label" htmlFor={fieldId('slug')}>Slug</label>
            <input
                id={fieldId('slug')}
                className="library-input"
                type="text"
                value={draft.slug}
                onChange={event => {
                    setIsSlugEdited(true);
                    setDraft(previous => ({ ...previous, slug: event.target.value }));
                }}
            />

            <label className="library-label" htmlFor={fieldId('description')}>Description</label>
            <textarea
                id={fieldId('description')}
                className="library-textarea"
                value={draft.description}
                onChange={event => setDraft(previous => ({ ...previous, description: event.target.value }))}
                rows={3}
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

export default TopicForm;
