// Chapter lookups against the static scripture tables.
//
// Both the chapter fetch and the notes fetch need the same thing first: the
// verse_index range a chapter spans. That range is the left-hand side of every
// reference-overlap query, so it is resolved in one place rather than being
// re-joined at each call site.
const db = require('../db/db');

// One chapter with its book metadata, or null when the reference does not
// exist. The index bounds come precomputed off `chapters` — they are never
// derived by scanning `verses`.
const findChapter = async (bookId, chapterNumber) => {
    const [rows] = await db.execute(
        `SELECT c.number, c.verse_count, c.start_index, c.end_index,
                b.id AS book_id, b.name, b.abbrev, b.testament, b.chapter_count
         FROM chapters c
         JOIN books b ON b.id = c.book_id
         WHERE c.book_id = ? AND c.number = ?`,
        [bookId, chapterNumber]
    );

    if (rows.length === 0) {
        return null;
    }

    const row = rows[0];

    return {
        book: {
            id: row.book_id,
            name: row.name,
            abbrev: row.abbrev,
            testament: row.testament,
            chapterCount: row.chapter_count,
        },
        chapter: {
            number: row.number,
            verseCount: row.verse_count,
            startIndex: row.start_index,
            endIndex: row.end_index,
        },
    };
};

const findVersesInChapter = async (bookId, chapterNumber) => {
    const [rows] = await db.execute(
        `SELECT id, verse, verse_index, text
         FROM verses
         WHERE book_id = ? AND chapter = ?
         ORDER BY verse_index`,
        [bookId, chapterNumber]
    );

    return rows.map(row => ({
        id: row.id,
        verse: row.verse,
        verseIndex: row.verse_index,
        text: row.text,
    }));
};

module.exports = { findChapter, findVersesInChapter };
