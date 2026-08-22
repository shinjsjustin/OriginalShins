// The page's basket of clicked verses: what the reader has picked out, from
// wherever they picked it out.
//
// A note can be anchored to several chapters at once, so the selection is not
// one range in one panel. It is a set of places — a place being a book and a
// chapter — each holding the verses clicked there.
//
// Two things fall out of the keying:
//
//   * A place is book plus chapter and *not* the panel it was clicked in. The
//     same chapter open in both panels is one place, so a verse clicked in
//     either lights up in both.
//   * Each verse is stored as its index *and* its printed number. The number
//     cannot be recovered later: it lives on the chapter payload, and the
//     moment a panel navigates away that payload is gone. See the comments in
//     selectionRuns.js on why the number is not simply the index — the WEB
//     omits verses the KJV numbers, so numbers skip where indexes do not.
//
// Nothing here touches React, the DOM or the network.

import { contiguousRuns } from './selectionRuns';

// A stable empty array, so a chapter with nothing selected is handed the same
// value every time instead of a fresh one that would defeat memoization.
const NOTHING_SELECTED = [];

const byVerseIndex = (a, b) => a.verseIndex - b.verseIndex;

// Canonical order: Genesis before Matthew, chapter 1 before chapter 2.
const canonically = (a, b) => a.bookId - b.bookId || a.chapter - b.chapter;

const keyOf = ({ bookId, chapter }) => `${bookId}:${chapter}`;

const positionFrom = (key) => {
    const [bookId, chapter] = key.split(':').map(Number);
    return { bookId, chapter };
};

const versesAt = (basket, position) => basket[keyOf(position)] || NOTHING_SELECTED;

// The empty basket: no places at all, rather than a map of empty ones. Whether
// anything is selected anywhere is then just whether it has any keys.
export const clearAll = () => ({});

// Add or remove one verse of one chapter. The verse arrives whole — the caller
// must hand over the row, not just its index, because the number travels with
// it into the basket and cannot be looked up afterwards.
export const toggleVerse = (basket, position, verse) => {
    const current = versesAt(basket, position);
    const isSelected = current.some(entry => entry.verseIndex === verse.verseIndex);

    const next = isSelected
        ? current.filter(entry => entry.verseIndex !== verse.verseIndex)
        : [...current, { verseIndex: verse.verseIndex, verse: verse.verse }].sort(byVerseIndex);

    // Unclicking the last verse of a chapter drops the chapter outright, so an
    // emptied place never lingers as a key with nothing behind it.
    if (next.length === 0) {
        return clearPlace(basket, position);
    }

    return { ...basket, [keyOf(position)]: next };
};

// Everything clicked in one chapter, forgotten.
export const clearPlace = (basket, position) => {
    const key = keyOf(position);
    if (!(key in basket)) {
        return basket;
    }

    const { [key]: removed, ...remaining } = basket;
    return remaining;
};

// The indexes one chapter should paint as selected. Scoped by book and chapter,
// so a selection never lights up whichever verses happen to share its indexes
// elsewhere in the canon.
export const verseIndexesIn = (basket, position) => {
    const verses = versesAt(basket, position);
    return verses === NOTHING_SELECTED ? NOTHING_SELECTED : verses.map(entry => entry.verseIndex);
};

// Every chapter holding a selection, in canonical order.
export const places = (basket) => Object.keys(basket).map(positionFrom).sort(canonically);

export const totalVerseCount = (basket) => Object.keys(basket)
    .reduce((total, key) => total + basket[key].length, 0);

// The full list of references the basket anchors: one per contiguous run per
// place, in canonical order.
//
// A run is a stretch of consecutive *indexes*; the reference it becomes carries
// the printed numbers of its first and last verse, which is why both were kept.
export const referencesFrom = (basket) => places(basket).flatMap(position => {
    const verses = versesAt(basket, position);
    const numberOf = new Map(verses.map(entry => [entry.verseIndex, entry.verse]));

    return contiguousRuns(verses.map(entry => entry.verseIndex)).map(run => ({
        bookId: position.bookId,
        chapter: position.chapter,
        startVerse: numberOf.get(run[0]),
        endVerse: numberOf.get(run[run.length - 1]),
    }));
});
