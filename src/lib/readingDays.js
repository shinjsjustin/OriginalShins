// One row per user, local day, book and chapter opened. Re-opening the same
// chapter the same day only bumps last_opened_at. See 010_reading_days.sql.
const db = require('../db/db');

const recordReadingDay = async (userId, { readOn, bookId, chapter }) => {
    await db.execute(
        `INSERT INTO reading_days (user_id, read_on, book_id, chapter)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE last_opened_at = CURRENT_TIMESTAMP`,
        [userId, readOn, bookId, chapter]
    );
};

module.exports = { recordReadingDay };
