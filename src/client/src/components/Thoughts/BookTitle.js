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
//
// `noun` exists because this title is no longer only Thoughts'. ImportPicker
// (see components/Bubbles/ImportPicker.js) puts the same title block over a
// field that is not always topics — a chapter's importer picks ideas only,
// and "Matthew Topics" would misname a picker whose sole purpose there is
// choosing an idea. The default is "Topics" so this page's own call is
// unchanged.

/**
 * @param books     every book, from /api/books
 * @param bookId    the book in scope
 * @param onChange  (bookId) -> void
 * @param noun      the word after the book's name — what this button's field
 *                  actually holds. Defaults to "Topics", this page's own.
 */
const BookTitle = ({ books, bookId, onChange, noun = 'Topics' }) => {
    const [isPicking, setIsPicking] = useState(false);

    const book = books.find(item => item.id === bookId) || null;
    if (!book) return null;

    const pick = (picked) => {
        setIsPicking(false);
        // A press on the book already in scope is not a change, and is not
        // reported as one. Every caller does something on the way through:
        // Thoughts rewrites `?book=`, and ImportPicker throws away the pick
        // the reader has made — neither of which anybody asked for by
        // choosing the book they are already in.
        if (picked !== bookId) onChange(picked);
    };

    return (
        <>
            <button
                type="button"
                className="thoughts-book-title"
                onClick={() => setIsPicking(true)}
            >
                {book.name} {noun}
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
