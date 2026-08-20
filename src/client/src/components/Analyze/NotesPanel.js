import React, { useEffect, useRef } from 'react';
import PanelFooter from './PanelFooter';
import NoteListItem from './NoteListItem';
import IdeaListItem from './IdeaListItem';
import IdeaComposer from './IdeaComposer';
import NoteEditor from './NoteEditor';
import PanelHeader from './PanelHeader';
import { describePosition } from './navigation';

// The notes panel: what has been written around the passage in the centre.
//
// Two kinds of thing live here, and they are made in two different ways. A
// *note* is anchored to verses, so it is made by selecting them in a scripture
// panel — there is no button for one here, on purpose. An *idea* is standalone,
// so this is where one starts, and "+ New idea" is the panel's only create
// action.
//
// It holds no position of its own: `position` and `onChange` are the primary
// panel's, so the heading always tracks the passage under study and the footer
// moves that panel rather than a second, competing one. It holds no note state
// either — everything comes down from Analyze, which owns the one copy the
// scripture panels also read.
const NotesPanel = ({
    books,
    position,
    onChange,
    collapse = null,
    notes,
    unreferenced,
    ideas,
    isLoading,
    error,
    actionError,
    activeNote,
    hoveredNoteId,
    scrollRequest,
    isComposingIdea,
    pendingReferences,
    ideaOptions,
    onHoverNote,
    onOpenNote,
    onCloseNote,
    onStartIdea,
    onCancelIdea,
    onCreateIdea,
    onSaveNote,
    onDeleteNote,
    onAddReferences,
    onRemoveReference,
    onSaveIdeas,
}) => {
    const heading = describePosition(books, position);
    const bodyRef = useRef(null);

    // A gutter marker was clicked. scrollRequest carries a token as well as the
    // id so that clicking the same marker twice scrolls twice — the id alone
    // would not change and the effect would not re-run.
    useEffect(() => {
        if (!scrollRequest || !bodyRef.current) return;

        const target = bodyRef.current.querySelector(`[data-note-id="${scrollRequest.noteId}"]`);
        if (target && typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [scrollRequest]);

    const renderNotes = (items) => items.map(note => (
        <NoteListItem
            key={note.id}
            note={note}
            books={books}
            isHighlighted={note.id === hoveredNoteId}
            onHover={onHoverNote}
            onOpen={onOpenNote}
        />
    ));

    const hasNothing = notes.length === 0
        && unreferenced.length === 0
        && ideas.length === 0;

    return (
        <section className="analyze-panel analyze-panel--side analyze-panel--notes" aria-label="Notes">
            <PanelHeader label="Notes & ideas" title={heading} collapse={collapse} />

            <div className="analyze-panel-body" ref={bodyRef}>
                {error && (
                    <p className="analyze-message analyze-message--error" role="alert">
                        {error}
                    </p>
                )}

                {actionError && (
                    <p className="analyze-message analyze-message--error" role="alert">
                        {actionError}
                    </p>
                )}

                {!error && isLoading && <p className="analyze-message">Loading notes…</p>}

                {!error && !isLoading && activeNote && (
                    <NoteEditor
                        note={activeNote}
                        books={books}
                        pendingReferences={pendingReferences}
                        ideaOptions={ideaOptions}
                        onSave={onSaveNote}
                        onDelete={onDeleteNote}
                        onAddReferences={onAddReferences}
                        onRemoveReference={onRemoveReference}
                        onSaveIdeas={onSaveIdeas}
                        onClose={onCloseNote}
                    />
                )}

                {!error && !isLoading && !activeNote && (
                    <>
                        {isComposingIdea ? (
                            <IdeaComposer onCreate={onCreateIdea} onClose={onCancelIdea} />
                        ) : (
                            <button
                                type="button"
                                className="analyze-new-idea"
                                onClick={onStartIdea}
                            >
                                + New idea
                            </button>
                        )}

                        {hasNothing && (
                            <p className="analyze-message">
                                Nothing here yet. Click verses in a passage to anchor a
                                note to them, or start an idea that stands on its own.
                            </p>
                        )}

                        {notes.length > 0 && (
                            <section className="analyze-note-section">
                                <h3 className="analyze-picker-heading">On this chapter</h3>
                                {renderNotes(notes)}
                            </section>
                        )}

                        {ideas.length > 0 && (
                            <section className="analyze-note-section">
                                {/* Ideas are the same wherever the panels are
                                    pointed — they answer to no chapter, which is
                                    what makes them ideas. */}
                                <h3 className="analyze-picker-heading">Ideas</h3>
                                {ideas.map(idea => <IdeaListItem key={idea.id} idea={idea} />)}
                            </section>
                        )}

                        {unreferenced.length > 0 && (
                            <section className="analyze-note-section">
                                {/* Notes that lost their last anchor. Invisible in
                                    the scripture panels, so this is the only place
                                    they can be reached from. */}
                                <h3 className="analyze-picker-heading">Notes with no anchor</h3>
                                {renderNotes(unreferenced)}
                            </section>
                        )}
                    </>
                )}
            </div>

            <PanelFooter
                books={books}
                position={position}
                onChange={onChange}
                variant="label"
            />
        </section>
    );
};

export default NotesPanel;
