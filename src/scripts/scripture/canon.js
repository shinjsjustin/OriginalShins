'use strict';

/**
 * The 66-book Protestant canon — the authority for book identity in this app.
 *
 * The imported source file supplies verse *text* only. Names, abbreviations,
 * testament and canonical order come from here, so the database looks the same
 * whichever public-domain translation was loaded. `chapterCount` doubles as an
 * integrity check: a source whose chapter count disagrees is rejected.
 */

// [name, abbrev (<= 8 chars), testament, chapterCount]
const BOOK_DEFINITIONS = [
    ['Genesis', 'Gen', 'OT', 50],
    ['Exodus', 'Exod', 'OT', 40],
    ['Leviticus', 'Lev', 'OT', 27],
    ['Numbers', 'Num', 'OT', 36],
    ['Deuteronomy', 'Deut', 'OT', 34],
    ['Joshua', 'Josh', 'OT', 24],
    ['Judges', 'Judg', 'OT', 21],
    ['Ruth', 'Ruth', 'OT', 4],
    ['1 Samuel', '1Sam', 'OT', 31],
    ['2 Samuel', '2Sam', 'OT', 24],
    ['1 Kings', '1Kgs', 'OT', 22],
    ['2 Kings', '2Kgs', 'OT', 25],
    ['1 Chronicles', '1Chr', 'OT', 29],
    ['2 Chronicles', '2Chr', 'OT', 36],
    ['Ezra', 'Ezra', 'OT', 10],
    ['Nehemiah', 'Neh', 'OT', 13],
    ['Esther', 'Esth', 'OT', 10],
    ['Job', 'Job', 'OT', 42],
    ['Psalms', 'Ps', 'OT', 150],
    ['Proverbs', 'Prov', 'OT', 31],
    ['Ecclesiastes', 'Eccl', 'OT', 12],
    ['Song of Songs', 'Song', 'OT', 8],
    ['Isaiah', 'Isa', 'OT', 66],
    ['Jeremiah', 'Jer', 'OT', 52],
    ['Lamentations', 'Lam', 'OT', 5],
    ['Ezekiel', 'Ezek', 'OT', 48],
    ['Daniel', 'Dan', 'OT', 12],
    ['Hosea', 'Hos', 'OT', 14],
    ['Joel', 'Joel', 'OT', 3],
    ['Amos', 'Amos', 'OT', 9],
    ['Obadiah', 'Obad', 'OT', 1],
    ['Jonah', 'Jonah', 'OT', 4],
    ['Micah', 'Mic', 'OT', 7],
    ['Nahum', 'Nah', 'OT', 3],
    ['Habakkuk', 'Hab', 'OT', 3],
    ['Zephaniah', 'Zeph', 'OT', 3],
    ['Haggai', 'Hag', 'OT', 2],
    ['Zechariah', 'Zech', 'OT', 14],
    ['Malachi', 'Mal', 'OT', 4],
    ['Matthew', 'Matt', 'NT', 28],
    ['Mark', 'Mark', 'NT', 16],
    ['Luke', 'Luke', 'NT', 24],
    ['John', 'John', 'NT', 21],
    ['Acts', 'Acts', 'NT', 28],
    ['Romans', 'Rom', 'NT', 16],
    ['1 Corinthians', '1Cor', 'NT', 16],
    ['2 Corinthians', '2Cor', 'NT', 13],
    ['Galatians', 'Gal', 'NT', 6],
    ['Ephesians', 'Eph', 'NT', 6],
    ['Philippians', 'Phil', 'NT', 4],
    ['Colossians', 'Col', 'NT', 4],
    ['1 Thessalonians', '1Thess', 'NT', 5],
    ['2 Thessalonians', '2Thess', 'NT', 3],
    ['1 Timothy', '1Tim', 'NT', 6],
    ['2 Timothy', '2Tim', 'NT', 4],
    ['Titus', 'Titus', 'NT', 3],
    ['Philemon', 'Phlm', 'NT', 1],
    ['Hebrews', 'Heb', 'NT', 13],
    ['James', 'Jas', 'NT', 5],
    ['1 Peter', '1Pet', 'NT', 5],
    ['2 Peter', '2Pet', 'NT', 3],
    ['1 John', '1John', 'NT', 5],
    ['2 John', '2John', 'NT', 1],
    ['3 John', '3John', 'NT', 1],
    ['Jude', 'Jude', 'NT', 1],
    ['Revelation', 'Rev', 'NT', 22],
];

const CANONICAL_BOOKS = Object.freeze(
    BOOK_DEFINITIONS.map(([name, abbrev, testament, chapterCount], position) =>
        Object.freeze({
            id: position + 1,
            canonicalOrder: position + 1,
            name,
            abbrev,
            testament,
            chapterCount,
        })
    )
);

const EXPECTED_BOOK_COUNT = CANONICAL_BOOKS.length;

const EXPECTED_CHAPTER_COUNT = CANONICAL_BOOKS.reduce(
    (total, book) => total + book.chapterCount,
    0
);

module.exports = {
    CANONICAL_BOOKS,
    EXPECTED_BOOK_COUNT,
    EXPECTED_CHAPTER_COUNT,
};
