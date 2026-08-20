import React from 'react';
import { describeReference } from './navigation';
import { excerptOf } from './markdown';

// How much of the body to show under the title in the list.
const EXCERPT_LENGTH = 80;

// One row of the notes panel.
//
// `data-note-id` is how a gutter marker finds this element to scroll it into
// view, so it is the counterpart of `data-verse-index` on a verse row: the two
// attributes are what link the scripture and notes panels without either one
// holding a ref into the other.
const NoteListItem = ({ note, books, isHighlighted, onHover, onOpen }) => {
    const excerpt = excerptOf(note.body, EXCERPT_LENGTH);

    return (
        <button
            type="button"
            className={`analyze-entry analyze-note${isHighlighted ? ' analyze-note--highlighted' : ''}`}
            data-note-id={note.id}
            onMouseEnter={() => onHover(note.id)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onOpen(note.id)}
        >
            <span className="analyze-entry-title">{note.title}</span>

            {note.references.length > 0 && (
                <span className="analyze-entry-references">
                    {note.references
                        .map(reference => describeReference(books, reference))
                        .join(' · ')}
                </span>
            )}

            {excerpt && <span className="analyze-entry-excerpt">{excerpt}</span>}
        </button>
    );
};

export default NoteListItem;
