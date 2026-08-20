'use strict';

const { EXPECTED_BOOK_COUNT, EXPECTED_CHAPTER_COUNT } = require('./canon');

/**
 * Post-import verification. Every check runs against the database, not against
 * the in-memory rows, so a silent write failure cannot slip through.
 *
 * All checks are collected before throwing: one run reports every problem
 * rather than only the first.
 */

/**
 * Expected verse totals per translation.
 *
 * The KJV total is the well-known 31,102 and is asserted exactly. The WEB omits
 * ~31 verses the KJV numbers (Acts 8:37, Matthew 17:21, ...) and different
 * distributions differ slightly, so its actual total is logged and only
 * range-checked — tight enough to catch a truncated download.
 */
const VERSE_TOTALS = Object.freeze({
    kjv: Object.freeze({ exact: 31102 }),
    web: Object.freeze({ min: 31000, max: 31200 }),
});

const FIRST_VERSE = Object.freeze({ book: 'Genesis', chapter: 1, verse: 1 });
const LAST_VERSE = Object.freeze({ book: 'Revelation', chapter: 22, verse: 21 });

async function verifyScripture(connection, translation, log = () => {}) {
    const failures = [];
    const fail = (message) => failures.push(message);

    const bookCount = await scalar(connection, 'SELECT COUNT(*) AS value FROM books');
    const chapterCount = await scalar(connection, 'SELECT COUNT(*) AS value FROM chapters');
    const verseCount = await scalar(connection, 'SELECT COUNT(*) AS value FROM verses');

    log(`  books:    ${bookCount}`);
    log(`  chapters: ${chapterCount}`);
    log(`  verses:   ${verseCount}`);

    if (bookCount !== EXPECTED_BOOK_COUNT) {
        fail(`expected ${EXPECTED_BOOK_COUNT} books, found ${bookCount}`);
    }
    if (chapterCount !== EXPECTED_CHAPTER_COUNT) {
        fail(`expected ${EXPECTED_CHAPTER_COUNT} chapters, found ${chapterCount}`);
    }

    checkVerseTotal(translation, verseCount, fail);

    await checkAggregates(connection, { chapterCount, verseCount }, fail);
    await checkVerseIndexRange(connection, verseCount, fail);
    await checkChapterRanges(connection, fail);
    await checkBoundaryVerse(connection, 1, FIRST_VERSE, fail);
    await checkBoundaryVerse(connection, verseCount, LAST_VERSE, fail);

    if (failures.length > 0) {
        throw new Error(
            `Scripture verification failed (${failures.length} problem(s)):\n` +
                failures.map((message) => `  - ${message}`).join('\n')
        );
    }

    return { bookCount, chapterCount, verseCount };
}

function checkVerseTotal(translation, verseCount, fail) {
    const expected = VERSE_TOTALS[translation];

    if (!expected) {
        fail(`no expected verse total configured for translation "${translation}"`);
        return;
    }
    if (expected.exact !== undefined && verseCount !== expected.exact) {
        fail(`expected ${expected.exact} verses for ${translation}, found ${verseCount}`);
        return;
    }
    if (expected.min !== undefined && (verseCount < expected.min || verseCount > expected.max)) {
        fail(
            `expected between ${expected.min} and ${expected.max} verses for ` +
                `${translation}, found ${verseCount}`
        );
    }
}

/** books.chapter_count and chapters.verse_count must add up to the real totals. */
async function checkAggregates(connection, { chapterCount, verseCount }, fail) {
    const summedChapters = await scalar(
        connection,
        'SELECT COALESCE(SUM(chapter_count), 0) AS value FROM books'
    );
    const summedVerses = await scalar(
        connection,
        'SELECT COALESCE(SUM(verse_count), 0) AS value FROM chapters'
    );

    if (summedChapters !== chapterCount) {
        fail(`SUM(books.chapter_count) is ${summedChapters}, but there are ${chapterCount} chapters`);
    }
    if (summedVerses !== verseCount) {
        fail(`SUM(chapters.verse_count) is ${summedVerses}, but there are ${verseCount} verses`);
    }
}

/** verse_index must be a gapless 1..N run. */
async function checkVerseIndexRange(connection, verseCount, fail) {
    const [[range]] = await connection.query(
        'SELECT MIN(verse_index) AS lowest, MAX(verse_index) AS highest, ' +
            'COUNT(DISTINCT verse_index) AS distinctCount FROM verses'
    );

    if (Number(range.lowest) !== 1) {
        fail(`lowest verse_index is ${range.lowest}, expected 1`);
    }
    if (Number(range.highest) !== verseCount) {
        fail(`highest verse_index is ${range.highest}, expected ${verseCount}`);
    }
    if (Number(range.distinctCount) !== verseCount) {
        fail(`verse_index has ${range.distinctCount} distinct values across ${verseCount} verses`);
    }
}

/**
 * Each chapter's precomputed range must match its verses, and consecutive
 * chapters must abut with no gap or overlap.
 */
async function checkChapterRanges(connection, fail) {
    const mismatched = await scalar(
        connection,
        `SELECT COUNT(*) AS value FROM chapters c
         JOIN (
           SELECT book_id, chapter,
                  MIN(verse_index) AS lowest,
                  MAX(verse_index) AS highest,
                  COUNT(*) AS total
           FROM verses GROUP BY book_id, chapter
         ) v ON v.book_id = c.book_id AND v.chapter = c.number
         WHERE c.start_index <> v.lowest
            OR c.end_index <> v.highest
            OR c.verse_count <> v.total`
    );

    if (mismatched > 0) {
        fail(`${mismatched} chapter(s) have start_index/end_index/verse_count out of step with verses`);
    }

    const discontinuities = await scalar(
        connection,
        `SELECT COUNT(*) AS value FROM chapters a
         JOIN chapters b ON b.id = a.id + 1
         WHERE b.start_index <> a.end_index + 1`
    );

    if (discontinuities > 0) {
        fail(`${discontinuities} gap(s) or overlap(s) between consecutive chapter ranges`);
    }
}

/** Acceptance criterion: verse_index 1 is Genesis 1:1 (and N is Revelation 22:21). */
async function checkBoundaryVerse(connection, verseIndex, expected, fail) {
    const [rows] = await connection.query(
        `SELECT b.name AS book, v.chapter, v.verse
         FROM verses v JOIN books b ON b.id = v.book_id
         WHERE v.verse_index = ?`,
        [verseIndex]
    );

    if (rows.length === 0) {
        fail(`no verse at verse_index ${verseIndex}`);
        return;
    }

    const found = rows[0];
    const actual = `${found.book} ${found.chapter}:${found.verse}`;
    const wanted = `${expected.book} ${expected.chapter}:${expected.verse}`;

    if (actual !== wanted) {
        fail(`verse_index ${verseIndex} is ${actual}, expected ${wanted}`);
    }
}

async function scalar(connection, sql) {
    const [rows] = await connection.query(sql);
    return Number(rows[0].value);
}

module.exports = { VERSE_TOTALS, verifyScripture };
