import React from 'react';
import { describeChapterVerses, describeReference } from './navigation';

// What the reader has selected right now, across the whole canon.
//
// This belongs to the page and not to a scripture panel. A selection running
// from Genesis into Romans is not the business of whichever panel happens to be
// showing one of them: a panel could only ever name its own half, and two
// panels naming two halves would read as two selections rather than the one
// basket they actually are.
//
// One row per place — a book and a chapter — because that is how the basket is
// keyed. A place holding several runs is listed under one book name, so a gap
// in a chapter reads as "Romans 5:1–2, 5:8" rather than as two Romans rows.
//
// The tray has two states, and they differ only in where the basket is going.
// Unarmed, the basket becomes a new note. Armed — `addTarget` naming the note
// the editor has open — it becomes that note's next anchors instead. Nothing
// about picking verses changes between them: arming aims the tray, it does not
// narrow what may be clicked.

// The rows come from `places` and the labels from `references`; both are the
// same basket, so a place always has at least one run behind it. The guard is
// for the moment during a state change when a caller might hand over one
// without the other, and prints nothing rather than throwing.
const labelFor = (books, references) => {
    if (references.length === 0) {
        return '';
    }
    const [first, ...rest] = references;
    return [describeReference(books, first), ...rest.map(describeChapterVerses)].join(', ');
};

const referencesAt = (references, { bookId, chapter }) =>
    references.filter(reference => reference.bookId === bookId && reference.chapter === chapter);

const keyOf = ({ bookId, chapter }) => `${bookId}:${chapter}`;

const PendingSelectionTray = ({
    books,
    places,
    references,
    addTarget = null,
    onAddNote,
    onAddToNote,
    onCancelAdd,
    onClearPlace,
    onClearAll,
}) => {
    const isAdding = addTarget !== null;
    const isEmpty = places.length === 0;

    // Nothing selected anywhere is nothing to show — not an empty tray sitting
    // above the panels holding a strip of the page open. Being armed is the
    // exception: the reader has to be told the next click lands on a note, and
    // given something to press to back out, before there is anything to list.
    if (isEmpty && !isAdding) {
        return null;
    }

    return (
        <section className="analyze-selection-tray" aria-label="Selection">
            {isEmpty ? (
                <p className="analyze-selection-tray-prompt">
                    Click passages to add to this note
                </p>
            ) : (
                <>
                    <span className="analyze-selection-tray-label">Selected:</span>

                    <ul className="analyze-selection-places">
                        {places.map(place => {
                            const label = labelFor(books, referencesAt(references, place));

                            return (
                                <li key={keyOf(place)} className="analyze-selection-place">
                                    <span className="analyze-selection-place-label">{label}</span>
                                    <button
                                        type="button"
                                        className="analyze-selection-place-remove"
                                        onClick={() => onClearPlace(place)}
                                        aria-label={`Remove ${label} from selection`}
                                    >
                                        ✕
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}

            <div className="analyze-selection-tray-actions">
                {isAdding ? (
                    <>
                        <button
                            type="button"
                            className="analyze-selection-button analyze-selection-button--primary"
                            disabled={isEmpty}
                            onClick={() => onAddToNote(addTarget, references)}
                        >
                            Add to note
                        </button>
                        {/* Leaves the basket alone. Backing out of adding to a
                            note is not the same as deciding against the verses
                            — they may well be wanted for a new note instead,
                            and Clear all is right there for when they are not. */}
                        <button
                            type="button"
                            className="analyze-selection-button"
                            onClick={onCancelAdd}
                        >
                            Cancel
                        </button>
                    </>
                ) : (
                    <button
                        type="button"
                        className="analyze-selection-button analyze-selection-button--primary"
                        onClick={() => onAddNote(references)}
                    >
                        Add note
                    </button>
                )}

                {/* Nothing to clear on an armed empty tray, and a button that
                    would write nothing has no business being offered. */}
                {!isEmpty && (
                    <button
                        type="button"
                        className="analyze-selection-button"
                        onClick={onClearAll}
                    >
                        Clear all
                    </button>
                )}
            </div>
        </section>
    );
};

export default PendingSelectionTray;
