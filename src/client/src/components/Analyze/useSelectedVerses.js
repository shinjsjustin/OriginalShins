import { useCallback, useMemo, useState } from 'react';
import {
    clearAll,
    clearPlace as clearPlaceIn,
    places,
    referencesFrom,
    toggleVerse as toggleVerseIn,
    verseIndexesIn,
} from './pendingSelection';

// Which verses the reader has clicked, and where.
//
// One basket for the whole page, spanning chapters and panels alike: a note can
// be anchored to passages from several chapters at once, so clicking in the
// other panel — or in another chapter of the same one — adds to the selection
// rather than replacing it.
//
// Nothing is cleared on navigation. A chapter's verses stay in the basket while
// it is off screen: `selectedVersesIn` simply reports nothing for a chapter
// that holds none, and the marks are still there when the reader comes back.
// The references survive that round trip because each verse went in with its
// printed number attached — see pendingSelection.js.
const useSelectedVerses = () => {
    const [basket, setBasket] = useState(clearAll);

    // Takes the whole verse row, not just its index: the printed number has to
    // be captured now, while the chapter that carries it is still loaded.
    const toggleVerse = useCallback((position, verse) => {
        setBasket(previous => toggleVerseIn(previous, position, verse));
    }, []);

    const clearSelection = useCallback(() => setBasket(clearAll()), []);

    const clearPlace = useCallback((position) => {
        setBasket(previous => clearPlaceIn(previous, position));
    }, []);

    const selectedVersesIn = useCallback(
        (position) => verseIndexesIn(basket, position),
        [basket]
    );

    // One reference per contiguous run per chapter, ready for the editor to
    // anchor a note to. Resolved from the basket alone, so it covers chapters
    // no panel is showing any more.
    const selectionReferences = useMemo(() => referencesFrom(basket), [basket]);

    // The chapters holding a selection, for the UI to name.
    const selectedPlaces = useMemo(() => places(basket), [basket]);

    return {
        toggleVerse,
        clearSelection,
        clearPlace,
        selectedVersesIn,
        selectionReferences,
        selectedPlaces,
    };
};

export default useSelectedVerses;
