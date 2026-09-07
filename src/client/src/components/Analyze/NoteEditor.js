import React, { useEffect, useState } from 'react';
import { describeReference } from './navigation';
import { renderMarkdown } from './markdown';
import MultiSelect from './MultiSelect';

// One note, opened from the notes panel.
//
// Two modes rather than a live-saving form: read mode renders the markdown, and
// the title and body only become inputs once Edit is pressed. Everything that
// is not the body — adding and removing references, deleting the note — works
// in either mode, because those are single actions with nothing to commit.
//
// The draft is local state seeded from the note. It is re-seeded whenever a
// different note is opened, and whenever this note comes back from the server
// changed, so a save elsewhere is never silently overwritten by a stale
// textarea.
const NoteEditor = ({
    note,
    books,
    ideaGroups,
    onSave,
    onDelete,
    onAddPassage,
    onRemoveReference,
    onSaveIdeas,
    onSaveTopics,
    onClose,
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState({ title: note.title, body: note.body });

    useEffect(() => {
        setDraft({ title: note.title, body: note.body });
        setIsEditing(false);
    }, [note.id, note.updatedAt, note.title, note.body]);

    const handleSave = async (event) => {
        event.preventDefault();
        const saved = await onSave(note.id, { title: draft.title, body: draft.body });
        if (saved) {
            setIsEditing(false);
        }
    };

    const handleCancel = () => {
        setDraft({ title: note.title, body: note.body });
        setIsEditing(false);
    };

    const renderedBody = renderMarkdown(note.body);

    return (
        <div className="analyze-editor">
            <div className="analyze-editor-toolbar">
                <button
                    type="button"
                    className="analyze-editor-button"
                    onClick={onClose}
                >
                    ← All notes
                </button>
                {!isEditing && (
                    <button
                        type="button"
                        className="analyze-editor-button"
                        onClick={() => setIsEditing(true)}
                    >
                        Edit
                    </button>
                )}
                <button
                    type="button"
                    className="analyze-editor-button analyze-editor-button--danger"
                    onClick={() => onDelete(note.id)}
                >
                    Delete note
                </button>
            </div>

            {isEditing ? (
                <form className="analyze-editor-form" onSubmit={handleSave}>
                    <label className="analyze-editor-label" htmlFor="note-title">Title</label>
                    <input
                        id="note-title"
                        className="analyze-editor-input"
                        type="text"
                        value={draft.title}
                        onChange={event => setDraft({ ...draft, title: event.target.value })}
                    />

                    <label className="analyze-editor-label" htmlFor="note-body">Body (markdown)</label>
                    <textarea
                        id="note-body"
                        className="analyze-editor-textarea"
                        value={draft.body}
                        onChange={event => setDraft({ ...draft, body: event.target.value })}
                        rows={12}
                    />

                    <div className="analyze-editor-actions">
                        <button type="submit" className="analyze-editor-button analyze-editor-button--primary">
                            Save
                        </button>
                        <button type="button" className="analyze-editor-button" onClick={handleCancel}>
                            Cancel
                        </button>
                    </div>
                </form>
            ) : (
                <>
                    <h3 className="analyze-editor-title">{note.title}</h3>
                    {renderedBody ? (
                        // Sanitized by DOMPurify inside renderMarkdown — see
                        // markdown.js. Nothing else on this page sets HTML.
                        <div
                            className="analyze-editor-rendered"
                            dangerouslySetInnerHTML={{ __html: renderedBody }}
                        />
                    ) : (
                        <p className="analyze-message">This note has no body yet.</p>
                    )}
                </>
            )}

            <section className="analyze-editor-references">
                <h4 className="analyze-picker-heading">References</h4>

                {note.references.length === 0 && (
                    <p className="analyze-message">
                        No references — this note is not highlighted in any passage.
                    </p>
                )}

                <ul className="analyze-reference-list">
                    {note.references.map(reference => (
                        <li key={reference.id} className="analyze-reference">
                            <span className="analyze-reference-label">
                                {describeReference(books, reference)}
                            </span>
                            <button
                                type="button"
                                className="analyze-reference-remove"
                                onClick={() => onRemoveReference(reference.id)}
                                aria-label={`Remove reference ${describeReference(books, reference)}`}
                            >
                                ×
                            </button>
                        </li>
                    ))}
                </ul>

                {/* Arms the page's selection for this note; it commits
                    nothing itself. The passages are whatever the reader clicks
                    next — in either scripture panel, in any chapter — and the
                    tray above the panels is what names them and writes them.
                    Anchoring across a chapter boundary is the point of picking
                    them there, so the run outlives any navigation it takes.

                    Never disabled: an empty selection is the ordinary way in,
                    not a reason to refuse. */}
                <button
                    type="button"
                    className="analyze-editor-button"
                    onClick={() => onAddPassage(note.id)}
                >
                    Add passage
                </button>
            </section>

            <section className="analyze-editor-ideas">
                {/* Ideas save on the click, not on a Save button: the checkbox
                    list already holds the complete membership, and PUT
                    /notes/:id/ideas replaces the complete membership, so there
                    is nothing left over to commit. Unchecking the last one is a
                    normal save — a note filed under no idea is legal. */}
                {/* Grouped rather than one flat list: the ideas this
                    chapter holds come first, because a note written here is
                    usually filed under one of them. Every other idea is still
                    below and still checkable — an idea is not confined to the
                    chapters it was imported into. */}
                <MultiSelect
                    legend="Ideas"
                    groups={ideaGroups}
                    selectedIds={note.ideas.map(idea => idea.id)}
                    onChange={ideaIds => onSaveIdeas(note.id, ideaIds)}
                    emptyMessage="No ideas yet — create one on the Ideas page to file this note under."
                />
            </section>
        </div>
    );
};

export default NoteEditor;
