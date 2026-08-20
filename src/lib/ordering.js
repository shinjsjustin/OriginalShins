// Ordering and re-parenting for the Topic page's tree.
//
// Two operations live here, and both write a link table's `sort_order`:
//
//   reorderMembers — the full ordered id list for one container, exactly the
//                    way src/lib/links.js takes the full membership
//   moveMember     — one member leaves one container and joins another, in a
//                    single transaction: the old row is deleted and the new one
//                    inserted, never patched in place
//
// ── On the word "container" ─────────────────────────────────────────────────
//
// src/lib/links.js calls the side holding the multi-select the PARENT: for
// note_ideas that is the *note*, because a note's editor picks its ideas. The
// tree reads the same table the other way round — an idea gathers notes — so
// the two modules would disagree about which column is the parent.
//
// They therefore do not share a vocabulary. Here the CONTAINER is the tier
// above (a topic holds ideas; an idea holds notes) and the MEMBER is the tier
// below. Nothing in this file says "parent".
const db = require('../db/db');

// Frozen table and column names, interpolated into SQL. They must never come
// from a request: every caller names one of these two specs and only ids are
// ever bound as parameters.
const TREE_SPECS = Object.freeze({
    ideasInTopic: Object.freeze({
        table: 'idea_topics',
        containerTable: 'topics',
        memberTable: 'ideas',
        containerColumn: 'topic_id',
        memberColumn: 'idea_id',
    }),
    notesInIdea: Object.freeze({
        table: 'note_ideas',
        containerTable: 'ideas',
        memberTable: 'notes',
        containerColumn: 'idea_id',
        memberColumn: 'note_id',
    }),
});

// How a caller distinguishes the ways a write can be refused. A container or
// member that is not the caller's is a 404 — indistinguishable from one that
// never existed — and a member list that does not match what the container
// actually holds is a 409, because the client is ordering a set it no longer
// has.
const MISSING_CONTAINER = 'missing-container';
const MISSING_MEMBER = 'missing-member';
const STALE_MEMBERSHIP = 'stale-membership';
const NOTHING_TO_MOVE = 'nothing-to-move';

const ownsRow = async (connection, table, userId, id) => {
    const [rows] = await connection.execute(
        `SELECT id FROM ${table} WHERE id = ? AND user_id = ?`,
        [id, userId]
    );
    return rows.length > 0;
};

// Writes each id's array position into sort_order with one statement rather
// than one per row. Generic over the table because the same renumbering serves
// both link tables and `topics` itself, which is ordered by a column on the row
// instead of by a link.
//
// `spec.table`, `spec.idColumn` and `spec.scopeColumn` are frozen identifiers
// from this module or from src/lib/topics.js; `ids` and `scopeValue` are bound.
const applyOrder = async (connection, spec, scopeValue, ids) => {
    if (ids.length === 0) {
        return;
    }

    const cases = ids.map(() => 'WHEN ? THEN ?').join(' ');
    const placeholders = ids.map(() => '?').join(', ');
    const caseParams = ids.flatMap((id, index) => [id, index]);

    await connection.execute(
        `UPDATE ${spec.table}
            SET sort_order = CASE ${spec.idColumn} ${cases} END
          WHERE ${spec.scopeColumn} = ?
            AND ${spec.idColumn} IN (${placeholders})`,
        [...caseParams, scopeValue, ...ids]
    );
};

// The order spec for a link table: rows are identified by the member column and
// scoped to one container.
const orderSpecFor = (spec) => ({
    table: spec.table,
    idColumn: spec.memberColumn,
    scopeColumn: spec.containerColumn,
});

// What a container currently holds, in its stored order.
//
// The join to the member table re-checks user_id: a link whose member is not
// the caller's is left out rather than silently renumbered, the same rule the
// count queries in topics.js follow.
const findMemberIds = async (connection, spec, userId, containerId) => {
    const [rows] = await connection.execute(
        `SELECT l.${spec.memberColumn} AS member_id
         FROM ${spec.table} l
         JOIN ${spec.memberTable} m ON m.id = l.${spec.memberColumn} AND m.user_id = ?
         WHERE l.${spec.containerColumn} = ?
         ORDER BY l.sort_order, l.${spec.memberColumn}`,
        [userId, containerId]
    );

    return rows.map(row => Number(row.member_id));
};

const isSameSet = (left, right) =>
    left.length === right.length && left.every(id => right.includes(id));

// Rewrites one container's ordering from the complete ordered id list.
//
// The list must name exactly what the container holds. A partial list would let
// a client that had not seen a recent write renumber half a set and leave the
// rest interleaved at stale positions, which is worse than refusing: the client
// reloads the branch and tries again.
const reorderMembers = async (connection, spec, userId, containerId, memberIds) => {
    if (!await ownsRow(connection, spec.containerTable, userId, containerId)) {
        return { error: MISSING_CONTAINER };
    }

    const current = await findMemberIds(connection, spec, userId, containerId);
    if (!isSameSet(current, memberIds)) {
        return { error: STALE_MEMBERSHIP };
    }

    await applyOrder(connection, orderSpecFor(spec), containerId, memberIds);
    return { ordered: memberIds.length };
};

// Moves one member out of `fromContainerId` and into `toContainerId` at
// `position`, deleting the old link row and inserting a new one — a link row's
// container is half its primary key, so there is nothing to patch.
//
// Either side may be null, and that is what makes the unfiled buckets work:
//
//   from null   — the member was unfiled and is now filed
//   to null     — the member's last link is dropped and it becomes unfiled
//   both null   — nothing to do, and a request that means nothing
//
// `position` is an index into the destination's membership; null appends. The
// destination is renumbered densely afterwards so its sort_order stays a plain
// 0..n-1 run, exactly as reorderMembers leaves it.
const moveMember = async (connection, spec, userId, memberId, move) => {
    const { fromContainerId, toContainerId, position } = move;

    if (fromContainerId === null && toContainerId === null) {
        return { error: NOTHING_TO_MOVE };
    }
    if (!await ownsRow(connection, spec.memberTable, userId, memberId)) {
        return { error: MISSING_MEMBER };
    }

    const containerIds = [fromContainerId, toContainerId].filter(id => id !== null);
    for (const containerId of containerIds) {
        if (!await ownsRow(connection, spec.containerTable, userId, containerId)) {
            return { error: MISSING_CONTAINER };
        }
    }

    if (fromContainerId !== null) {
        await connection.execute(
            `DELETE FROM ${spec.table}
             WHERE ${spec.containerColumn} = ? AND ${spec.memberColumn} = ?`,
            [fromContainerId, memberId]
        );
    }

    if (toContainerId === null) {
        return { filed: false };
    }

    // Read the destination after the delete, so moving between two containers
    // and moving within one produce the same list to splice into.
    const existing = (await findMemberIds(connection, spec, userId, toContainerId))
        .filter(id => id !== memberId);

    const slot = position === null
        ? existing.length
        : Math.max(0, Math.min(position, existing.length));

    const ordered = [...existing.slice(0, slot), memberId, ...existing.slice(slot)];

    // ON DUPLICATE KEY covers the member already being in the destination —
    // dragging a note from one of its two ideas onto the other. applyOrder then
    // gives every row in the destination its final position.
    await connection.execute(
        `INSERT INTO ${spec.table} (${spec.containerColumn}, ${spec.memberColumn}, sort_order)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order)`,
        [toContainerId, memberId, slot]
    );

    await applyOrder(connection, orderSpecFor(spec), toContainerId, ordered);
    return { filed: true, position: slot };
};

// Runs `operation` inside one transaction on a pooled connection, rolling back
// on any failure and always releasing. Every write in this module changes more
// than one row, so none of them may be left half-applied.
const inTransaction = async (operation) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();
        const result = await operation(connection);
        await connection.commit();
        return result;
    } catch (err) {
        await connection.rollback().catch(() => {
            // The original error is what the caller needs; a rollback that
            // fails on an already-broken connection would only mask it.
        });
        throw err;
    } finally {
        connection.release();
    }
};

module.exports = {
    TREE_SPECS,
    isSameSet,
    MISSING_CONTAINER,
    MISSING_MEMBER,
    STALE_MEMBERSHIP,
    NOTHING_TO_MOVE,
    applyOrder,
    findMemberIds,
    reorderMembers,
    moveMember,
    inTransaction,
};
