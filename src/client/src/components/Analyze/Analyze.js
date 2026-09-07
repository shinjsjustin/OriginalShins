import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Navbar from '../Navbar';
import ScripturePanel from './ScripturePanel';
import NotesPanel from './NotesPanel';
import PanelSpine from './PanelSpine';
import PendingSelectionTray from './PendingSelectionTray';
import useBooks from './useBooks';
import usePanelPositions from './usePanelPositions';
import useNotes from './useNotes';
import useActiveNote from './useActiveNote';
import useSelectedVerses from './useSelectedVerses';
import { useRestoreLocation, useRecordLocation } from './useSavedLocation';
import useIdeas from './useIdeas';
import useTopics from './useTopics';
import useChapterIdeas from './useChapterIdeas';
import { collectChapterIdeas } from './chapterIdeas';
import { describePosition } from './navigation';
import { NOTE_PARAM } from './panelParams';
import '../Styling/Analyze.css';

// The Analyze page: one passage in the centre with a second to compare it
// against on the left and everything written about it on the right.
//
// The centre panel is the primary one. It is the passage under study, and it is
// what the notes panel follows — move it and the notes move with it, which is
// the only cascade on the page. The compare panel is deliberately outside that:
// a second passage read *against* the first is no use if it is dragged along.
//
// Both side panels can be pushed aside, and the centre takes the room.
//
// The note the editor should open on arrives as ?note=<id>, e.g.
// /analyze?l=43.15&note=12. Unlike ?l= and ?r= it is a one-shot instruction
// rather than state: nothing writes it back, and closing the editor leaves it
// in the URL without reopening the note. The name lives in panelParams.js
// beside the panel params, because the pages that build these links — the topic
// tree and search — read it from there.

// Panel positions live in the URL (?l=1.1&r=40.1), so this component holds no
// navigation state. What it does own is everything that spans panels: the notes
// for the primary chapter, which note is hovered, which is open, and the verse
// selection. Those cross the boundary between the scripture and notes panels,
// so neither of them can hold the copy.
const Analyze = () => {
    // Declared first, and before anything that writes the query string. A bare
    // /analyze is sent back to wherever this reader was last — the two passages
    // and the open note — and until that is settled nothing else may touch the
    // URL or the page would race its own defaults into it. See
    // useSavedLocation.js.
    const { isRestoring } = useRestoreLocation();

    const { books, isLoading, error } = useBooks();
    const { primary, compare, setPrimary, setCompare } = usePanelPositions(books, isRestoring);
    const notes = useNotes(primary);

    // The ideas a note can be filed under, and the standalone ideas the notes
    // panel lists. Loaded once for the page rather than per note: the editor
    // opens on whichever note you click, and a picker that fetched its options
    // on open would show an empty list for a moment every time.
    const { ideas, createIdea } = useIdeas();

    // The topics the importer's field of bubbles is built from. Read-only here
    // — topics are made and filed on the Thoughts page.
    const { topics } = useTopics();

    // The shortlist for the chapter the primary panel is showing. It takes
    // `primary` and not a position of its own, so moving that panel refetches
    // it: the shortlist is per chapter, and one left behind by a move would be
    // the previous chapter's ideas under this chapter's heading.
    const {
        chapterIdeas: importedIdeas,
        importIdea,
        removeImport,
        actionError: chapterIdeaError,
    } = useChapterIdeas(primary);

    const [hoveredNoteId, setHoveredNoteId] = useState(null);
    const [activeNoteId, setActiveNoteId] = useState(null);

    // Which note "Add passage" armed the selection tray for, if any. The tray
    // is the page's, so this is too: a run of picking can cross both panels and
    // any number of chapters before it is committed, and nothing that happens
    // in between may end it.
    const [addingToNoteId, setAddingToNoteId] = useState(null);
    const [scrollRequest, setScrollRequest] = useState(null);
    const [isComposingIdea, setIsComposingIdea] = useState(false);

    // Which side panels are pushed aside. View state rather than URL state: it
    // is how one reader has arranged the room right now, not part of the
    // passage a shared link is about.
    const [collapsed, setCollapsed] = useState({ compare: false, notes: false });

    const toggleCollapsed = useCallback((panel) => {
        setCollapsed(previous => ({ ...previous, [panel]: !previous[panel] }));
    }, []);

    // ?note=<id> opens the editor on one note. It is how the Topic page's tree
    // hands a note over: that row links to this page positioned at the note's
    // first anchor, and without this param it would arrive at the right chapter
    // with the note still closed.
    //
    // The effect depends on the param and not on activeNoteId, so it fires once
    // per navigation. Closing the editor therefore stays closed rather than
    // being reopened by a param still sitting in the URL.
    const [searchParams] = useSearchParams();
    const requestedNoteId = searchParams.get(NOTE_PARAM);

    useEffect(() => {
        const noteId = Number(requestedNoteId);
        if (Number.isInteger(noteId) && noteId > 0) {
            setActiveNoteId(noteId);
        }
    }, [requestedNoteId]);

    // One basket of clicked verses for the whole page. It spans panels and
    // chapters, and it resolves itself: each verse went in with its printed
    // number, so no panel has to hand a loaded chapter over to make sense of it.
    const {
        toggleVerse,
        clearSelection,
        clearPlace,
        selectedVersesIn,
        selectionReferences,
        selectedPlaces,
    } = useSelectedVerses();

    const togglePrimaryVerse = useCallback(
        verse => toggleVerse(primary, verse),
        [toggleVerse, primary]
    );
    const toggleCompareVerse = useCallback(
        verse => toggleVerse(compare, verse),
        [toggleVerse, compare]
    );

    // What this chapter holds: what was imported into it, plus what the notes
    // anchored here are already filed under. The panel's "Ideas in this
    // chapter" section is the one place that reads it.
    const chapterIdeaList = collectChapterIdeas(importedIdeas, notes.notes, ideas);

    // The open note comes from the current lists whenever they hold it, so the
    // editor always shows the latest fetch. It survives navigating to a chapter
    // the note does not touch, which is what makes anchoring a note across a
    // chapter boundary possible at all — see useActiveNote.
    const { activeNote, retain } = useActiveNote(
        activeNoteId,
        notes.notes,
        notes.unreferenced
    );

    // Clicking a gutter marker both opens the note and scrolls to it. The token
    // makes a repeat click on the same marker a new request; the note id on its
    // own would not change and the scroll effect would not re-run.
    const handleOpenNote = useCallback((noteId) => {
        setActiveNoteId(noteId);
        setScrollRequest(previous => ({ noteId, token: (previous ? previous.token : 0) + 1 }));
    }, []);

    const handleCloseNote = useCallback(() => setActiveNoteId(null), []);

    // Anchors are added one at a time: POST /notes takes a single reference,
    // and a selection with a gap in it is genuinely several anchors on one note.
    // Sequential rather than parallel so the note that comes back last is the
    // one carrying every anchor.
    const anchorAll = useCallback(async (noteId, references) => {
        let latest = null;
        for (const reference of references) {
            const updated = await notes.addReference(noteId, reference);
            if (updated) {
                latest = updated;
            }
        }
        return latest;
    }, [notes]);

    // A note is created from what is selected, empty and untitled, and opened
    // straight away — an empty note's whole point is the editor. The response
    // is retained as well as selected, so the editor opens on this copy instead
    // of waiting for the list refetch to catch up.
    //
    // The references arrive already spanning every chapter the basket holds,
    // and each one carries its own bookId and chapter, so the loop needs to
    // know nothing about where the panels are pointed. The basket is cleared
    // only after the last anchor has landed: clearing on the first would drop
    // the chapters still waiting to be written.
    const handleCreateFromSelection = useCallback(async (references) => {
        if (references.length === 0) return;

        const created = await notes.createNote({ reference: references[0] });
        if (!created) return;

        const anchored = await anchorAll(created.id, references.slice(1));

        retain(anchored || created);
        setActiveNoteId(created.id);
        clearSelection();
    }, [notes, anchorAll, retain, clearSelection]);

    // Anchoring a note while reading a chapter it does not yet touch returns
    // the updated note before the list containing it reloads; retain it so the
    // new references appear in the editor immediately. The basket is cleared
    // after the loop for the same reason as above, and the arming goes with it
    // — a run that has landed is over.
    const handleAddToNote = useCallback(async (noteId, references) => {
        const anchored = await anchorAll(noteId, references);
        if (anchored) {
            retain(anchored);
        }
        clearSelection();
        setAddingToNoteId(null);
    }, [anchorAll, retain, clearSelection]);

    // Backing out leaves the basket standing: the verses were picked on
    // purpose, and they are still a perfectly good new note.
    const handleCancelAdd = useCallback(() => setAddingToNoteId(null), []);

    // The multi-select hands over the complete set, which goes straight to
    // PUT /notes/:id/ideas. Retained for the same reason a new reference is:
    // the response is the freshest copy of the note, and the list refetch that
    // follows has not landed yet.
    const handleSaveIdeas = useCallback(async (noteId, ideaIds) => {
        const note = await notes.setNoteIdeas(noteId, ideaIds);
        if (note) {
            retain(note);
        }
    }, [notes, retain]);

    // The topic tier's copy of handleSaveIdeas, retained for the same reason:
    // the response is the freshest copy of the note and the list refetch that
    // follows has not landed yet.
    const handleSaveTopics = useCallback(async (noteId, topicIds) => {
        const note = await notes.setNoteTopics(noteId, topicIds);
        if (note) {
            retain(note);
        }
    }, [notes, retain]);

    // A new idea starts in the chapter it was started in. "+ New idea" sits in
    // this panel, beside this passage, which says the idea belongs here as
    // plainly as importing one does — and without the second call the button's
    // whole result would disappear the moment it succeeded, into a corpus this
    // panel no longer lists. The idea is created either way: a failed import
    // costs the shortlist an entry, not the reader their idea.
    const handleCreateIdea = useCallback(async (body) => {
        const created = await createIdea(body);
        if (created) {
            await importIdea(created.id);
        }
        return created;
    }, [createIdea, importIdea]);

    const handleDeleteNote = useCallback(async (noteId) => {
        const removed = await notes.removeNote(noteId);
        if (removed) {
            setActiveNoteId(null);
        }
    }, [notes]);

    // Arming names one note, and it only means anything while that note is the
    // one open. Closing the editor or opening a different note therefore
    // disarms the tray without anything having to remember to — a target that
    // no longer matches is simply inert, which beats clearing the state from
    // each of the four places that set activeNoteId.
    const addTarget = addingToNoteId === activeNoteId ? addingToNoteId : null;

    // The panels are held back until the restore has settled as well as the
    // catalog: rendering them first would paint Genesis 1 for a moment, fetch a
    // chapter nobody asked for, and then jump.
    const isPreparing = isLoading || isRestoring;

    // The other half of the restore: where the page is now becomes where it
    // reopens. One request per move, so nothing depends on the page surviving
    // long enough to send it — and paused for the whole of `isPreparing`,
    // because until the canon is loaded every position still reads as its
    // default.
    useRecordLocation({
        primary,
        compare,
        noteId: activeNoteId,
        isPaused: isPreparing,
    });

    const compareLabel = 'Compare';
    const primaryLabel = 'Passage';

    return (
        <div className="analyze-page">
            <Navbar />

            {error && (
                <p className="analyze-message analyze-message--error" role="alert">
                    {error}
                </p>
            )}

            {!error && isPreparing && (
                <p className="analyze-message">Loading scripture…</p>
            )}

            {!error && !isPreparing && (
                <>
                    {/* Above the panel row, because a selection spanning two
                        chapters is not either panel's business. It also stays
                        put while a panel scrolls, which is what the old corner
                        widget was pinned for. It hangs out of the flow in the
                        navbar clearance (see Analyze.css), so appearing does
                        not push the panels down. */}
                    <PendingSelectionTray
                        books={books}
                        places={selectedPlaces}
                        references={selectionReferences}
                        addTarget={addTarget}
                        onAddNote={handleCreateFromSelection}
                        onAddToNote={handleAddToNote}
                        onCancelAdd={handleCancelAdd}
                        onClearPlace={clearPlace}
                        onClearAll={clearSelection}
                    />

                    <main className="analyze-panels">
                    {collapsed.compare ? (
                        <PanelSpine
                            side="left"
                            label={compareLabel}
                            caption={describePosition(books, compare)}
                            onExpand={() => toggleCollapsed('compare')}
                        />
                    ) : (
                        <ScripturePanel
                            label={compareLabel}
                            collapse={{ side: 'left', onCollapse: () => toggleCollapsed('compare') }}
                            books={books}
                            position={compare}
                            onChange={setCompare}
                            notesRevision={notes.revision}
                            hoveredNoteId={hoveredNoteId}
                            onHoverNote={setHoveredNoteId}
                            onOpenNote={handleOpenNote}
                            selectedVerseIndexes={selectedVersesIn(compare)}
                            onToggleVerse={toggleCompareVerse}
                        />
                    )}

                    {/* The centre panel. Everything else on the page answers to
                        it: the notes panel renders its chapter, and it is the
                        one panel that cannot be pushed aside. */}
                    <ScripturePanel
                        label={primaryLabel}
                        isPrimary
                        books={books}
                        position={primary}
                        onChange={setPrimary}
                        notesRevision={notes.revision}
                        hoveredNoteId={hoveredNoteId}
                        onHoverNote={setHoveredNoteId}
                        onOpenNote={handleOpenNote}
                        selectedVerseIndexes={selectedVersesIn(primary)}
                        onToggleVerse={togglePrimaryVerse}
                    />

                    {collapsed.notes ? (
                        <PanelSpine
                            side="right"
                            label="Notes"
                            caption={describePosition(books, primary)}
                            onExpand={() => toggleCollapsed('notes')}
                        />
                    ) : (
                        <NotesPanel
                            books={books}
                            position={primary}
                            onChange={setPrimary}
                            collapse={{ side: 'right', onCollapse: () => toggleCollapsed('notes') }}
                            notes={notes.notes}
                            unreferenced={notes.unreferenced}
                            topics={topics}
                            ideas={ideas}
                            chapterIdeas={chapterIdeaList}
                            importedIdeaIds={importedIdeas.map(idea => idea.id)}
                            isLoading={notes.isLoading}
                            error={notes.error}
                            actionError={notes.actionError || chapterIdeaError}
                            activeNote={activeNote}
                            hoveredNoteId={hoveredNoteId}
                            scrollRequest={scrollRequest}
                            isComposingIdea={isComposingIdea}
                            onHoverNote={setHoveredNoteId}
                            onOpenNote={setActiveNoteId}
                            onCloseNote={handleCloseNote}
                            onStartIdea={() => setIsComposingIdea(true)}
                            onCancelIdea={() => setIsComposingIdea(false)}
                            onCreateIdea={handleCreateIdea}
                            onImportIdea={importIdea}
                            onRemoveChapterIdea={removeImport}
                            onSaveNote={notes.updateNote}
                            onDeleteNote={handleDeleteNote}
                            onAddPassage={setAddingToNoteId}
                            onRemoveReference={notes.removeReference}
                            onSaveIdeas={handleSaveIdeas}
                            onSaveTopics={handleSaveTopics}
                        />
                    )}
                    </main>
                </>
            )}
        </div>
    );
};

export default Analyze;
