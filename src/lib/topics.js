// Reads and writes against the `topics` table.
//
// Scoped by user_id like everything else, and — like src/lib/ideas.js — it
// reads exactly one table, so the two tiers never require each other.
const db = require('../db/db');
const { applyOrder, isSameSet, STALE_MEMBERSHIP } = require('./ordering');
const { withFirstReferences } = require('./references');

const toTopic = (row, extras = {}) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...extras,
});

// The list endpoint's payload: every topic with the size of what hangs beneath
// it, two tiers down.
//
// The note count walks topic -> idea -> note and counts DISTINCT notes, so a
// note reached through three of the topic's ideas counts once. Both counts are
// taken from the ownership joins (i.id, n.id) rather than from the link columns
// (it.idea_id, ni.note_id): a link row whose target failed the user_id check
// leaves the joined row NULL and is therefore not counted, instead of inflating
// a number nobody would think to question.
const findTopics = async (userId) => {
    const [rows] = await db.execute(
        `SELECT t.id, t.name, t.slug, t.description, t.sort_order, t.created_at, t.updated_at,
                COUNT(DISTINCT i.id) AS idea_count,
                COUNT(DISTINCT n.id) AS note_count
         FROM topics t
         LEFT JOIN idea_topics it ON it.topic_id = t.id
         LEFT JOIN ideas i        ON i.id = it.idea_id AND i.user_id = t.user_id
         LEFT JOIN note_ideas ni  ON ni.idea_id = i.id
         LEFT JOIN notes n        ON n.id = ni.note_id AND n.user_id = t.user_id
         WHERE t.user_id = ?
         GROUP BY t.id, t.name, t.slug, t.description, t.sort_order, t.created_at, t.updated_at
         ORDER BY t.sort_order, t.id`,
        [userId]
    );

    return rows.map(row => toTopic(row, {
        ideaCount: Number(row.idea_count),
        noteCount: Number(row.note_count),
    }));
};

// One topic, carrying the same two counts the list does. A write returns the
// row it wrote, and a payload that dropped the counts would blank them in the
// UI until the next full reload — so they are part of a topic everywhere, not
// a property of the list endpoint. Subqueries rather than the list's join
// chain, because for a single row there is no fan-out to collapse.
const findTopicById = async (userId, topicId) => {
    const [rows] = await db.execute(
        `SELECT t.id, t.name, t.slug, t.description, t.sort_order, t.created_at, t.updated_at,
                (SELECT COUNT(*)
                 FROM idea_topics it
                 JOIN ideas i ON i.id = it.idea_id AND i.user_id = t.user_id
                 WHERE it.topic_id = t.id) AS idea_count,
                (SELECT COUNT(DISTINCT ni.note_id)
                 FROM idea_topics it
                 JOIN ideas i      ON i.id = it.idea_id AND i.user_id = t.user_id
                 JOIN note_ideas ni ON ni.idea_id = i.id
                 JOIN notes n      ON n.id = ni.note_id AND n.user_id = t.user_id
                 WHERE it.topic_id = t.id) AS note_count
         FROM topics t
         WHERE t.id = ? AND t.user_id = ?`,
        [topicId, userId]
    );

    return rows.length === 0 ? null : toTopic(rows[0], {
        ideaCount: Number(rows[0].idea_count),
        noteCount: Number(rows[0].note_count),
    });
};

// Every topic linked to any of `ideaIds`, flat, for hydrating an ideas payload
// in one query rather than one per idea.
const findTopicsForIdeas = async (userId, ideaIds) => {
    if (ideaIds.length === 0) {
        return [];
    }

    const placeholders = ideaIds.map(() => '?').join(', ');
    const [rows] = await db.execute(
        `SELECT it.idea_id, it.sort_order, t.id, t.name, t.slug
         FROM idea_topics it
         JOIN topics t ON t.id = it.topic_id
         JOIN ideas i  ON i.id = it.idea_id
         WHERE it.idea_id IN (${placeholders})
           AND t.user_id = ?
           AND i.user_id = ?
         ORDER BY it.idea_id, it.sort_order, t.id`,
        [...ideaIds, userId, userId]
    );

    return rows.map(row => ({
        ideaId: row.idea_id,
        id: row.id,
        name: row.name,
        slug: row.slug,
        sortOrder: row.sort_order,
    }));
};

// Every topic linked DIRECTLY to any of `noteIds`, flat, for hydrating a notes
// payload in one query rather than one per note.
//
// The mirror of findTopicsForIdeas above, one tier further down. It reads
// note_topics alone: a topic a note reaches through an idea is not returned
// here, because the two paths mean different things and the note's own set is
// the one the editor replaces.
const findTopicsForNotes = async (userId, noteIds) => {
    if (noteIds.length === 0) {
        return [];
    }

    const placeholders = noteIds.map(() => '?').join(', ');
    const [rows] = await db.execute(
        `SELECT nt.note_id, nt.sort_order, t.id, t.name, t.slug
         FROM note_topics nt
         JOIN topics t ON t.id = nt.topic_id
         JOIN notes n  ON n.id = nt.note_id
         WHERE nt.note_id IN (${placeholders})
           AND t.user_id = ?
           AND n.user_id = ?
         ORDER BY nt.note_id, nt.sort_order, t.id`,
        [...noteIds, userId, userId]
    );

    return rows.map(row => ({
        noteId: row.note_id,
        id: row.id,
        name: row.name,
        slug: row.slug,
        sortOrder: row.sort_order,
    }));
};

// Every note filed directly under any of `topicIds`, flat and tagged with the
// topic that reached it.
//
// Batched across topics rather than one call per topic, because the topics view
// draws every card's fan at once — one query for the whole field, the same way
// findTopicsForIdeas hydrates a whole ideas payload.
//
// The body comes back with it: the fan's note card shows a clamped body, and
// the alternative is the 1+N round trips the idea view pays. `withFirstReferences`
// attaches the anchor each card labels itself with.
const findNotesForTopics = async (userId, topicIds) => {
    if (topicIds.length === 0) {
        return [];
    }

    const placeholders = topicIds.map(() => '?').join(', ');
    const [rows] = await db.execute(
        `SELECT nt.topic_id, nt.sort_order, n.id, n.title, n.body
         FROM note_topics nt
         JOIN notes n  ON n.id = nt.note_id
         JOIN topics t ON t.id = nt.topic_id
         WHERE nt.topic_id IN (${placeholders})
           AND n.user_id = ?
           AND t.user_id = ?
         ORDER BY nt.topic_id, nt.sort_order, n.id`,
        [...topicIds, userId, userId]
    );

    return withFirstReferences(userId, rows.map(row => ({
        topicId: row.topic_id,
        id: row.id,
        title: row.title,
        body: row.body,
        sortOrder: row.sort_order,
    })));
};

const insertTopic = async (userId, { name, slug, description }) => {
    const [orderRows] = await db.execute(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM topics WHERE user_id = ?',
        [userId]
    );

    const [result] = await db.execute(
        'INSERT INTO topics (user_id, name, slug, description, sort_order) VALUES (?, ?, ?, ?, ?)',
        [userId, name, slug, description, Number(orderRows[0].next_order)]
    );

    return result.insertId;
};

const updateTopic = async (userId, topicId, changes) => {
    const fields = Object.keys(changes);
    const assignments = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => changes[field]);

    const [result] = await db.execute(
        `UPDATE topics SET ${assignments} WHERE id = ? AND user_id = ?`,
        [...values, topicId, userId]
    );

    return result.affectedRows > 0;
};

// Its rows in idea_topics go with it via ON DELETE CASCADE. The ideas it
// gathered survive as unfiled ideas, which is a legal state.
const removeTopic = async (userId, topicId) => {
    const [result] = await db.execute(
        'DELETE FROM topics WHERE id = ? AND user_id = ?',
        [topicId, userId]
    );

    return result.affectedRows > 0;
};

// How `topics` itself is ordered. Unlike the tiers below it a topic has no
// link row — it sits at the root of the tree — so its position lives in a
// column on its own row, and the scope of an ordering is the user.
const TOPIC_ORDER_SPEC = Object.freeze({
    table: 'topics',
    idColumn: 'id',
    scopeColumn: 'user_id',
});

// Rewrites the root ordering from the complete ordered id list.
//
// The list must name every topic the user has, for the same reason a link
// table's does: renumbering a subset would leave the topics left out of it
// interleaved at stale positions. A list that has fallen behind is refused so
// the client reloads and sends one that has not.
//
// Runs on a caller-supplied `connection` rather than the pool, so the check and
// the renumbering are one transaction — exactly as the two link-table orderings
// in src/lib/ordering.js are, and for the same reason: a topic created between
// the two statements would otherwise keep whatever sort_order it was given
// while every other topic was renumbered around it.
const reorderTopics = async (connection, userId, topicIds) => {
    const [rows] = await connection.execute(
        'SELECT id FROM topics WHERE user_id = ?',
        [userId]
    );
    const current = rows.map(row => Number(row.id));

    if (!isSameSet(current, topicIds)) {
        return { error: STALE_MEMBERSHIP };
    }

    await applyOrder(connection, TOPIC_ORDER_SPEC, userId, topicIds);
    return { ordered: topicIds.length };
};

// Whether the user owns a topic, and nothing else about it.
//
// findTopicById answers this too, but it pays for two correlated count
// subqueries to do it, and the caller here — the Overview page's ?topicId=
// filter — needs no counts and asks on every request including the ones its
// cache answers. So the cheapest possible form of the question gets its own
// query rather than a count being computed and thrown away.
const ownsTopic = async (userId, topicId) => {
    const [rows] = await db.execute(
        'SELECT id FROM topics WHERE id = ? AND user_id = ?',
        [topicId, userId]
    );

    return rows.length > 0;
};

// UNIQUE (user_id, slug) is enforced by the database rather than by a read
// followed by a write, which two concurrent requests could both pass. The
// driver's error code is translated here so routes never match on a string.
const isDuplicateSlugError = (err) => err && err.code === 'ER_DUP_ENTRY';

module.exports = {
    toTopic,
    findTopics,
    findTopicById,
    ownsTopic,
    findTopicsForIdeas,
    findTopicsForNotes,
    findNotesForTopics,
    insertTopic,
    updateTopic,
    removeTopic,
    reorderTopics,
    isDuplicateSlugError,
};
