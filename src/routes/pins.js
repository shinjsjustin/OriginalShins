const express = require('express');

const { parseCreatePin, parseUnpinItems } = require('../lib/pinInput');
const {
    findPins,
    ownsItem,
    insertPin,
    removePins,
    removeAllPins,
} = require('../lib/pins');

const router = express.Router();

// Mounted behind isAuth. A pin is a user saying "keep this where I can edit
// it": the Thoughts page's right-docked panel shows exactly the pinned set and
// is the only editing surface in the app, so these four endpoints are what
// decide which topics, ideas and notes are editable at all.
//
// Per-item endpoints rather than a full-set PUT, because the widget driving
// them is a per-card pin toggle. The full-set idiom lives where the widget is a
// multi-select — the link tables — and copying it here would make one pin click
// send the whole pinned set back.

// GET /api/pins
// The panel's whole payload: every pin with the title of the thing it points
// at, in pin order. A pin whose item has been deleted since is not an error and
// is not a row with a blank title — the hydrating joins simply do not produce
// it. See src/lib/pins.js.
router.get('/', async (req, res) => {
    try {
        const pins = await findPins(req.user.id);
        res.status(200).json({ pins });
    } catch (err) {
        console.error('GET /api/pins error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/pins — { itemType, itemId }
//
// `pins` has no foreign key to the item, so the ownership check that a foreign
// key would have given us for free happens here, before the write. An item the
// caller does not own answers 404 and not 403: 403 would confirm that the id
// exists and belongs to somebody, which is precisely the fact a stranger has no
// business learning. Same rule as every other :id in this API.
//
// Re-pinning is a success, not a conflict — insertPin is idempotent, so a double
// click on the toggle leaves one pin and one 201.
router.post('/', async (req, res) => {
    const parsed = parseCreatePin(req.body);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    const { itemType, itemId } = parsed.value;

    try {
        const owned = await ownsItem(req.user.id, itemType, itemId);
        if (!owned) {
            return res.status(404).json({ error: 'Item not found' });
        }

        await insertPin(req.user.id, itemType, itemId);

        // The pointer that was written, not a hydrated pin: the caller just
        // clicked the card, so it already holds the title, and fetching one
        // back would be a second query to tell it what it told us.
        res.status(201).json({ pin: { itemType, itemId } });
    } catch (err) {
        console.error('POST /api/pins error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/pins/all
// The panel's Clear button. Declared before DELETE / only for readability —
// the two paths are distinct, so neither can shadow the other.
router.delete('/all', async (req, res) => {
    try {
        const removed = await removeAllPins(req.user.id);
        res.status(200).json({ removed });
    } catch (err) {
        console.error('DELETE /api/pins/all error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/pins — { items: [{ itemType, itemId }, ...] }
//
// Unpin-selected, and single-card unpin as a list of one. No ownership check:
// the delete is already scoped to the caller's user_id, so naming somebody
// else's pin removes nothing and reveals nothing. `removed` may therefore be
// lower than the number of items sent — including for the ordinary race where
// two tabs unpin the same card — and that is a success, not a 404.
router.delete('/', async (req, res) => {
    const parsed = parseUnpinItems(req.body);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    try {
        const removed = await removePins(req.user.id, parsed.value);
        res.status(200).json({ removed });
    } catch (err) {
        console.error('DELETE /api/pins error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
