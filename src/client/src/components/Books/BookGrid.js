import React from 'react';
import '../Styling/Books.css';

// The 66-book canon as a grid, split by testament — and nothing else.
//
// It carries no overlay of its own because its two callers wrap it in
// different ones: /analyze opens it inside Modal, /thoughts inside
// BubbleOverlay. The shells differ; the grid is the part that is actually the
// same, so the grid is what is shared.
//
// It reports a BOOK ID and nothing more. The Analyze picker's "always land on
// chapter 1" rule lives in that picker, where the chapter means something —
// here there is no chapter for it to be about.

// Testament sections, in canonical order.
const SECTIONS = [
    { testament: 'OT', label: 'Old Testament' },
    { testament: 'NT', label: 'New Testament' },
];

/**
 * @param books           every book, in any order — sorted here
 * @param selectedBookId  the book to mark as current, or null for none
 * @param onSelect        (bookId) -> void
 */
const BookGrid = ({ books, selectedBookId = null, onSelect }) => {
    const ordered = [...books].sort((a, b) => a.canonicalOrder - b.canonicalOrder);

    return (
        <>
            {SECTIONS.map(({ testament, label }) => (
                <section
                    key={testament}
                    className="book-grid-section"
                    // A named group rather than a bare heading, so a reader
                    // moving by landmark hears which testament they are in
                    // without having to infer it from the last heading passed.
                    role="group"
                    aria-label={label}
                >
                    <h3 className="book-grid-heading">{label}</h3>

                    <div className="book-grid">
                        {ordered
                            .filter(book => book.testament === testament)
                            .map(book => (
                                <button
                                    key={book.id}
                                    type="button"
                                    className={`book-grid-cell${
                                        book.id === selectedBookId ? ' book-grid-cell--selected' : ''
                                    }`}
                                    aria-current={book.id === selectedBookId ? 'true' : undefined}
                                    onClick={() => onSelect(book.id)}
                                >
                                    {book.name}
                                </button>
                            ))}
                    </div>
                </section>
            ))}
        </>
    );
};

export default BookGrid;
