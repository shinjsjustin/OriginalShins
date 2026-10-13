const db = require('../db/db');
const { localDate, localDayStart } = require('./readingDay');

const DAY_MS = 24 * 60 * 60 * 1000;

const byChapter = (a, b) => a.bookId - b.bookId || a.chapter - b.chapter;

// Days before logging began have no reading_days rows; a note touched that day
// is the only evidence of reading. Note dates are bucketed in the reader's zone.
function bucketNoteDays(rows, { from, to, loggingBegan, timeZone }) {
    const isWanted = (date) =>
        date >= from && date <= to && (loggingBegan === null || date < loggingBegan);
    const days = new Map();

    for (const row of rows) {
        const dates = new Set([
            localDate(row.created_at, timeZone),
            localDate(row.updated_at, timeZone),
        ]);
        for (const date of [...dates].filter(isWanted)) {
            if (!days.has(date)) days.set(date, new Map());
            if (row.book_id === null) continue;
            days.get(date).set(`${row.book_id}.${row.chapter}`, {
                bookId: row.book_id, bookName: row.book_name, chapter: row.chapter,
            });
        }
    }

    return [...days.keys()].sort().map((date) => ({
        date,
        source: 'notes',
        chapters: [...days.get(date).values()].sort(byChapter),
    }));
}

function groupLoggedDays(rows) {
    const days = new Map();
    for (const row of rows) {
        if (!days.has(row.read_on)) days.set(row.read_on, []);
        days.get(row.read_on).push({
            bookId: row.book_id, bookName: row.book_name, chapter: row.chapter,
        });
    }
    return [...days.keys()].sort().map((date) => ({
        date,
        source: 'log',
        chapters: days.get(date).sort(byChapter),
    }));
}

async function findLoggingBegan(userId) {
    const [rows] = await db.execute(
        `SELECT DATE_FORMAT(MIN(read_on), '%Y-%m-%d') AS began
         FROM reading_days WHERE user_id = ?`,
        [userId],
    );
    return rows[0].began;
}

async function findLoggedDays(userId, from, to) {
    const [rows] = await db.execute(
        `SELECT DATE_FORMAT(rd.read_on, '%Y-%m-%d') AS read_on,
                rd.book_id, b.name AS book_name, rd.chapter
         FROM reading_days rd
         JOIN books b ON b.id = rd.book_id
         WHERE rd.user_id = ? AND rd.read_on BETWEEN ? AND ?
         ORDER BY rd.read_on, rd.book_id, rd.chapter`,
        [userId, from, to],
    );
    return groupLoggedDays(rows);
}

// The window is a day wider than the range on each side, so a zone offset or a
// DST shift can never push a note's local day outside what was fetched.
async function findNoteDays(userId, { from, to, loggingBegan, timeZone }) {
    const windowStart = new Date(localDayStart(from, timeZone).getTime() - DAY_MS);
    const windowEnd = new Date(localDayStart(to, timeZone).getTime() + 2 * DAY_MS);
    const [rows] = await db.execute(
        `SELECT n.id AS note_id, n.created_at, n.updated_at,
                nr.book_id, b.name AS book_name, nr.chapter
         FROM notes n
         LEFT JOIN note_references nr ON nr.note_id = n.id
         LEFT JOIN books b ON b.id = nr.book_id
         WHERE n.user_id = ?
           AND ((n.created_at >= ? AND n.created_at < ?)
             OR (n.updated_at >= ? AND n.updated_at < ?))`,
        [userId, windowStart, windowEnd, windowStart, windowEnd],
    );
    return bucketNoteDays(rows, { from, to, loggingBegan, timeZone });
}

async function findReadingHistory(userId, { from, to, timeZone }) {
    const loggingBegan = await findLoggingBegan(userId);
    const hasEarlyDays = loggingBegan === null || from < loggingBegan;
    const noteDays = hasEarlyDays
        ? await findNoteDays(userId, { from, to, loggingBegan, timeZone })
        : [];
    const loggedDays = await findLoggedDays(userId, from, to);
    return { from, to, loggingBegan, days: [...noteDays, ...loggedDays] };
}

module.exports = { findReadingHistory, bucketNoteDays };
