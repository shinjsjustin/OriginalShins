const express = require('express');

const { parseRowId } = require('../lib/params');
const { deleteReference } = require('../lib/references');

const router = express.Router();

// A note reference is addressed by its own id at the top level rather than
// nested under its note, so this is a router of its own rather than another
// handler on /api/notes.

// DELETE /api/references/:id
// Removes one anchor. The note itself survives — losing its last reference just
// makes it a standalone note again, which is a legal state.
router.delete('/:id', async (req, res) => {
    const referenceId = parseRowId(req.params.id);
    if (referenceId === null) {
        return res.status(400).json({ error: 'id must be a positive integer' });
    }

    try {
        // note_references carries no user_id of its own; ownership is proven by
        // joining to notes inside the same statement that removes the row.
        const removed = await deleteReference(req.user.id, referenceId);
        if (!removed) {
            return res.status(404).json({ error: 'Reference not found' });
        }

        res.status(204).end();
    } catch (err) {
        console.error(`DELETE /api/references/${req.params.id} error:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
