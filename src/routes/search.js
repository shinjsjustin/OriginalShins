const express = require('express');

const { parseSearchQuery } = require('../lib/searchInput');
const { searchAll, isMissingFulltextIndexError } = require('../lib/search');

const router = express.Router();

// Mounted behind isAuth. One endpoint, four groups.
//
// GET /api/search?q=
//
// Notes, ideas and topics are the caller's own rows, matched on title and body
// and scoped by user_id in the same statement — a row belonging to somebody
// else is not merely ranked lower, it is not read. Scripture is the shared
// reference text, matched with MATCH ... AGAINST against the FULLTEXT index
// migration 004 adds, and is the same for every account.
//
// The groups come back as four named arrays rather than one merged, ranked
// list. They are different kinds of thing that lead to different pages, and a
// single ordering would have to claim a verse and a topic are comparable.
router.get('/', async (req, res) => {
    // An empty or one-character q is a 400, never an unfiltered read: without
    // this the LIKE patterns become '%%', which matches every row the caller
    // has and the caps would quietly turn into the answer.
    const parsed = parseSearchQuery(req.query.q);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    try {
        const results = await searchAll(req.user.id, parsed.value);
        res.status(200).json({ query: parsed.value, ...results });
    } catch (err) {
        // A missing FULLTEXT index is a deployment that stopped after the code,
        // so it answers as one — 503 with the migration named in the log —
        // rather than as a 500 nobody can act on. Loud on purpose: degrading to
        // an empty scripture group would be indistinguishable from a search
        // that genuinely matched no verse.
        if (isMissingFulltextIndexError(err)) {
            console.error(
                'GET /api/search: verses.text has no FULLTEXT index. '
                + 'Apply src/db/migrations/004_search.sql.'
            );
            return res.status(503).json({ error: 'Scripture search is not available yet' });
        }

        console.error('GET /api/search error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
