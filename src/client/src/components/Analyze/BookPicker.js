import React from 'react';
import Modal from './Modal';
import BookGrid from '../Books/BookGrid';

// The Analyze page's book picker: the shared grid, in this page's modal.
//
// Picking a book always lands on its chapter 1. The chapter currently shown
// may not exist in the book being moved to, and carrying it over would
// silently clamp to something the reader did not ask for. That rule lives here
// rather than in BookGrid because a chapter only means something to a caller
// that has panels pointed at one — /thoughts, the grid's other caller, has no
// chapter at all.
const BookPicker = ({ books, selectedBookId, onSelect, onClose }) => (
    <Modal title="Choose a book" onClose={onClose}>
        <BookGrid
            books={books}
            selectedBookId={selectedBookId}
            onSelect={(bookId) => onSelect({ bookId, chapter: 1 })}
        />
    </Modal>
);

export default BookPicker;
