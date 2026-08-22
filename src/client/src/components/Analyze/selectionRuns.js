// Turns a set of clicked verses into the references a note can be anchored to.
//
// A click selection is a *set* of verse indexes — clicking verse 1 and verse 10
// selects two verses, not ten. A reference, though, is a contiguous range, so
// the set has to be cut into runs before it can be saved: that selection
// anchors two references, and never one running 1-10.
//
// Verse *numbers* are deliberately absent here: a run is a stretch of
// consecutive indexes, and pendingSelection.js is what carries the numbers
// clicked alongside them. The WEB omits verses the KJV numbers, so a chapter's
// numbers can skip while its indexes stay gapless — a number can never be
// derived from an index, only remembered from the chapter it was read off.
//
// Nothing here touches React, the DOM or the network.

const ascending = (a, b) => a - b;

export const isVerseSelected = (verseIndexes, verseIndex) =>
    verseIndexes.includes(verseIndex);

// Add or remove one verse, returning a new sorted array. The clicks arrive in
// whatever order the reader makes them; keeping the set sorted here is what
// lets everything downstream assume ascending order.
export const toggleVerseIndex = (verseIndexes, verseIndex) => (
    verseIndexes.includes(verseIndex)
        ? verseIndexes.filter(index => index !== verseIndex)
        : [...verseIndexes, verseIndex].sort(ascending)
);

// The selection cut into runs of consecutive indexes: [10,11,14] -> [[10,11],[14]].
export const contiguousRuns = (verseIndexes) => {
    const sorted = [...verseIndexes].sort(ascending);

    return sorted.reduce((runs, index) => {
        const current = runs[runs.length - 1];
        const isConsecutive = current && index === current[current.length - 1] + 1;

        if (isConsecutive) {
            return [...runs.slice(0, -1), [...current, index]];
        }
        return [...runs, [index]];
    }, []);
};
