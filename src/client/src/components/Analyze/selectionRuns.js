// Turns a set of clicked verses into the references a note can be anchored to.
//
// A click selection is a *set* of verse indexes — clicking verse 1 and verse 10
// selects two verses, not ten. A reference, though, is a contiguous range, so
// the set has to be cut into runs before it can be saved: that selection
// anchors two references, and never one running 1-10.
//
// Nothing here touches React, the DOM or the network.

import { referenceFromVerseIndexRange } from './verseSelection';

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

// One reference per run, in the { bookId, chapter, startVerse, endVerse } shape
// the API takes. The verse *numbers* come off the loaded chapter rather than
// from the indexes, because the WEB omits verses the KJV numbers: indexes stay
// gapless where the printed numbers skip.
//
// A run covering no loaded verse yields nothing rather than a wrong reference.
export const referencesFromSelection = (chapterData, verseIndexes) => {
    if (!chapterData || verseIndexes.length === 0) {
        return [];
    }

    return contiguousRuns(verseIndexes)
        .map(run => referenceFromVerseIndexRange(chapterData, {
            startIndex: run[0],
            endIndex: run[run.length - 1],
        }))
        .filter(Boolean);
};
