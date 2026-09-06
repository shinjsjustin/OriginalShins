// The three link tables — note_ideas, idea_topics and note_topics — write
// identically, so they are written once here.
//
// A link set is REPLACED, never added to or removed from one row at a time. The
// UI is a multi-select, and PUT-the-whole-set is the shape that matches it:
// there is no sequence of add/remove calls that can leave the server holding a
// membership the widget never showed. The clear and the inserts run in one
// transaction so a half-applied set is never visible.
//
// Ownership is checked inside that same transaction, against the parent and
// every child, because neither link table carries a user_id of its own.

// Frozen table and column names. These are interpolated into SQL, so they must
// never come from a request — every caller picks one of these specs by
// name and the ids alone are bound as parameters.
const LINK_SPECS = Object.freeze({
    noteIdeas: Object.freeze({
        table: 'note_ideas',
        parentTable: 'notes',
        childTable: 'ideas',
        parentColumn: 'note_id',
        childColumn: 'idea_id',
    }),
    ideaTopics: Object.freeze({
        table: 'idea_topics',
        parentTable: 'ideas',
        childTable: 'topics',
        parentColumn: 'idea_id',
        childColumn: 'topic_id',
    }),
    noteTopics: Object.freeze({
        table: 'note_topics',
        parentTable: 'notes',
        childTable: 'topics',
        parentColumn: 'note_id',
        childColumn: 'topic_id',
    }),
});

// How the caller distinguishes the two ways a replace can be refused: a parent
// that is not the caller's is a 404 (indistinguishable from one that never
// existed), a child that is not is a 400 (the request named something real to
// someone else).
const MISSING_PARENT = 'missing-parent';
const MISSING_CHILD = 'missing-child';

const ownsRow = async (connection, table, userId, id) => {
    const [rows] = await connection.execute(
        `SELECT id FROM ${table} WHERE id = ? AND user_id = ?`,
        [id, userId]
    );
    return rows.length > 0;
};

// One query for the whole child set rather than one per id. A count short of
// the set size means at least one id names a row that does not exist or
// belongs to someone else — which are the same answer on purpose.
const ownsEveryRow = async (connection, table, userId, ids) => {
    if (ids.length === 0) {
        return true;
    }

    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await connection.execute(
        `SELECT COUNT(*) AS owned FROM ${table} WHERE id IN (${placeholders}) AND user_id = ?`,
        [...ids, userId]
    );

    return Number(rows[0].owned) === ids.length;
};

// Replaces the parent's entire link set with `childIds`, in the order given —
// the position in the array becomes sort_order, so the multi-select's order is
// the stored order.
//
// An empty `childIds` is not a special case: it clears every link and inserts
// none, leaving an orphan, which the plan makes a legal state everywhere.
//
// Returns { linked } on success, or { error } naming which side was refused.
const replaceLinks = async (connection, spec, userId, parentId, childIds) => {
    if (!await ownsRow(connection, spec.parentTable, userId, parentId)) {
        return { error: MISSING_PARENT };
    }
    if (!await ownsEveryRow(connection, spec.childTable, userId, childIds)) {
        return { error: MISSING_CHILD };
    }

    await connection.execute(
        `DELETE FROM ${spec.table} WHERE ${spec.parentColumn} = ?`,
        [parentId]
    );

    if (childIds.length > 0) {
        const rows = childIds.map(() => '(?, ?, ?)').join(', ');
        const params = childIds.flatMap((childId, index) => [parentId, childId, index]);

        await connection.execute(
            `INSERT INTO ${spec.table} (${spec.parentColumn}, ${spec.childColumn}, sort_order)
             VALUES ${rows}`,
            params
        );
    }

    return { linked: childIds.length };
};

module.exports = {
    LINK_SPECS,
    MISSING_PARENT,
    MISSING_CHILD,
    ownsRow,
    ownsEveryRow,
    replaceLinks,
};
