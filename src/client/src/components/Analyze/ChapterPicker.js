import React from 'react';
import Modal from './Modal';

// Modal grid of every chapter in one book — 1 to 150 at the widest (Psalms).
const ChapterPicker = ({ book, selectedChapter, onSelect, onClose }) => {
    // Guarded rather than assumed: the footer only opens this once the canon has
    // loaded, but a book we cannot describe must not render an empty grid.
    if (!book) {
        return null;
    }

    const chapters = Array.from({ length: book.chapterCount }, (_, i) => i + 1);

    return (
        <Modal title={`Choose a chapter in ${book.name}`} onClose={onClose}>
            <div className="analyze-grid analyze-grid--chapters">
                {chapters.map(chapter => (
                    <button
                        key={chapter}
                        type="button"
                        className={`analyze-grid-cell${
                            chapter === selectedChapter ? ' analyze-grid-cell--selected' : ''
                        }`}
                        aria-current={chapter === selectedChapter ? 'true' : undefined}
                        onClick={() => onSelect({ bookId: book.id, chapter })}
                    >
                        {chapter}
                    </button>
                ))}
            </div>
        </Modal>
    );
};

export default ChapterPicker;
