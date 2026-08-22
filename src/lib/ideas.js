// Reads and writes against the `ideas` table.
//
// Same rule as src/lib/notes.js: every function takes `userId` first and puts
// it in the WHERE clause, so an idea belonging to someone else answers exactly
// like one that never existed.
//
// This module only ever reads the `ideas` table. Its counterpart in
// src/lib/topics.js only ever reads `topics`. Neither requires the other —
// routes that need both tiers compose them — which is what keeps the two link
// directions from turning into a circular import.
const db = require('../db/db');
const { withFirstReferences } = require('./references');

const toIdea = (row, extras = {}) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...extras,
});

// Every idea the user has, with how many notes each one gathers.
//
// The count joins through to `notes` and re-checks user_id there. The link
// table cannot hold a cross-user row today, but the count is what the
// management UI shows and a wrong one would be invisible — so it is proven by
// the query rather than by an argument about who could have written the link.
const findIdeas = async (userId) => {
    const [rows] = await db.execute(
        `SELECT i.id, i.title, i.body, i.sort_order, i.created_at, i.updated_at,
                COUNT(DISTINCT ni.note_id) AS note_count
         FROM ideas i
         LEFT JOIN note_ideas ni ON ni.idea_id = i.id
         LEFT JOIN notes n ON n.id = ni.note_id AND n.user_id = i.user_id
         WHERE i.user_id = ?
         GROUP BY i.id, i.title, i.body, i.sort_order, i.created_at, i.updated_at
         ORDER BY i.sort_order, i.id`,
        [userId]
    );

    return rows.map(row => toIdea(row, { noteCount: Number(row.note_count) }));
};

// One idea, carrying the same note count the list does. A write returns the
// row it wrote, and a payload that dropped the count would blank it in the UI
// until the next full reload — so the count is part of an idea everywhere, not
// a property of the list endpoint.
const findIdeaById = async (userId, ideaId) => {
    const [rows] = await db.execute(
        `SELECT i.id, i.title, i.body, i.sort_order, i.created_at, i.updated_at,
                (SELECT COUNT(*)
                 FROM note_ideas ni
                 JOIN notes n ON n.id = ni.note_id
                 WHERE ni.idea_id = i.id AND n.user_id = i.user_id) AS note_count
         FROM ideas i
         WHERE i.id = ? AND i.user_id = ?`,
        [ideaId, userId]
    );

    return rows.length === 0
        ? null
        : toIdea(rows[0], { noteCount: Number(rows[0].note_count) });
};

// How many notes an idea gathers, as a correlated subquery. Written once here
// because three reads need it — the list, the single idea, and the tree's two
// idea-bearing branches — and a count that differed between them would be a
// number nobody could check.
const NOTE_COUNT_SUBQUERY = `(SELECT COUNT(*)
                 FROM note_ideas ni
                 JOIN notes n ON n.id = ni.note_id
                 WHERE ni.idea_id = i.id AND n.user_id = i.user_id)`;

// The ideas filed under one topic, in the order idea_topics.sort_order holds —
// which is what the Topic page's drag-to-reorder writes, and what the note
// editor's multi-select set before that.
//
// This is the tree's second level, so each idea carries its note count: the row
// has to say whether expanding it will show anything before it is expanded.
const findIdeasForTopic = async (userId, topicId) => {
    const [rows] = await db.execute(
        `SELECT i.id, i.title, i.body, i.sort_order, i.created_at, i.updated_at,
                ${NOTE_COUNT_SUBQUERY} AS note_count
         FROM idea_topics it
         JOIN ideas i ON i.id = it.idea_id
         WHERE it.topic_id = ? AND i.user_id = ?
         ORDER BY it.sort_order, i.id`,
        [topicId, userId]
    );

    return rows.map(row => toIdea(row, { noteCount: Number(row.note_count) }));
};

// The plan's unfiled query, one tier up from the unfiled notes it shows beside:
// every idea with no row in idea_topics at all. They are legal rows, and this
// is the only place in the app that reaches them — an idea under no topic
// appears nowhere in the tree proper.
const findUnfiledIdeas = async (userId) => {
    const [rows] = await db.execute(
        `SELECT i.id, i.title, i.body, i.sort_order, i.created_at, i.updated_at,
                ${NOTE_COUNT_SUBQUERY} AS note_count
         FROM ideas i
         LEFT JOIN idea_topics it ON it.idea_id = i.id
         WHERE it.idea_id IS NULL AND i.user_id = ?
         ORDER BY i.sort_order, i.id`,
        [userId]
    );

    return rows.map(row => toIdea(row, { noteCount: Number(row.note_count) }));
};

// Every idea linked to any of `noteIds`, flat, for hydrating a notes payload.
// One query for the whole page rather than one per note: the notes panel loads
// a chapter's worth at a time and the editor needs the link set the moment it
// opens, exactly as it needs the reference set.
const findIdeasForNotes = async (userId, noteIds) => {
    if (noteIds.length === 0) {
        return [];
    }

    const placeholders = noteIds.map(() => '?').join(', ');
    const [rows] = await db.execute(
        `SELECT ni.note_id, ni.sort_order, i.id, i.title
         FROM note_ideas ni
         JOIN ideas i ON i.id = ni.idea_id
         JOIN notes n ON n.id = ni.note_id
         WHERE ni.note_id IN (${placeholders})
           AND i.user_id = ?
           AND n.user_id = ?
         ORDER BY ni.note_id, ni.sort_order, i.id`,
        [...noteIds, userId, userId]
    );

    return rows.map(row => ({
        noteId: row.note_id,
        id: row.id,
        title: row.title,
        sortOrder: row.sort_order,
    }));
};

// The notes filed under one idea — the tree's third and last level, ordered by
// note_ideas.sort_order.
//
// Titles and one anchor each, and deliberately no bodies: the Analyze page is
// where a note is read in context, and this list exists to get you there. The
// anchor is the note's canonically first reference, which is the position the
// row's link opens Analyze at; a note with none has `firstReference: null` and
// is reached through Analyze's unreferenced list instead.
const findNotesForIdea = async (userId, ideaId) => {
    const [rows] = await db.execute(
        `SELECT n.id, n.title, ni.sort_order
         FROM note_ideas ni
         JOIN notes n ON n.id = ni.note_id
         WHERE ni.idea_id = ? AND n.user_id = ?
         ORDER BY ni.sort_order, n.id`,
        [ideaId, userId]
    );

    return withFirstReferences(userId, rows.map(row => ({
        id: row.id,
        title: row.title,
        sortOrder: row.sort_order,
    })));
};

// Appends to the end of the user's list. sort_order is server-derived so two
// clients creating ideas concurrently cannot collide on a value either picked.
const insertIdea = async (userId, { title, body }) => {
    const [orderRows] = await db.execute(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM ideas WHERE user_id = ?',
        [userId]
    );

    const [result] = await db.execute(
        'INSERT INTO ideas (user_id, title, body, sort_order) VALUES (?, ?, ?, ?)',
        [userId, title, body, Number(orderRows[0].next_order)]
    );

    return result.insertId;
};

// Writes only the fields the patch named. False means the idea does not exist
// or is not the caller's — indistinguishable by design.
const updateIdea = async (userId, ideaId, changes) => {
    const fields = Object.keys(changes);
    const assignments = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => changes[field]);

    const [result] = await db.execute(
        `UPDATE ideas SET ${assignments} WHERE id = ? AND user_id = ?`,
        [...values, ideaId, userId]
    );

    // affectedRows, not changedRows: re-saving an unchanged idea is a success,
    // not a 404 for a row that plainly exists.
    return result.affectedRows > 0;
};

// Its rows in note_ideas and idea_topics go with it via ON DELETE CASCADE. The
// notes it gathered survive, unlinked — an orphan note is a legal state.
const removeIdea = async (userId, ideaId) => {
    const [result] = await db.execute(
        'DELETE FROM ideas WHERE id = ? AND user_id = ?',
        [ideaId, userId]
    );

    return result.affectedRows > 0;
};

module.exports = {
    toIdea,
    // Exported for the one reader outside this module that needs an idea to
    // carry the same note count the lists here do: src/lib/chapterIdeas.js,
    // which selects from `ideas` under the same `i` alias this subquery assumes.
    NOTE_COUNT_SUBQUERY,
    findIdeas,
    findIdeaById,
    findIdeasForTopic,
    findUnfiledIdeas,
    findIdeasForNotes,
    findNotesForIdea,
    insertIdea,
    updateIdea,
    removeIdea,
};
