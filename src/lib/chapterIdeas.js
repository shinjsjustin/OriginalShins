// Reads and writes against the `chapter_ideas` table — the ideas a reader has
// imported into one chapter of the Analyze page.
//
// Same rule as src/lib/ideas.js: every function takes `userId` first and puts
// it in the WHERE clause, so a row belonging to someone else answers exactly
// like one that never existed. Unlike the link tables in src/lib/links.js this
// one can do that from a column of its own, because a book/chapter coordinate
// is not a row anybody owns and there is no parent to join through. See
// src/db/migrations/007_chapter_ideas.sql.
const db = require('../db/db');
const { toIdea, NOTE_COUNT_SUBQUERY } = require('./ideas');
const { MISSING_CHILD, ownsEveryRow } = require('./links');

// The table an idea id is checked against before it may be imported. A literal
// in this module and never a value from a request — it is interpolated into SQL
// by ownsEveryRow, exactly as the frozen LINK_SPECS names are.
const IDEA_TABLE = 'ideas';

// The ideas imported into one chapter, in the order chapter_ideas.sort_order
// holds — which is the order the panel's multi-select last saved.
//
// The columns, the note count and toIdea are the ones GET /api/ideas uses, so
// an idea read from here is the same object an idea read from there is. The
// route completes it with its topics through src/lib/ideaTopics.js, which is
// the other half of that shape.
const findChapterIdeas = async (userId, bookId, chapter) => {
    const [rows] = await db.execute(
        `SELECT i.id, i.title, i.body, i.sort_order, i.created_at, i.updated_at,
                ${NOTE_COUNT_SUBQUERY} AS note_count
         FROM chapter_ideas ci
         JOIN ideas i ON i.id = ci.idea_id
         WHERE ci.user_id = ? AND ci.book_id = ? AND ci.chapter = ? AND i.user_id = ?
         ORDER BY ci.sort_order, i.id`,
        [userId, bookId, chapter, userId]
    );

    return rows.map(row => toIdea(row, { noteCount: Number(row.note_count) }));
};

// Replaces the chapter's ENTIRE imported set with `ideaIds`, in the order given
// — the position in the array becomes sort_order, so the panel's order is the
// stored order. The same full-set replace as replaceLinks in src/lib/links.js,
// and refused the same way when an id names an idea that is not the caller's:
// such an id is rejected outright rather than quietly dropped, because a PUT
// that stores something other than what it was sent is a disagreement the
// client has no way to see.
//
// It cannot be replaceLinks itself. That function establishes ownership by
// finding a parent row carrying this user's id, and there is no such row here;
// what stands in for it is the user_id on every row this writes.
//
// An empty `ideaIds` is not a special case: it clears the chapter and inserts
// nothing, which is how the last imported idea is removed.
//
// Takes a connection rather than the pool because the delete and the inserts
// have to be one transaction — a half-applied set must never be visible.
const replaceChapterIdeas = async (connection, userId, bookId, chapter, ideaIds) => {
    if (!await ownsEveryRow(connection, IDEA_TABLE, userId, ideaIds)) {
        return { error: MISSING_CHILD };
    }

    await connection.execute(
        'DELETE FROM chapter_ideas WHERE user_id = ? AND book_id = ? AND chapter = ?',
        [userId, bookId, chapter]
    );

    if (ideaIds.length > 0) {
        const rows = ideaIds.map(() => '(?, ?, ?, ?, ?)').join(', ');
        const params = ideaIds.flatMap((ideaId, index) => [userId, bookId, chapter, ideaId, index]);

        await connection.execute(
            `INSERT INTO chapter_ideas (user_id, book_id, chapter, idea_id, sort_order)
             VALUES ${rows}`,
            params
        );
    }

    return { imported: ideaIds.length };
};

module.exports = {
    findChapterIdeas,
    replaceChapterIdeas,
};
