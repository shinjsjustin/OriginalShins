// Validation for the query strings of Bourne's two history/notes reads.
//
// Same { value } / { error } result as the other *Input modules. `today` is
// passed in as a local YYYY-MM-DD so the default window is deterministic.
const { fail, ok } = require('./textInput');
const { MAX_BOOK_ID, MAX_CHAPTER_NUMBER, parsePositiveInt } = require('./params');

const DEFAULT_HISTORY_DAYS = 30;
const MAX_HISTORY_DAYS = 366;
const DEFAULT_NOTES_LIMIT = 50;
const MAX_NOTES_LIMIT = 200;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// Days since the epoch for a strict, real calendar date; null otherwise.
// Date.UTC rolls 02-30 over to March, so the round trip is what proves it real.
const dayNumber = (text) => {
    const match = DATE_PATTERN.exec(text);
    if (!match) {
        return null;
    }
    const [year, month, day] = match.slice(1).map(Number);
    const ms = Date.UTC(year, month - 1, day);
    return new Date(ms).toISOString().slice(0, 10) === text ? ms / MS_PER_DAY : null;
};

const formatDay = (days) => new Date(days * MS_PER_DAY).toISOString().slice(0, 10);

// Reads one optional param: absent is { value: undefined }, repeated or
// unparsable is an error naming it.
const readParam = (query, name, parse, description) => {
    const raw = query[name];
    if (raw === undefined) {
        return ok(undefined);
    }
    if (Array.isArray(raw)) {
        return fail(`${name} must be given once`);
    }
    const parsed = parse(raw);
    return parsed === null ? fail(`${name} must be ${description}`) : ok(parsed);
};

const asDay = (raw) => (typeof raw === 'string' && dayNumber(raw) !== null ? raw : null);
const asOffset = (raw) => (typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : null);

const parseHistoryQuery = (query, today) => {
    const to = readParam(query, 'to', asDay, 'a YYYY-MM-DD date');
    if (to.error) return to;
    const from = readParam(query, 'from', asDay, 'a YYYY-MM-DD date');
    if (from.error) return from;

    const toDay = to.value ?? today;
    const fromDay = from.value ?? formatDay(dayNumber(toDay) - (DEFAULT_HISTORY_DAYS - 1));

    const span = dayNumber(toDay) - dayNumber(fromDay) + 1;
    if (span < 1) {
        return fail('from must not be after to');
    }
    if (span > MAX_HISTORY_DAYS) {
        return fail(`the range must be ${MAX_HISTORY_DAYS} days or fewer`);
    }
    return ok({ from: fromDay, to: toDay });
};

const parseNotesQuery = (query) => {
    const since = readParam(query, 'since', asDay, 'a YYYY-MM-DD date');
    if (since.error) return since;
    const book = readParam(query, 'book', (raw) => parsePositiveInt(raw, MAX_BOOK_ID), `a book id between 1 and ${MAX_BOOK_ID}`);
    if (book.error) return book;
    const chapter = readParam(query, 'chapter', (raw) => parsePositiveInt(raw, MAX_CHAPTER_NUMBER), `a chapter between 1 and ${MAX_CHAPTER_NUMBER}`);
    if (chapter.error) return chapter;
    const limit = readParam(query, 'limit', (raw) => parsePositiveInt(raw, MAX_NOTES_LIMIT), `between 1 and ${MAX_NOTES_LIMIT}`);
    if (limit.error) return limit;
    const offset = readParam(query, 'offset', asOffset, '0 or more');
    if (offset.error) return offset;

    if (chapter.value !== undefined && book.value === undefined) {
        return fail('chapter requires book');
    }
    return ok({
        since: since.value ?? null,
        bookId: book.value ?? null,
        chapter: chapter.value ?? null,
        limit: limit.value ?? DEFAULT_NOTES_LIMIT,
        offset: offset.value ?? 0,
    });
};

module.exports = { parseHistoryQuery, parseNotesQuery };
