const express = require('express');
const { findCurrentPassage } = require('../lib/location');
const { findReadingHistory } = require('../lib/readingHistory');
const { findNotesForBourne } = require('../lib/bourneNotes');
const { parseHistoryQuery, parseNotesQuery } = require('../lib/bourneInput');
const { localDate, localDayStart, readingTimeZone } = require('../lib/readingDay');

// Bourne's read API. GET-only by construction: the read key must never reach a
// write route, so every other method is refused at the end of this router.
const createBourneRouter = (deps = {}) => {
    const read = { findCurrentPassage, findReadingHistory, findNotesForBourne, ...deps };
    const router = express.Router();

    router.get('/location', async (req, res) => {
        try {
            const location = await read.findCurrentPassage(req.user.id);
            res.status(200).json({ location });
        } catch (err) {
            console.error('GET /api/bourne/location failed:', err);
            res.status(500).json({ error: 'Could not read location' });
        }
    });

    router.get('/history', async (req, res) => {
        const timeZone = readingTimeZone();
        const parsed = parseHistoryQuery(req.query, localDate(new Date(), timeZone));
        if (parsed.error) return res.status(400).json({ error: parsed.error });
        try {
            const history = await read.findReadingHistory(req.user.id, { ...parsed.value, timeZone });
            res.status(200).json(history);
        } catch (err) {
            console.error('GET /api/bourne/history failed:', err);
            res.status(500).json({ error: 'Could not read history' });
        }
    });

    router.get('/notes', async (req, res) => {
        const parsed = parseNotesQuery(req.query);
        if (parsed.error) return res.status(400).json({ error: parsed.error });
        const { since, bookId, chapter, limit, offset } = parsed.value;
        const sinceInstant = since === null ? null : localDayStart(since, readingTimeZone());
        try {
            const { notes, hasMore } = await read.findNotesForBourne(req.user.id, { sinceInstant, bookId, chapter, limit, offset });
            res.status(200).json({ notes, hasMore, limit, offset });
        } catch (err) {
            console.error('GET /api/bourne/notes failed:', err);
            res.status(500).json({ error: 'Could not read notes' });
        }
    });

    // Later phases add GET routes above this.
    router.all('*', (req, res, next) => {
        if (req.method === 'GET') return next();
        res.set('Allow', 'GET');
        res.status(405).json({ error: 'Method not allowed' });
    });

    return router;
};

module.exports = { createBourneRouter };
