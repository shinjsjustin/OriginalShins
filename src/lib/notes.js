// Reads and writes against the `notes` table.
//
// Every function takes `userId` as its first argument and puts it in the WHERE
// clause. There is no unscoped read here on purpose: a note id from a URL is
// user input, so "does this note exist?" and "does it belong to the caller?"
// are answered by the same query and never by two.
const db = require('../db/db');
const { findReferencesForNotes, withFirstReferences } = require('./references');
const { findIdeasForNotes } = require('./ideas');

const NOTE_COLUMNS = 'id, title, body, sort_order, created_at, updated_at';

const toNote = (row, references = [], ideas = []) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    references,
    ideas,
});

// Groups a flat list of note children by note id in one pass. Reference rows
// and idea link rows both carry `noteId`, so one grouper serves them both.
const groupByNoteId = (children) => children.reduce((acc, child) => ({
    ...acc,
    [child.noteId]: [...(acc[child.noteId] || []), child],
}), {});

// Hydrates rows with every anchor each note carries — not just the ones that
// overlapped the chapter being viewed — and with the ideas it is filed under.
// The editor shows both sets in full, so fetching a partial one would mean a
// second round trip the moment it opens. Two queries for the whole page, not
// two per note.
const hydrate = async (userId, rows) => {
    const noteIds = rows.map(row => row.id);

    const [references, ideas] = await Promise.all([
        findReferencesForNotes(userId, noteIds),
        findIdeasForNotes(userId, noteIds),
    ]);

    const referencesByNoteId = groupByNoteId(references);
    const ideasByNoteId = groupByNoteId(ideas);

    return rows.map(row => toNote(
        row,
        referencesByNoteId[row.id] || [],
        ideasByNoteId[row.id] || []
    ));
};

const findNoteById = async (userId, noteId) => {
    const [rows] = await db.execute(
        `SELECT ${NOTE_COLUMNS} FROM notes WHERE id = ? AND user_id = ?`,
        [noteId, userId]
    );

    if (rows.length === 0) {
        return null;
    }

    const [note] = await hydrate(userId, rows);
    return note;
};

// Fetches notes by id, returned in the order the ids were given. Callers derive
// that order from the overlap query, so the panel lists a chapter's notes in the
// order their anchors appear in the text rather than in id order.
const findNotesByIds = async (userId, noteIds) => {
    if (noteIds.length === 0) {
        return [];
    }

    const placeholders = noteIds.map(() => '?').join(', ');
    const [rows] = await db.execute(
        `SELECT ${NOTE_COLUMNS} FROM notes WHERE id IN (${placeholders}) AND user_id = ?`,
        [...noteIds, userId]
    );

    const notes = await hydrate(userId, rows);
    const byId = new Map(notes.map(note => [note.id, note]));
    return noteIds.map(id => byId.get(id)).filter(Boolean);
};

// Notes with no anchor at all. They are legal — the plan makes every
// relationship optional — and they are invisible in the scripture panels, so
// the notes panel is the only place they can be reached from.
const findUnreferencedNotes = async (userId) => {
    const [rows] = await db.execute(
        `SELECT n.id, n.title, n.body, n.sort_order, n.created_at, n.updated_at
         FROM notes n
         LEFT JOIN note_references nr ON nr.note_id = n.id
         WHERE nr.id IS NULL AND n.user_id = ?
         ORDER BY n.sort_order, n.id`,
        [userId]
    );

    // Hydrated like any other note. Its reference list comes back empty by
    // definition — that is what put it in this list — but it may well be filed
    // under ideas, and the editor opens on it from here.
    return hydrate(userId, rows);
};

// The plan's unfiled query: every note with no row in note_ideas at all.
//
// This is the Topic page's "Unfiled notes" bucket, and it is the only place an
// orphan note can be reached from that tree — a note under no idea hangs off no
// topic either, so nothing in the three levels above it would ever list it.
//
// Note that "unfiled" and "unreferenced" are different questions about the same
// table and neither implies the other: findUnreferencedNotes above asks which
// notes have no scripture anchor, this asks which have no idea. A note can be
// both, one, or neither.
//
// Deliberately not hydrated. A tree row shows a title and links to Analyze, so
// it carries the same compact shape the notes under an idea do rather than the
// editor's full reference and idea sets.
const findUnfiledNotes = async (userId) => {
    const [rows] = await db.execute(
        `SELECT n.id, n.title, n.sort_order
         FROM notes n
         LEFT JOIN note_ideas ni ON ni.note_id = n.id
         WHERE ni.note_id IS NULL AND n.user_id = ?
         ORDER BY n.sort_order, n.id`,
        [userId]
    );

    return withFirstReferences(userId, rows.map(row => ({
        id: row.id,
        title: row.title,
        sortOrder: row.sort_order,
    })));
};

// Appends to the end of the user's list. sort_order is server-derived so that
// two clients creating notes concurrently cannot collide on a value the client
// picked.
const insertNote = async (connection, userId, { title, body }) => {
    const [orderRows] = await connection.execute(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM notes WHERE user_id = ?',
        [userId]
    );

    const [result] = await connection.execute(
        'INSERT INTO notes (user_id, title, body, sort_order) VALUES (?, ?, ?, ?)',
        [userId, title, body, Number(orderRows[0].next_order)]
    );

    return result.insertId;
};

// Writes only the fields the patch named. Returns false when the note does not
// exist or belongs to someone else — the two are indistinguishable by design.
const updateNote = async (userId, noteId, changes) => {
    const fields = Object.keys(changes);
    const assignments = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => changes[field]);

    const [result] = await db.execute(
        `UPDATE notes SET ${assignments} WHERE id = ? AND user_id = ?`,
        [...values, noteId, userId]
    );

    // affectedRows counts every matched row, so re-saving an unchanged note
    // still reports success. changedRows would report a miss instead, which the
    // caller would surface as a 404 for a note that plainly exists.
    return result.affectedRows > 0;
};

// Child note_references rows go with it via ON DELETE CASCADE.
const removeNote = async (userId, noteId) => {
    const [result] = await db.execute(
        'DELETE FROM notes WHERE id = ? AND user_id = ?',
        [noteId, userId]
    );

    return result.affectedRows > 0;
};

// Ownership check for the routes that write a child row rather than the note.
const noteExistsForUser = async (userId, noteId) => {
    const [rows] = await db.execute(
        'SELECT id FROM notes WHERE id = ? AND user_id = ?',
        [noteId, userId]
    );
    return rows.length > 0;
};

module.exports = {
    toNote,
    findNoteById,
    findNotesByIds,
    findUnreferencedNotes,
    findUnfiledNotes,
    insertNote,
    updateNote,
    removeNote,
    noteExistsForUser,
};
