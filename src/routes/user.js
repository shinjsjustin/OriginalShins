const express = require('express');
const db = require('../db/db');

const { parseLocation } = require('../lib/locationInput');
const { findLocation, saveLocation } = require('../lib/location');

const router = express.Router();

// GET /api/user/me
// Returns the profile of the currently authenticated user.
// req.user is populated by the isAuth middleware before this route runs.
router.get('/me', async (req, res) => {
    try {
        // TODO: Replace "admin" with your actual users table name
        // TODO: Adjust selected columns to match your schema
        const [rows] = await db.execute(
            'SELECT id, name, email, access_level FROM admin WHERE id = ?',
            [req.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.status(200).json(rows[0]);
    } catch (err) {
        console.error('GET /me error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── Where the Analyze page reopens ──────────────────────────────────────────
//
// The Analyze page keeps its state in its query string, which is what makes a
// link to a passage shareable — and what makes a bare /analyze blank. These two
// endpoints are the page's memory of itself: it reads one on arrival when the
// URL names nothing, and writes the other as the reader moves.
//
// They live on /api/user rather than under a mount of their own because a
// location is not a thing the user has, like a note or a pin. It is a property
// *of* the user, in the same row as their name, and there is exactly one.

// GET /api/user/location
// The saved location, or a location whose every field is null for a reader who
// has not been anywhere yet. That empty answer is a success and not a 404: the
// page asks this on every bare visit, and "you have no saved place" is the
// ordinary answer for a new account.
router.get('/location', async (req, res) => {
    try {
        const location = await findLocation(req.user.id);
        if (location === null) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.status(200).json({ location });
    } catch (err) {
        console.error('GET /api/user/location error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/user/location — { primary, compare, noteId }
//
// PUT and not PATCH: the body is a snapshot of where one page is right now, and
// every field is written including the nulls. Closing the note editor has to be
// able to clear the saved note, and a merge idiom would leave no way to say
// "there is no open note" that could be told apart from not mentioning it.
router.put('/location', async (req, res) => {
    const parsed = parseLocation(req.body);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    try {
        const saved = await saveLocation(req.user.id, parsed.value);
        if (!saved) {
            return res.status(404).json({ error: 'User not found' });
        }

        // The location as stored, so the client never has to guess what the
        // server made of what it sent.
        res.status(200).json({ location: parsed.value });
    } catch (err) {
        console.error('PUT /api/user/location error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// TODO: Add more protected user routes here following this same pattern:
//
//   router.get('/some-protected-resource', async (req, res) => {
//       const userId = req.user.id;  // always available after isAuth
//       ...
//   });

module.exports = router;
