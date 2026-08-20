// The three reads behind GET /api/overview: every note reference the Overview
// page plots, once per tier that groups it.
//
// ── One row shape, three groupings ─────────────────────────────────────────
//
// Each query returns the same columns — a `group_id`, the `title` that group
// prints as, and one note reference — and differs only in what the group is
// and how far the join walks to reach it:
//
//   notes   nr -> notes                                        group = note
//   ideas   nr -> notes -> note_ideas -> ideas                 group = idea
//   topics  nr -> notes -> note_ideas -> ideas -> idea_topics  group = topic
//
// That is the plan's table verbatim: a note's anchors are its own references,
// an idea's are the references of every note linked to it, and a topic's are
// the references of every note under every one of its ideas. One note
// therefore appears on all three rails — once as itself, once per idea, once
// per topic — which is the point of the picture and not a duplication to be
// removed.
//
// Because the shape is identical, src/lib/overview.js groups all three with
// one pair of functions and nothing downstream knows which tier it is holding.
//
// ── Why every one of them is DISTINCT ──────────────────────────────────────
//
// The joins fan out. A note filed under two of a topic's ideas is reached
// twice, so its references would arrive twice in that topic's group — the
// anchor set would absorb it, but the reference list a reader reads would
// print the same passage twice for a reason that has nothing to do with the
// passage. Selecting the reference's own id and DISTINCTing the row collapses
// the duplicate at the source, where it can be seen, rather than in a Set two
// modules later where it cannot.
//
// The same fan-out reaches the notes tier the moment `topicId` filters it,
// which is why that query is DISTINCT too rather than only the two below it.
//
// ── Ownership ─────────────────────────────────────────────────────────────
//
// Neither link table carries a user_id, so every join re-checks it against the
// tier that does — exactly as src/lib/topics.js does for its counts. A link
// row cannot cross users today; the check is what makes that a property of the
// query rather than of an argument about who could have written the row.
const db = require('../db/db');

// One note reference, as both tiers of the payload need it: the anchor is
// derived from the two indexes, the tooltip prints the book, chapter and verse
// range, and `reference_id` is what makes the DISTINCT above per-reference.
const REFERENCE_COLUMNS = `nr.id AS reference_id,
                nr.book_id, nr.chapter, nr.start_verse, nr.end_verse,
                nr.start_index, nr.end_index`;

// Canonical order within each group, then by the reference's own id so two
// references sharing a start_index come out in a fixed order. By the SELECT
// aliases rather than the underlying columns, which is what DISTINCT requires.
const ROW_ORDER = 'ORDER BY group_id, start_index, reference_id';

// The walk from a note up to the topics it sits under. Used only when the
// notes tier is being filtered: without `topicId` a note needs no idea and no
// topic to be drawn, and joining through them would silently drop every
// unfiled note from the rail it is the whole subject of.
const NOTE_TO_TOPIC = `JOIN note_ideas ni  ON ni.note_id = n.id
         JOIN ideas i        ON i.id = ni.idea_id AND i.user_id = n.user_id
         JOIN idea_topics it ON it.idea_id = i.id
         JOIN topics t       ON t.id = it.topic_id AND t.user_id = n.user_id`;

/** Every reference of every note the user owns, grouped by note. */
const findNoteRows = async (userId, topicId = null) => {
    // `topicId` is a parsed integer bound as a parameter; only the fixed SQL
    // in this file is ever interpolated.
    const isFiltered = topicId !== null;

    const [rows] = await db.execute(
        `SELECT DISTINCT nr.note_id AS group_id, n.title AS title, ${REFERENCE_COLUMNS}
         FROM note_references nr
         JOIN notes n ON n.id = nr.note_id
         ${isFiltered ? NOTE_TO_TOPIC : ''}
         WHERE n.user_id = ?${isFiltered ? ' AND t.id = ?' : ''}
         ${ROW_ORDER}`,
        isFiltered ? [userId, topicId] : [userId]
    );

    return rows;
};

/** The same references, grouped by the ideas the notes carrying them belong to. */
const findIdeaRows = async (userId, topicId = null) => {
    // The idea tier already reaches idea_topics to be filtered, so its scope
    // is one more join on a table it is standing next to rather than the whole
    // walk the notes tier needs.
    const isFiltered = topicId !== null;

    const [rows] = await db.execute(
        `SELECT DISTINCT i.id AS group_id, i.title AS title, ${REFERENCE_COLUMNS}
         FROM ideas i
         JOIN note_ideas ni      ON ni.idea_id = i.id
         JOIN notes n            ON n.id = ni.note_id AND n.user_id = i.user_id
         JOIN note_references nr ON nr.note_id = n.id
         ${isFiltered ? 'JOIN idea_topics it ON it.idea_id = i.id' : ''}
         WHERE i.user_id = ?${isFiltered ? ' AND it.topic_id = ?' : ''}
         ${ROW_ORDER}`,
        isFiltered ? [userId, topicId] : [userId]
    );

    return rows;
};

/** The same references again, grouped by topic, two link tables further up. */
const findTopicRows = async (userId, topicId = null) => {
    const isFiltered = topicId !== null;

    const [rows] = await db.execute(
        `SELECT DISTINCT t.id AS group_id, t.name AS title, ${REFERENCE_COLUMNS}
         FROM topics t
         JOIN idea_topics it     ON it.topic_id = t.id
         JOIN ideas i            ON i.id = it.idea_id AND i.user_id = t.user_id
         JOIN note_ideas ni      ON ni.idea_id = i.id
         JOIN notes n            ON n.id = ni.note_id AND n.user_id = t.user_id
         JOIN note_references nr ON nr.note_id = n.id
         WHERE t.user_id = ?${isFiltered ? ' AND t.id = ?' : ''}
         ${ROW_ORDER}`,
        isFiltered ? [userId, topicId] : [userId]
    );

    return rows;
};

// Keyed by tier so the payload builder loops rather than naming each one, and
// so a tier the request did not ask for costs no query at all.
const ROW_FINDERS = Object.freeze({
    notes: findNoteRows,
    ideas: findIdeaRows,
    topics: findTopicRows,
});

module.exports = {
    ROW_FINDERS,
    findNoteRows,
    findIdeaRows,
    findTopicRows,
};
