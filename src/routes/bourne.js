const express = require('express');
const { findCurrentPassage } = require('../lib/location');

// Bourne's read API. GET-only by construction: the read key must never reach a
// write route, so every other method is refused at the end of this router.
const createBourneRouter = (deps = {}) => {
    const read = { findCurrentPassage, ...deps };
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

    // Later phases add GET routes above this.
    router.all('*', (req, res, next) => {
        if (req.method === 'GET') return next();
        res.set('Allow', 'GET');
        res.status(405).json({ error: 'Method not allowed' });
    });

    return router;
};

module.exports = { createBourneRouter };
