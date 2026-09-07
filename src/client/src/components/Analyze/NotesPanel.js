import React, { useCallback, useEffect, useRef, useState } from 'react';
import PanelFooter from './PanelFooter';
import NoteListItem from './NoteListItem';
import IdeaListItem from './IdeaListItem';
import IdeaComposer from './IdeaComposer';
import NoteEditor from './NoteEditor';
import PanelHeader from './PanelHeader';
import ImportPicker from '../Bubbles/ImportPicker';
import { describePosition } from './navigation';

// The notes panel: what has been written around the passage in the centre.
//
// Two kinds of thing live here, and they are made in three different ways. A
// *note* is anchored to verses, so it is made by selecting them in a scripture
// panel — there is no button for one here, on purpose. An *idea* is standalone:
// "+ New idea" starts one from nothing, and "Import idea" pulls an idea that
// already exists into this chapter's shortlist. Both are the list view's, not
// the editor's — an open note is a note being written, and neither button is
// about the note.
//
// It holds no position of its own: `position` and `onChange` are the primary
// panel's, so the heading always tracks the passage under study and the footer
// moves that panel rather than a second, competing one. It holds no note state
// either — everything comes down from Analyze, which owns the one copy the
// scripture panels also read.
//
// The one thing it does own is whether the importer overlay is open. That is
// not data and it does not leave this panel: nothing else on the page changes
// while it is up, and it closes when the picker's Import is confirmed or the
// reader backs out.
const NotesPanel = ({
    books,
    position,
    onChange,
    collapse = null,
    notes,
    unreferenced,
    topics,
    ideas,
    chapterIdeas,
    importedIdeaIds,
    isLoading,
    error,
    actionError,
    activeNote,
    hoveredNoteId,
    scrollRequest,
    isComposingIdea,
    ideaGroups,
    onHoverNote,
    onOpenNote,
    onCloseNote,
    onStartIdea,
    onCancelIdea,
    onCreateIdea,
    onImportIdea,
    onRemoveChapterIdea,
    onSaveNote,
    onDeleteNote,
    onAddPassage,
    onRemoveReference,
    onSaveIdeas,
    onSaveTopics,
}) => {
    const heading = describePosition(books, position);
    const bodyRef = useRef(null);
    const [isImporting, setIsImporting] = useState(false);

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

    // Closed before the write rather than after it: the picker's Import button
    // IS the decision, and an overlay that lingered through a round trip would
    // leave the reader looking at a field of bubbles wondering whether it
    // landed. The shortlist behind it fills in when the request returns.
    const handleImport = useCallback((pick) => {
        setIsImporting(false);
        onImportIdea(pick.id);
    }, [onImportIdea]);

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

    // Only an imported row can be un-imported, which is why the imported ids
    // come down beside the list rather than being read off it: `chapterIdeas`
    // is the union, and a row in it may be here only because a note anchored in
    // this chapter is filed under that idea. Such a row has no import behind
    // it — the way to take one out is to unfile the note, not to press an ×
    // that would write nothing. See collectChapterIdeas.
    const imported = new Set(importedIdeaIds);

    const hasNothing = notes.length === 0
        && unreferenced.length === 0
        && chapterIdeas.length === 0;

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
                        topics={topics}
                        ideas={ideas}
                        onSave={onSaveNote}
                        onDelete={onDeleteNote}
                        onAddPassage={onAddPassage}
                        onRemoveReference={onRemoveReference}
                        onSaveIdeas={onSaveIdeas}
                        onSaveTopics={onSaveTopics}
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

                        <button
                            type="button"
                            className="analyze-import-idea"
                            onClick={() => setIsImporting(true)}
                        >
                            Import idea
                        </button>

                        {hasNothing && (
                            <p className="analyze-message">
                                Nothing here yet. Click verses in a passage to anchor a
                                note to them, start an idea that stands on its own, or
                                import one you have already written.
                            </p>
                        )}

                        {notes.length > 0 && (
                            <section className="analyze-note-section">
                                <h3 className="analyze-picker-heading">On this chapter</h3>
                                {renderNotes(notes)}
                            </section>
                        )}

                        {chapterIdeas.length > 0 && (
                            <section className="analyze-note-section">
                                {/* A shortlist, not the corpus. Every idea the
                                    reader has used to be listed here whatever
                                    the panels were pointed at, which stopped
                                    being useful the moment ideas could be
                                    curated per chapter — the full list is one
                                    press of "Import idea" away. */}
                                <h3 className="analyze-picker-heading">Ideas in this chapter</h3>
                                {chapterIdeas.map(idea => (
                                    <IdeaListItem
                                        key={idea.id}
                                        idea={idea}
                                        onRemove={imported.has(idea.id) ? onRemoveChapterIdea : null}
                                    />
                                ))}
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

            {/* Outside the panel body on purpose: the overlay is fixed to the
                viewport and lays its bubbles across the whole of it, so it is
                no more the body's child than a dialog is.

                Ideas only. PUT /api/chapter-ideas takes ideaIds, and a chapter
                has no topic membership for a picked topic to go into — so a
                topic card here stays what it is on Thoughts, a way to open a
                fan. */}
            {isImporting && (
                <ImportPicker
                    label={`Import an idea into ${heading}`}
                    topics={topics}
                    ideas={ideas}
                    selectableKinds={['idea']}
                    onImport={handleImport}
                    onClose={() => setIsImporting(false)}
                />
            )}
        </section>
    );
};

export default NotesPanel;
