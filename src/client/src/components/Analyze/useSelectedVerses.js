import { useCallback, useState } from 'react';
import { toggleVerseIndex } from './selectionRuns';

// A stable empty array, so a panel with nothing selected is handed the same
// value every render instead of a fresh one that would defeat memoization.
const NOTHING_SELECTED = [];

// Which verses the reader has clicked, and where.
//
// One selection for the whole page rather than one per panel. A note's anchors
// live in a single chapter, so clicking in the other panel — or in another
// chapter of the same one — starts a new selection rather than extending a
// selection that could never be saved as it stands.
//
// The selection is remembered with its chapter, not cleared when a panel
// navigates: `selectedVersesIn` simply reports nothing while that chapter is
// off screen, and the marks are still there when the reader comes back.
const useSelectedVerses = () => {
    const [selection, setSelection] = useState(null);

    const toggleVerse = useCallback((panel, position, verseIndex) => {
        setSelection(previous => {
            const isSamePlace = previous
                && previous.panel === panel
                && previous.bookId === position.bookId
                && previous.chapter === position.chapter;

            const verseIndexes = toggleVerseIndex(
                isSamePlace ? previous.verseIndexes : NOTHING_SELECTED,
                verseIndex
            );

            // Unclicking the last verse ends the selection outright, which is
            // what makes the action buttons disappear again.
            if (verseIndexes.length === 0) {
                return null;
            }

            return {
                panel,
                bookId: position.bookId,
                chapter: position.chapter,
                verseIndexes,
            };
        });
    }, []);

    const clearSelection = useCallback(() => setSelection(null), []);

    // The indexes one panel should paint as selected, scoped by chapter as well
    // as by panel so a selection never lights up whichever verses happen to
    // share its indexes somewhere else in the canon.
    const selectedVersesIn = useCallback((panel, position) => (
        selection
            && selection.panel === panel
            && selection.bookId === position.bookId
            && selection.chapter === position.chapter
            ? selection.verseIndexes
            : NOTHING_SELECTED
    ), [selection]);

    return { toggleVerse, clearSelection, selectedVersesIn };
};

export default useSelectedVerses;
