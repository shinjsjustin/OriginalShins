// Per-user API keys. Only a SHA-256 hash and a 4-char hint are stored; the
// secret is shown once at creation and cannot be recovered. See 011_scrolls.sql.
const crypto = require('crypto');
const db = require('../db/db');

const KEY_PREFIX = 'scr_';
const SECRET_BYTES = 32;
const HINT_LENGTH = 4;

const hashKey = (secret) => crypto.createHash('sha256').update(secret).digest('hex');

const generateKey = () => {
    const secret = KEY_PREFIX + crypto.randomBytes(SECRET_BYTES).toString('hex');
    return { secret, hash: hashKey(secret), hint: secret.slice(-HINT_LENGTH) };
};

const insertKey = async (userId, name, { hash, hint }) => {
    const [result] = await db.execute(
        'INSERT INTO api_keys (user_id, name, key_hash, hint) VALUES (?, ?, ?, ?)',
        [userId, name, hash, hint]
    );
    return result.insertId;
};

const listKeys = async (userId) => {
    const [rows] = await db.execute(
        `SELECT id, name, hint, created_at, last_used_at
         FROM api_keys
         WHERE user_id = ?
         ORDER BY created_at DESC, id DESC`,
        [userId]
    );
    return rows;
};

const deleteKey = async (userId, keyId) => {
    const [result] = await db.execute(
        'DELETE FROM api_keys WHERE id = ? AND user_id = ?',
        [keyId, userId]
    );
    return result.affectedRows > 0;
};

const findKeyOwner = async (secret) => {
    const [rows] = await db.execute(
        'SELECT id, user_id FROM api_keys WHERE key_hash = ?',
        [hashKey(secret)]
    );
    return rows.length === 0 ? null : { userId: rows[0].user_id, keyId: rows[0].id };
};

const touchKey = async (keyId) => {
    await db.execute(
        'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?',
        [keyId]
    );
};

module.exports = {
    generateKey,
    hashKey,
    insertKey,
    listKeys,
    deleteKey,
    findKeyOwner,
    touchKey,
};
