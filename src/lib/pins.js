// Reads and writes against the `pins` table.
//
// Scoped by user_id like everything else: a pin belonging to someone else — or
// on an item belonging to someone else — answers exactly like one that never
// existed.
//
// Unlike src/lib/topics.js this module reads more than one table, and it has to:
// a pin is a polymorphic reference, so the only way to turn one into something
// displayable is to join the table its item_type names. What it does NOT do is
// require the tier modules — it reaches `topics`, `ideas` and `notes` through
// SQL of its own rather than through src/lib/topics.js and friends, so the pin
// tier hangs off the three content tiers without any of them knowing it exists.
const db = require('../db/db');

const toPin = (row, extras = {}) => ({
    itemType: row.item_type,
    itemId: row.item_id,
    createdAt: row.created_at,
    ...extras,
});

// Where each item_type's row and its display title live.
//
// A table name cannot be a placeholder in a prepared statement, so the only
// safe way to build a query around item_type is to look the name up in a map
// the code owns. Validation upstream rejects anything outside these three keys;
// this map is the second gate, and the reason no caller-supplied string ever
// reaches a query as SQL rather than as a parameter.
const ITEM_SOURCES = Object.freeze({
    topic: { table: 'topics', titleColumn: 'name' },
    idea: { table: 'ideas', titleColumn: 'title' },
    note: { table: 'notes', titleColumn: 'title' },
});

const ITEM_TYPES = Object.freeze(Object.keys(ITEM_SOURCES));

// The panel's whole payload: every pin, hydrated with the title of the thing it
// points at, oldest first.
//
// One UNION ALL branch per item_type rather than three round trips, because the
// panel renders the three kinds as one list and would otherwise have to wait on
// all three anyway. Each branch joins on `user_id = p.user_id` as well as on the
// id: that join condition is what stands in for the missing foreign key, so a
// pin whose item was deleted, or whose item is not the caller's, drops out of
// the result instead of appearing as a row with a blank title.
//
// ORDER BY applies to the union as a whole — the branches are the three places
// a title can come from, not three separate sections of the list — so the
// result is in pin order regardless of which tier each row came from.
const findPins = async (userId) => {
    const [rows] = await db.execute(
        `SELECT p.item_type, p.item_id, t.name AS title, p.created_at
         FROM pins p
         JOIN topics t ON t.id = p.item_id AND t.user_id = p.user_id
         WHERE p.user_id = ? AND p.item_type = 'topic'
         UNION ALL
         SELECT p.item_type, p.item_id, i.title AS title, p.created_at
         FROM pins p
         JOIN ideas i ON i.id = p.item_id AND i.user_id = p.user_id
         WHERE p.user_id = ? AND p.item_type = 'idea'
         UNION ALL
         SELECT p.item_type, p.item_id, n.title AS title, p.created_at
         FROM pins p
         JOIN notes n ON n.id = p.item_id AND n.user_id = p.user_id
         WHERE p.user_id = ? AND p.item_type = 'note'
         ORDER BY created_at, item_id`,
        [userId, userId, userId]
    );

    return rows.map(row => toPin(row, { title: row.title }));
};

// Whether the user owns the item a pin would point at.
//
// The pins table cannot answer this — it has no foreign key to the item — so
// the route asks here before writing, and treats "not owned" as "not found".
// This is the same cheapest-possible-form query as ownsTopic in
// src/lib/topics.js, generalized over the three tiers.
const ownsItem = async (userId, itemType, itemId) => {
    const source = ITEM_SOURCES[itemType];
    if (!source) {
        return false;
    }

    const [rows] = await db.execute(
        `SELECT id FROM ${source.table} WHERE id = ? AND user_id = ?`,
        [itemId, userId]
    );

    return rows.length > 0;
};

// Pinning is idempotent: the card's pin button is a toggle, and a double click,
// a retried request or two tabs doing the same thing must all leave the user
// with one pin and a success. INSERT IGNORE turns the primary key collision
// that expresses "already pinned" into a no-op rather than an ER_DUP_ENTRY the
// route would have to translate back into success.
const insertPin = async (userId, itemType, itemId) => {
    await db.execute(
        'INSERT IGNORE INTO pins (user_id, item_type, item_id) VALUES (?, ?, ?)',
        [userId, itemType, itemId]
    );
};

// Unpins the listed items. One statement rather than one per item, because the
// panel's Unpin-selected action clears a whole selection at once and a partial
// failure halfway through a loop would leave the panel disagreeing with the
// server.
//
// Pairs are matched as (item_type, item_id) together: pin 7 as an idea and pin
// 7 as a note are different rows, so the two columns have to be tested as a
// pair rather than as two independent IN lists.
const removePins = async (userId, items) => {
    if (items.length === 0) {
        return 0;
    }

    const conditions = items.map(() => '(item_type = ? AND item_id = ?)').join(' OR ');
    const values = items.flatMap(item => [item.itemType, item.itemId]);

    const [result] = await db.execute(
        `DELETE FROM pins WHERE user_id = ? AND (${conditions})`,
        [userId, ...values]
    );

    return result.affectedRows;
};

// The panel's Clear button. Its own statement rather than removePins over the
// current list, so nothing pinned between the read and the delete survives.
const removeAllPins = async (userId) => {
    const [result] = await db.execute(
        'DELETE FROM pins WHERE user_id = ?',
        [userId]
    );

    return result.affectedRows;
};

// Called by the topic/idea/note DELETE routes. Reads are safe without it —
// findPins' joins already hide a pin whose item is gone — so this is
// housekeeping rather than a correctness requirement: it stops dead rows
// accumulating, and stops a later item that reuses the id from inheriting a pin
// nobody placed on it.
const removePinsForItem = async (userId, itemType, itemId) => {
    const [result] = await db.execute(
        'DELETE FROM pins WHERE user_id = ? AND item_type = ? AND item_id = ?',
        [userId, itemType, itemId]
    );

    return result.affectedRows;
};

module.exports = {
    ITEM_TYPES,
    toPin,
    findPins,
    ownsItem,
    insertPin,
    removePins,
    removeAllPins,
    removePinsForItem,
};
