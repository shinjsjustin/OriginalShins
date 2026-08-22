import React from 'react';
import { coversNote, referencesAt, tintClassName } from './highlights';

// One verse: its text, the rail of marks beside it, and whether the reader has
// it selected.
//
// `data-verse-index` is the contract with verse selection: it is read straight
// off this element to turn a click into a verse range, so it must stay on the
// row itself and not move onto a child.
//
// A toggle hands over the whole verse, not just its index. The selection keeps
// the printed number alongside the index, and this is the only moment it is in
// reach: once the panel navigates away the chapter carrying it is gone.
//
// The row handles the click, but the *verse number* is the button. Nesting the
// gutter markers inside a button row would be invalid markup and would swallow
// their own clicks, so the number carries the keyboard affordance and the
// pressed state while the row stays a plain, clickable container.
const VerseRow = ({
    verse,
    highlightIndex,
    hoveredNoteId,
    isSelected,
    onToggleVerse,
    onHoverNote,
    onOpenNote,
}) => {
    const references = referencesAt(highlightIndex, verse.verseIndex);

    const className = [
        'analyze-verse',
        tintClassName(references.length),
        // Lit because a note covering this verse is hovered in the notes panel.
        coversNote(references, hoveredNoteId) ? 'analyze-verse--linked' : '',
        isSelected ? 'analyze-verse--selected' : '',
    ].filter(Boolean).join(' ');

    // A click that ends a text drag is the reader copying a passage, not
    // choosing one. Leave the drag alone rather than toggling under it.
    const handleRowClick = () => {
        const domSelection = window.getSelection();
        if (domSelection && !domSelection.isCollapsed) {
            return;
        }
        onToggleVerse(verse);
    };

    return (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
        <div
            className={className}
            data-verse-index={verse.verseIndex}
            onClick={handleRowClick}
        >
            {/* A fixed-width rail whether or not it holds marks, so a tinted
                verse never reflows the text beside it. */}
            <span className="analyze-verse-rail">
                {references.map(reference => (
                    <button
                        key={reference.id}
                        type="button"
                        className={`analyze-gutter-marker${
                            reference.noteId === hoveredNoteId ? ' analyze-gutter-marker--active' : ''
                        }`}
                        data-note-id={reference.noteId}
                        onMouseEnter={() => onHoverNote(reference.noteId)}
                        onMouseLeave={() => onHoverNote(null)}
                        onClick={event => {
                            // The row toggles the verse; a marker opens a note.
                            event.stopPropagation();
                            onOpenNote(reference.noteId);
                        }}
                        aria-label={`Go to note: ${reference.noteTitle}`}
                        title={reference.noteTitle}
                    />
                ))}
            </span>

            <button
                type="button"
                className="analyze-verse-number"
                aria-pressed={isSelected}
                aria-label={`Verse ${verse.verse}`}
                onClick={event => {
                    event.stopPropagation();
                    onToggleVerse(verse);
                }}
            >
                {verse.verse}
            </button>

            <span className="analyze-verse-text">{verse.text}</span>
        </div>
    );
};

export default VerseRow;
