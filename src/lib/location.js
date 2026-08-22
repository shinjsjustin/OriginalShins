// Reads and writes the saved Analyze location on the `admin` row.
//
// A *location* is the whole of what the Analyze page needs to reopen where it
// was left: two passage positions — `primary`, the centre panel under study,
// and `compare`, the one read against it — plus the note the editor was on.
// It is exactly the page's three query params in object form, which is not a
// coincidence: the URL is the page's state, and this is that state parked
// between visits.
//
// It lives in columns on `admin` rather than in a table of its own because
// there is precisely one per user, with no history and nothing to order. See
// src/db/migrations/006_reading_location.sql.
const db = require('../db/db');

// A position is its two numbers or it is nothing. Half a pair — a book with no
// chapter — is not a position that can be pointed at, so it reads as absent
// rather than as a partial answer the page would have to finish guessing.
// Nothing this module writes can produce a half pair; this is what makes a row
// edited by hand harmless.
const toPosition = (bookId, chapter) =>
    (bookId === null || chapter === null) ? null : { bookId, chapter };

const toLocation = (row) => ({
    primary: toPosition(row.last_primary_book_id, row.last_primary_chapter),
    compare: toPosition(row.last_compare_book_id, row.last_compare_chapter),
    noteId: row.last_note_id,
});

// The caller's saved location, or null if there is no such user.
//
// A user who has never saved one is not null — it is a location whose every
// field is null, which is a real answer meaning "start where the page starts".
// The two cases are different and the route distinguishes them.
const findLocation = async (userId) => {
    const [rows] = await db.execute(
        `SELECT last_primary_book_id, last_primary_chapter,
                last_compare_book_id, last_compare_chapter, last_note_id
         FROM admin WHERE id = ?`,
        [userId]
    );

    return rows.length === 0 ? null : toLocation(rows[0]);
};

// Replaces the saved location whole.
//
// Every field is written on every call, including the nulls, because this is a
// snapshot of where one page currently is and not a patch. Closing the editor
// has to be able to clear `last_note_id`, and a partial update idiom would make
// "no note" indistinguishable from "don't touch the note".
//
// Returns whether a row was matched, so the route can answer 404 for a token
// naming a user who has since been deleted.
const saveLocation = async (userId, { primary, compare, noteId }) => {
    const [result] = await db.execute(
        `UPDATE admin
         SET last_primary_book_id = ?, last_primary_chapter = ?,
             last_compare_book_id = ?, last_compare_chapter = ?,
             last_note_id = ?
         WHERE id = ?`,
        [
            primary ? primary.bookId : null,
            primary ? primary.chapter : null,
            compare ? compare.bookId : null,
            compare ? compare.chapter : null,
            noteId,
            userId,
        ]
    );

    return result.affectedRows > 0;
};

// Called by DELETE /api/notes/:id, next to the pin cleanup and for the same
// reason: reads are already safe without it — a saved id naming a note that is
// gone simply opens no editor — so this only stops a later note that inherits
// the id from inheriting the pointer too. Cleanup, not correctness.
//
// Guarded on the id as well as the user so that deleting some *other* note
// cannot clear a place the reader is still using.
const clearSavedNote = async (userId, noteId) => {
    const [result] = await db.execute(
        'UPDATE admin SET last_note_id = NULL WHERE id = ? AND last_note_id = ?',
        [userId, noteId]
    );

    return result.affectedRows > 0;
};

module.exports = {
    toPosition,
    toLocation,
    findLocation,
    saveLocation,
    clearSavedNote,
};
