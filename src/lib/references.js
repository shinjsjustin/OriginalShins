// Everything that reads or writes `note_references`, in one place.
//
// Two invariants live here and nowhere else:
//
//   1. start_index / end_index are derived from the `verses` table, never from
//      the request. A client can name a verse range; it cannot name the integer
//      bounds that range maps to.
//   2. Every read is filtered by notes.user_id. note_references has no user_id
//      of its own, so ownership is always established by joining to `notes`.
const db = require('../db/db');

const REFERENCE_COLUMNS = `nr.id, nr.note_id, nr.book_id, nr.chapter,
    nr.start_verse, nr.end_verse, nr.start_index, nr.end_index, nr.sort_order`;

// Row -> API shape. One mapper so /api/chapter and /api/notes cannot drift.
const toReference = (row) => ({
    id: row.id,
    noteId: row.note_id,
    bookId: row.book_id,
    chapter: row.chapter,
    startVerse: row.start_verse,
    endVerse: row.end_verse,
    startIndex: row.start_index,
    endIndex: row.end_index,
    sortOrder: row.sort_order,
    ...(row.title === undefined ? {} : { noteTitle: row.title }),
});

// Resolves a verse range to the denormalized verse_index bounds stored on the
// reference row. Returns null when the range covers no verse that exists, which
// is the only way an otherwise well-formed reference can be rejected.
//
// It also snaps start_verse / end_verse to the verse numbers actually present.
// The WEB omits ~31 verses the KJV numbers (Acts 8:37, Matthew 17:21, ...), so
// a selection running 36..38 must be stored as 36..38 with the *indexes* of the
// verses that exist — never with a number pointing at a hole.
//
// `connection` lets a caller run this inside an open transaction; it defaults to
// the pool.
const resolveVerseRange = async ({ bookId, chapter, startVerse, endVerse }, connection = db) => {
    const [rows] = await connection.execute(
        `SELECT MIN(verse_index) AS start_index, MAX(verse_index) AS end_index,
                MIN(verse)       AS first_verse, MAX(verse)       AS last_verse,
                COUNT(*)         AS covered
         FROM verses
         WHERE book_id = ? AND chapter = ? AND verse BETWEEN ? AND ?`,
        [bookId, chapter, startVerse, endVerse]
    );

    const row = rows[0];
    if (!row || Number(row.covered) === 0) {
        return null;
    }

    return {
        bookId,
        chapter,
        startVerse: row.first_verse,
        endVerse: row.last_verse,
        startIndex: row.start_index,
        endIndex: row.end_index,
    };
};

// The plan's chapter-overlap query. A reference touches a chapter when its
// range and the chapter's range intersect at all — which is what makes a note
// anchored either side of a chapter boundary show up in both chapters.
const findReferencesOverlappingChapter = async (userId, chapterStartIndex, chapterEndIndex) => {
    const [rows] = await db.execute(
        `SELECT ${REFERENCE_COLUMNS}, n.title
         FROM note_references nr
         JOIN notes n ON n.id = nr.note_id
         WHERE nr.start_index <= ?
           AND nr.end_index   >= ?
           AND n.user_id = ?
         ORDER BY nr.start_index, nr.id`,
        [chapterEndIndex, chapterStartIndex, userId]
    );

    return rows.map(toReference);
};

// Every reference belonging to any of `noteIds`, for the note editor's list.
// Scoped by user_id even though the ids were themselves derived from a scoped
// query — a second filter costs nothing and removes a whole class of mistake.
const findReferencesForNotes = async (userId, noteIds) => {
    if (noteIds.length === 0) {
        return [];
    }

    const placeholders = noteIds.map(() => '?').join(', ');
    const [rows] = await db.execute(
        `SELECT ${REFERENCE_COLUMNS}
         FROM note_references nr
         JOIN notes n ON n.id = nr.note_id
         WHERE nr.note_id IN (${placeholders})
           AND n.user_id = ?
         ORDER BY nr.note_id, nr.sort_order, nr.start_index, nr.id`,
        [...noteIds, userId]
    );

    return rows.map(toReference);
};

// The single anchor a tree row links to: each note's canonically first
// reference, as { bookId, chapter }.
//
// The Topic page's note rows carry this instead of a full reference set. A row
// there is a link to the Analyze page, not a rendering of the note, so it needs
// one position and nothing else — and an idea can gather enough notes that
// shipping every anchor of every one of them would dwarf the rest of the
// payload.
//
// A note with no reference at all simply has no entry, which is a legal state:
// the tree links to /analyze without a position and the note is reachable there
// through the unreferenced list.
const findFirstReferencesForNotes = async (userId, noteIds) => {
    if (noteIds.length === 0) {
        return new Map();
    }

    const placeholders = noteIds.map(() => '?').join(', ');
    const [rows] = await db.execute(
        `SELECT nr.note_id, nr.book_id, nr.chapter
         FROM note_references nr
         JOIN notes n ON n.id = nr.note_id
         WHERE nr.note_id IN (${placeholders})
           AND n.user_id = ?
         ORDER BY nr.note_id, nr.start_index, nr.id`,
        [...noteIds, userId]
    );

    // Ordered by note then by position in the canon, so the first row seen for
    // a note is its earliest anchor. A note can hold several references tied on
    // start_index; the id breaks that tie so the answer is stable across calls.
    return rows.reduce((byNoteId, row) => (
        byNoteId.has(row.note_id)
            ? byNoteId
            : byNoteId.set(row.note_id, { bookId: row.book_id, chapter: row.chapter })
    ), new Map());
};

// Attaches that anchor to already-shaped tree rows. Lives here rather than in
// notes.js or ideas.js because both of them build such a list — the notes under
// one idea, and the unfiled notes — and neither should own the other's copy.
const withFirstReferences = async (userId, rows) => {
    const firstReferences = await findFirstReferencesForNotes(userId, rows.map(row => row.id));

    return rows.map(row => ({
        ...row,
        firstReference: firstReferences.get(row.id) || null,
    }));
};

// Inserts one anchor, computing its indexes from `verses` first. Returns null
// when the range names no existing verse. Runs on `connection` so note creation
// can insert the note and its first reference in a single transaction.
const insertReference = async (connection, noteId, range) => {
    const resolved = await resolveVerseRange(range, connection);
    if (!resolved) {
        return null;
    }

    // Anchors are appended in the order they were added; sort_order is derived
    // here rather than accepted from the client.
    const [orderRows] = await connection.execute(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM note_references WHERE note_id = ?',
        [noteId]
    );
    const sortOrder = Number(orderRows[0].next_order);

    const [result] = await connection.execute(
        `INSERT INTO note_references
            (note_id, book_id, chapter, start_verse, end_verse, start_index, end_index, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            noteId,
            resolved.bookId,
            resolved.chapter,
            resolved.startVerse,
            resolved.endVerse,
            resolved.startIndex,
            resolved.endIndex,
            sortOrder,
        ]
    );

    return { id: result.insertId, noteId, ...resolved, sortOrder };
};

// Multi-table delete so ownership is checked in the same statement that
// removes the row — there is no window between the check and the write.
const deleteReference = async (userId, referenceId) => {
    const [result] = await db.execute(
        `DELETE nr FROM note_references nr
         JOIN notes n ON n.id = nr.note_id
         WHERE nr.id = ? AND n.user_id = ?`,
        [referenceId, userId]
    );

    return result.affectedRows > 0;
};

module.exports = {
    toReference,
    resolveVerseRange,
    findReferencesOverlappingChapter,
    findReferencesForNotes,
    findFirstReferencesForNotes,
    withFirstReferences,
    insertReference,
    deleteReference,
};
