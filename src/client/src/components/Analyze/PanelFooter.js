import React, { useState } from 'react';
import BookPicker from './BookPicker';
import ChapterPicker from './ChapterPicker';
import { findBook, stepChapter } from './navigation';

const BACK = -1;
const FORWARD = 1;

// The four-button footer every panel carries: ← | Book | Chapter | →
//
// It holds no position of its own. `position` comes from the URL and every
// control reports through `onChange`, which is what lets the notes panel drive
// the left scripture panel instead of duplicating its state.
//
// `variant="label"` is the notes panel's rendering: the arrows are hidden and
// the book/chapter read as a plain label rather than buttons, while still
// opening the pickers — the plan calls for one control per piece of state, not
// for the notes panel to lose the ability to move the passage.
const PanelFooter = ({ books, position, onChange, variant = 'nav' }) => {
    const [openPicker, setOpenPicker] = useState(null);

    const book = findBook(books, position.bookId);
    const showArrows = variant === 'nav';
    const isReady = books.length > 0;

    const previous = stepChapter(books, position, BACK);
    const next = stepChapter(books, position, FORWARD);

    // stepChapter clamps at the ends of the canon by returning the position it
    // was given — so an unchanged result means there is nowhere further to go.
    const isAtCanonStart = previous.bookId === position.bookId
        && previous.chapter === position.chapter;
    const isAtCanonEnd = next.bookId === position.bookId
        && next.chapter === position.chapter;

    const handleSelect = (selected) => {
        setOpenPicker(null);
        onChange(selected);
    };

    return (
        <>
            <footer className={`analyze-footer analyze-footer--${variant}`}>
                {showArrows && (
                    <button
                        type="button"
                        className="analyze-footer-button analyze-footer-button--arrow"
                        onClick={() => onChange(previous)}
                        disabled={!isReady || isAtCanonStart}
                        aria-label="Previous chapter"
                        title="Previous chapter"
                    >
                        ←
                    </button>
                )}

                <button
                    type="button"
                    className="analyze-footer-button analyze-footer-button--book"
                    onClick={() => setOpenPicker('book')}
                    disabled={!isReady}
                    aria-label="Choose a book"
                >
                    {book ? book.name : '—'}
                </button>

                <button
                    type="button"
                    className="analyze-footer-button analyze-footer-button--chapter"
                    onClick={() => setOpenPicker('chapter')}
                    disabled={!isReady}
                    aria-label="Choose a chapter"
                >
                    {position.chapter}
                </button>

                {showArrows && (
                    <button
                        type="button"
                        className="analyze-footer-button analyze-footer-button--arrow"
                        onClick={() => onChange(next)}
                        disabled={!isReady || isAtCanonEnd}
                        aria-label="Next chapter"
                        title="Next chapter"
                    >
                        →
                    </button>
                )}
            </footer>

            {openPicker === 'book' && (
                <BookPicker
                    books={books}
                    selectedBookId={position.bookId}
                    onSelect={handleSelect}
                    onClose={() => setOpenPicker(null)}
                />
            )}

            {openPicker === 'chapter' && (
                <ChapterPicker
                    book={book}
                    selectedChapter={position.chapter}
                    onSelect={handleSelect}
                    onClose={() => setOpenPicker(null)}
                />
            )}
        </>
    );
};

export default PanelFooter;
