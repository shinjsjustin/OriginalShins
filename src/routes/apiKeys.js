const express = require('express');
const apiKeys = require('../lib/apiKeys');
const { parseKeyName } = require('../lib/apiKeyInput');
const { parseRowId } = require('../lib/params');

const toKey = (row) => ({
    id: row.id,
    name: row.name,
    hint: row.hint,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
});

// Key management for the logged-in user; mount behind isAuth. The secret is in
// the POST response only: nothing stored can reproduce it.
const createApiKeysRouter = (deps = {}) => {
    const { generateKey, insertKey, listKeys, deleteKey, parseName } = {
        generateKey: apiKeys.generateKey,
        insertKey: apiKeys.insertKey,
        listKeys: apiKeys.listKeys,
        deleteKey: apiKeys.deleteKey,
        parseName: parseKeyName,
        ...deps,
    };
    const router = express.Router();
    router.use(express.json());

    router.get('/', async (req, res) => {
        try {
            const rows = await listKeys(req.user.id);
            res.status(200).json({ keys: rows.map(toKey) });
        } catch (err) {
            console.error('GET /api/keys failed:', err);
            res.status(500).json({ error: 'Could not list keys' });
        }
    });

    router.post('/', async (req, res) => {
        const parsed = parseName(req.body);
        if (parsed.error) return res.status(400).json({ error: parsed.error });
        try {
            const generated = generateKey();
            const id = await insertKey(req.user.id, parsed.value, generated);
            const rows = await listKeys(req.user.id);
            const row = rows.find((r) => r.id === id);
            res.status(201).json({ key: toKey(row), secret: generated.secret });
        } catch (err) {
            console.error('POST /api/keys failed:', err);
            res.status(500).json({ error: 'Could not create key' });
        }
    });

    router.delete('/:id', async (req, res) => {
        const id = parseRowId(req.params.id);
        if (id === null) return res.status(400).json({ error: 'id must be a positive integer' });
        try {
            const removed = await deleteKey(req.user.id, id);
            if (!removed) return res.status(404).json({ error: 'Key not found' });
            res.status(204).end();
        } catch (err) {
            console.error('DELETE /api/keys/:id failed:', err);
            res.status(500).json({ error: 'Could not delete key' });
        }
    });

    return router;
};

module.exports = { createApiKeysRouter };
