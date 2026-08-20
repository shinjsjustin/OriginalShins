// Route- and query-parameter parsing shared by the scripture and notes routes.
//
// Everything here answers one question: is this string a positive integer the
// canon could plausibly contain? A URL segment or query value is user input and
// is never handed to a query until it has been through one of these.

// Widest legal values in the canon. Book ids run 1..66; Psalms has the most
// chapters (150) and Psalm 119 the most verses (176).
const MAX_BOOK_ID = 66;
const MAX_CHAPTER_NUMBER = 150;
const MAX_VERSE_NUMBER = 176;

// Ceiling of MySQL's INT UNSIGNED — the type of every id this app generates.
const MAX_ROW_ID = 4294967295;

const INTEGER_PATTERN = /^\d+$/;

// Parses a value that must be a positive integer no greater than `max`.
// Returns null for anything else, including numeric-looking strings with
// signs, decimals or whitespace.
const parsePositiveInt = (value, max) => {
    if (typeof value !== 'string' || !INTEGER_PATTERN.test(value)) {
        return null;
    }

    const parsed = Number(value);
    if (parsed < 1 || parsed > max) {
        return null;
    }

    return parsed;
};

// Same rule for a value that arrives already parsed out of a JSON body, where
// a client may legitimately send a number rather than a string.
const parsePositiveIntField = (value, max) => {
    if (typeof value === 'number') {
        return Number.isInteger(value) && value >= 1 && value <= max ? value : null;
    }
    return parsePositiveInt(value, max);
};

const parseRowId = (value) => parsePositiveInt(value, MAX_ROW_ID);

module.exports = {
    MAX_BOOK_ID,
    MAX_CHAPTER_NUMBER,
    MAX_VERSE_NUMBER,
    MAX_ROW_ID,
    parsePositiveInt,
    parsePositiveIntField,
    parseRowId,
};
