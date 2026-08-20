import React, { useEffect, useMemo, useRef, useState } from 'react';
import PanelFooter from './PanelFooter';
import VerseRow from './VerseRow';
import PanelHeader from './PanelHeader';
import SelectionActions from './SelectionActions';
import { fetchJson } from '../../config/api';
import { buildHighlightIndex } from './highlights';
import { isVerseSelected, referencesFromSelection } from './selectionRuns';
import { describePosition } from './navigation';

// One scripture panel: a chapter of text, its marks, and the footer that moves
// it.
//
// The panel is fully controlled — `position` comes from the URL and every move
// goes back out through `onChange` — so two of these on the page are
// independent by construction, with no shared state to keep in sync. The one
// thing they do share is `notesRevision`: every note write bumps it, and it is
// a fetch dependency here, so a note created in either panel repaints the marks
// in both.
//
// The verse selection is the page's, not the panel's: `selectedVerseIndexes`
// comes down and every click goes back up. That is what lets a click in one
// panel end the selection in the other, which it must, because the references a
// note is saved with all live in one chapter.
const ScripturePanel = ({
    label,
    isPrimary = false,
    collapse = null,
    books,
    position,
    onChange,
    notesRevision,
    hoveredNoteId,
    onHoverNote,
    onOpenNote,
    selectedVerseIndexes,
    onToggleVerse,
    onSelectionReferencesChange,
    onCreateNoteFromSelection,
    onClearSelection,
}) => {
    const [chapterData, setChapterData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const bodyRef = useRef(null);

    const { bookId, chapter } = position;

    useEffect(() => {
        const controller = new AbortController();
        setIsLoading(true);

        fetchJson(`/chapter/${bookId}/${chapter}`, { signal: controller.signal })
            .then(data => {
                setChapterData(data);
                setError('');
            })
            .catch(err => {
                if (err.name === 'AbortError') return;
                setChapterData(null);
                setError(err.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            });

        return () => controller.abort();
    }, [bookId, chapter, notesRevision]);

    // A new chapter starts at its first verse, not wherever the last one was
    // scrolled to. Guarded on the position rather than on chapterData so a
    // refetch of the marks does not throw the reader back to the top.
    useEffect(() => {
        if (bodyRef.current) {
            bodyRef.current.scrollTop = 0;
        }
    }, [bookId, chapter]);

    // Expanding each reference across its verses once beats filtering the list
    // per verse, and it only has to be redone when the chapter payload changes.
    const highlightIndex = useMemo(
        () => buildHighlightIndex(chapterData ? chapterData.references : []),
        [chapterData]
    );

    // A selection of clicked verses becomes one reference per contiguous run:
    // clicking verses 1 and 10 anchors two ranges, never one running 1–10.
    const selectionReferences = useMemo(
        () => referencesFromSelection(chapterData, selectedVerseIndexes),
        [chapterData, selectedVerseIndexes]
    );

    // Report them upward so the note editor can offer to anchor an open note to
    // what is selected. Only one panel holds the selection, so only one of them
    // ever reports anything.
    useEffect(() => {
        onSelectionReferencesChange(selectionReferences);
    }, [selectionReferences, onSelectionReferencesChange]);

    const heading = describePosition(books, position);
    const hasSelection = selectedVerseIndexes.length > 0;

    const panelClassName = [
        'analyze-panel',
        isPrimary ? 'analyze-panel--primary' : 'analyze-panel--side',
    ].join(' ');

    return (
        <section className={panelClassName} aria-label={label}>
            <PanelHeader label={label} title={heading} collapse={collapse} />

            {hasSelection && (
                <SelectionActions
                    count={selectedVerseIndexes.length}
                    onAddNote={() => onCreateNoteFromSelection(selectionReferences)}
                    onClear={onClearSelection}
                />
            )}

            <div className="analyze-panel-body" ref={bodyRef}>
                {error && (
                    <p className="analyze-message analyze-message--error" role="alert">
                        {error}
                    </p>
                )}

                {!error && isLoading && (
                    <p className="analyze-message">Loading…</p>
                )}

                {!error && !isLoading && chapterData && (
                    <div className="analyze-verses">
                        {chapterData.verses.map(verse => (
                            <VerseRow
                                key={verse.id}
                                verse={verse}
                                highlightIndex={highlightIndex}
                                hoveredNoteId={hoveredNoteId}
                                isSelected={isVerseSelected(selectedVerseIndexes, verse.verseIndex)}
                                onToggleVerse={onToggleVerse}
                                onHoverNote={onHoverNote}
                                onOpenNote={onOpenNote}
                            />
                        ))}
                    </div>
                )}
            </div>

            <PanelFooter books={books} position={position} onChange={onChange} />
        </section>
    );
};

export default ScripturePanel;
