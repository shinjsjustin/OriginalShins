'use strict';

const { CANONICAL_BOOKS } = require('./canon');

/**
 * Turns a validated source document into the exact rows for books / chapters /
 * verses, assigning `verse_index` as it walks the canon in order.
 *
 * This is the only place `verse_index` is ever computed. Everything downstream
 * — chapter start/end ranges, note references, the Overview axis — reads the
 * value from the database.
 */

// TINYINT UNSIGNED ceilings for `verses.chapter` and `verses.verse`.
const MAX_CHAPTER_NUMBER = 255;
const MAX_VERSE_NUMBER = 255;

function buildScriptureRows(source) {
    const sourceBooksByOrder = indexSourceBooksByOrder(source.books);

    const books = [];
    const chapters = [];
    const verses = [];

    let verseIndex = 0;
    let chapterId = 0;

    for (const book of CANONICAL_BOOKS) {
        const sourceBook = sourceBooksByOrder.get(book.canonicalOrder);

        if (!sourceBook) {
            throw new Error(
                `Source is missing book ${book.canonicalOrder} (${book.name})`
            );
        }
        if (sourceBook.chapters.length !== book.chapterCount) {
            throw new Error(
                `${book.name}: source has ${sourceBook.chapters.length} chapters, ` +
                    `canon expects ${book.chapterCount}`
            );
        }

        books.push({
            id: book.id,
            name: book.name,
            abbrev: book.abbrev,
            testament: book.testament,
            chapterCount: book.chapterCount,
            canonicalOrder: book.canonicalOrder,
        });

        sourceBook.chapters.forEach((sourceChapter, position) => {
            const number = position + 1;

            if (sourceChapter.chapter !== number) {
                throw new Error(
                    `${book.name}: expected chapter ${number} at position ${position}, ` +
                        `source has ${sourceChapter.chapter}`
                );
            }
            if (number > MAX_CHAPTER_NUMBER) {
                throw new Error(`${book.name} ${number}: chapter number exceeds ${MAX_CHAPTER_NUMBER}`);
            }

            chapterId += 1;
            const startIndex = verseIndex + 1;

            verseIndex = appendChapterVerses({
                verses,
                sourceChapter,
                book,
                chapterNumber: number,
                startingVerseIndex: verseIndex,
            });

            chapters.push({
                id: chapterId,
                bookId: book.id,
                number,
                verseCount: sourceChapter.verses.length,
                startIndex,
                endIndex: verseIndex,
            });
        });
    }

    return { books, chapters, verses };
}

/**
 * Appends one chapter's verses and returns the running verse_index.
 *
 * Verse numbers must strictly increase but need not be contiguous: the WEB
 * omits ~31 verses the KJV numbers (Acts 8:37 and friends), so Acts 8 runs
 * ...36, 38... `verse_index` stays monotonic across those gaps.
 */
function appendChapterVerses({ verses, sourceChapter, book, chapterNumber, startingVerseIndex }) {
    let verseIndex = startingVerseIndex;
    let previousVerseNumber = 0;

    for (const sourceVerse of sourceChapter.verses) {
        const reference = `${book.name} ${chapterNumber}:${sourceVerse.verse}`;

        if (sourceVerse.verse <= previousVerseNumber) {
            throw new Error(
                `${reference}: verse numbers must strictly increase ` +
                    `(previous was ${previousVerseNumber})`
            );
        }
        if (sourceVerse.verse > MAX_VERSE_NUMBER) {
            throw new Error(`${reference}: verse number exceeds ${MAX_VERSE_NUMBER}`);
        }

        const text = normalizeVerseText(sourceVerse.text);
        if (!text) {
            throw new Error(`${reference}: verse text is empty`);
        }

        verseIndex += 1;
        previousVerseNumber = sourceVerse.verse;

        verses.push({
            id: verseIndex,
            bookId: book.id,
            chapter: chapterNumber,
            verse: sourceVerse.verse,
            verseIndex,
            text,
        });
    }

    return verseIndex;
}

/** Collapses the source's ragged whitespace so verses render predictably. */
function normalizeVerseText(text) {
    return text.replace(/\s+/g, ' ').trim();
}

function indexSourceBooksByOrder(sourceBooks) {
    const byOrder = new Map();

    for (const sourceBook of sourceBooks) {
        if (byOrder.has(sourceBook.nr)) {
            throw new Error(`Source has two books numbered ${sourceBook.nr}`);
        }
        byOrder.set(sourceBook.nr, sourceBook);
    }

    return byOrder;
}

module.exports = { buildScriptureRows };
