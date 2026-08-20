const express = require('express');

const { MAX_BOOK_ID, MAX_CHAPTER_NUMBER, parsePositiveInt } = require('../lib/params');
const { findChapter, findVersesInChapter } = require('../lib/chapters');
const { findReferencesOverlappingChapter } = require('../lib/references');

const router = express.Router();

// GET /api/chapter/:bookId/:chapter
// Every verse of one chapter, in verse order, plus the book/chapter metadata
// the panel header needs and the note references overlapping it. One round trip
// per panel navigation.
//
// Shape:
//   { book:    { id, name, abbrev, testament, chapterCount },
//     chapter: { number, verseCount, startIndex, endIndex },
//     verses:  [ { id, verse, verseIndex, text } ],
//     references: [ { id, noteId, noteTitle, bookId, chapter,
//                     startVerse, endVerse, startIndex, endIndex, sortOrder } ] }
router.get('/:bookId/:chapter', async (req, res) => {
    const bookId = parsePositiveInt(req.params.bookId, MAX_BOOK_ID);
    const chapterNumber = parsePositiveInt(req.params.chapter, MAX_CHAPTER_NUMBER);

    if (bookId === null || chapterNumber === null) {
        return res.status(400).json({
            error: 'bookId and chapter must be positive integers within the canon',
        });
    }

    try {
        const found = await findChapter(bookId, chapterNumber);
        if (!found) {
            return res.status(404).json({ error: 'Chapter not found' });
        }

        // The verses and the highlights covering them are independent reads —
        // one of static scripture, one of this user's notes; issue them together.
        const [verses, references] = await Promise.all([
            findVersesInChapter(bookId, chapterNumber),

            // The plan's overlap query, scoped to the caller. A reference comes
            // back whenever its verse_index range intersects the chapter's at
            // all, which is what puts a note anchored either side of a chapter
            // boundary into both chapters.
            findReferencesOverlappingChapter(
                req.user.id,
                found.chapter.startIndex,
                found.chapter.endIndex
            ),
        ]);

        res.status(200).json({
            book: found.book,
            chapter: found.chapter,
            verses,
            references,
        });
    } catch (err) {
        console.error(`GET /api/chapter/${req.params.bookId}/${req.params.chapter} error:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
