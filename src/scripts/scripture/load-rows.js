'use strict';

/**
 * Writes the built rows into MySQL.
 *
 * Idempotency strategy: clear-and-reload inside a single transaction. Re-running
 * the importer always produces the same table contents, and a failure part-way
 * rolls back to the previous state. (TRUNCATE is not used: it commits implicitly
 * and is rejected on tables referenced by a foreign key.)
 */

const INSERT_BATCH_SIZE = 500;

// Cleared child-first so the foreign keys stay satisfied throughout.
const TABLES_IN_CLEAR_ORDER = ['verses', 'chapters', 'books'];

// Column order must match the tuple builders below.
const BOOK_COLUMNS = ['id', 'name', 'abbrev', 'testament', 'chapter_count', 'canonical_order'];
const CHAPTER_COLUMNS = ['id', 'book_id', 'number', 'verse_count', 'start_index', 'end_index'];
const VERSE_COLUMNS = ['id', 'book_id', 'chapter', 'verse', 'verse_index', 'text'];

const toBookTuple = (book) => [
    book.id,
    book.name,
    book.abbrev,
    book.testament,
    book.chapterCount,
    book.canonicalOrder,
];

const toChapterTuple = (chapter) => [
    chapter.id,
    chapter.bookId,
    chapter.number,
    chapter.verseCount,
    chapter.startIndex,
    chapter.endIndex,
];

const toVerseTuple = (verse) => [
    verse.id,
    verse.bookId,
    verse.chapter,
    verse.verse,
    verse.verseIndex,
    verse.text,
];

/**
 * Replaces the entire scripture dataset. Commits on success, rolls back on any
 * error and rethrows so the caller can fail loudly.
 */
async function loadScripture(connection, { books, chapters, verses }, log = () => {}) {
    await connection.beginTransaction();

    try {
        for (const table of TABLES_IN_CLEAR_ORDER) {
            const [result] = await connection.query(`DELETE FROM \`${table}\``);
            log(`  cleared ${table} (${result.affectedRows} existing rows)`);
        }

        await insertBatched(connection, 'books', BOOK_COLUMNS, books.map(toBookTuple), log);
        await insertBatched(connection, 'chapters', CHAPTER_COLUMNS, chapters.map(toChapterTuple), log);
        await insertBatched(connection, 'verses', VERSE_COLUMNS, verses.map(toVerseTuple), log);

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    }
}

async function insertBatched(connection, table, columns, tuples, log) {
    const columnList = columns.map((column) => `\`${column}\``).join(', ');
    const sql = `INSERT INTO \`${table}\` (${columnList}) VALUES ?`;

    for (let offset = 0; offset < tuples.length; offset += INSERT_BATCH_SIZE) {
        const batch = tuples.slice(offset, offset + INSERT_BATCH_SIZE);
        await connection.query(sql, [batch]);
    }

    log(`  inserted ${tuples.length} rows into ${table}`);
}

module.exports = { INSERT_BATCH_SIZE, loadScripture };
