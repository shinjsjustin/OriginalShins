import React, { useState } from 'react';
import BubbleOverlay from '../Bubbles/BubbleOverlay';
import BookGrid from '../Books/BookGrid';

// The Thoughts page's title, which is also its book control.
//
// It reads `${Book} Topics` because that is what the field below it is: not a
// heading that happens to sit above a filter, but the name of the thing being
// shown. Clicking it opens the same 66-book grid /analyze opens, in this
// page's own overlay — see components/Books/BookGrid.js for why the grid is
// shared and the shell is not.
//
// No chapter anywhere. A topic scope is a book, and there is nothing for a
// chapter to mean in it.
//
// It draws nothing while the canon is still loading. A title naming a book
// nobody has seen would be a claim about a row that has not arrived, and the
// same rule TopBar's breadcrumb follows for an idea still in flight.

/**
 * @param books     every book, from /api/books
 * @param bookId    the book in scope
 * @param onChange  (bookId) -> void
 */
const BookTitle = ({ books, bookId, onChange }) => {
    const [isPicking, setIsPicking] = useState(false);

    const book = books.find(item => item.id === bookId) || null;
    if (!book) return null;

    const pick = (picked) => {
        setIsPicking(false);
        // A press on the book already in scope is not a change. Letting it
        // through would clear the pinned set for nothing, which is the one
        // side effect on this page a reader cannot undo.
        if (picked !== bookId) onChange(picked);
    };

    return (
        <>
            <button
                type="button"
                className="thoughts-book-title"
                onClick={() => setIsPicking(true)}
            >
                {book.name} Topics
            </button>

            {isPicking && (
                <BubbleOverlay label="Choose a book" onClose={() => setIsPicking(false)}>
                    <div className="thoughts-book-picker">
                        <BookGrid books={books} selectedBookId={bookId} onSelect={pick} />
                    </div>
                </BubbleOverlay>
            )}
        </>
    );
};

export default BookTitle;
