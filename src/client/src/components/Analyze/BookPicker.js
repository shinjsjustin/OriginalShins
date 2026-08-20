import React from 'react';
import Modal from './Modal';

// Testament sections, in canonical order.
const SECTIONS = [
    { testament: 'OT', label: 'Old Testament' },
    { testament: 'NT', label: 'New Testament' },
];

// Modal grid of all 66 books, split by testament.
//
// Picking a book always lands on its chapter 1: the chapter currently shown may
// not exist in the book being moved to, and carrying it over would silently
// clamp to something the reader did not ask for.
const BookPicker = ({ books, selectedBookId, onSelect, onClose }) => {
    const ordered = [...books].sort((a, b) => a.canonicalOrder - b.canonicalOrder);

    return (
        <Modal title="Choose a book" onClose={onClose}>
            {SECTIONS.map(({ testament, label }) => (
                <section key={testament} className="analyze-picker-section">
                    <h3 className="analyze-picker-heading">{label}</h3>

                    <div className="analyze-grid analyze-grid--books">
                        {ordered
                            .filter(book => book.testament === testament)
                            .map(book => (
                                <button
                                    key={book.id}
                                    type="button"
                                    className={`analyze-grid-cell${
                                        book.id === selectedBookId ? ' analyze-grid-cell--selected' : ''
                                    }`}
                                    aria-current={book.id === selectedBookId ? 'true' : undefined}
                                    onClick={() => onSelect({ bookId: book.id, chapter: 1 })}
                                >
                                    {book.name}
                                </button>
                            ))}
                    </div>
                </section>
            ))}
        </Modal>
    );
};

export default BookPicker;
