// Maps a range of verse rows onto the reference an API call can take.
//
// References are verse ranges, so a selection only ever has to resolve to the
// verse rows it covers — never to character offsets inside them. That is what
// makes this a dozen lines instead of an anchoring library: the panel writes
// `data-verse-index` on every row, and selectionRuns.js reads the clicked
// indexes straight back off it.

// Converts a verse-index range into the { bookId, chapter, startVerse,
// endVerse } the API accepts, using the chapter the panel has already loaded.
//
// It reads the verse *numbers* off the covered rows rather than deriving them
// from the indexes. The WEB omits verses the KJV numbers, so a chapter's verse
// numbers can skip while its indexes stay gapless; only the loaded chapter
// knows which numbers actually exist.
export const referenceFromVerseIndexRange = (chapterData, range) => {
    if (!chapterData || !range) {
        return null;
    }

    const covered = chapterData.verses.filter(verse =>
        verse.verseIndex >= range.startIndex && verse.verseIndex <= range.endIndex);

    if (covered.length === 0) {
        return null;
    }

    return {
        bookId: chapterData.book.id,
        chapter: chapterData.chapter.number,
        startVerse: covered[0].verse,
        endVerse: covered[covered.length - 1].verse,
    };
};
