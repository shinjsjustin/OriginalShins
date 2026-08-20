const { invalidateOverview } = require('../lib/overviewCache');

// Drops a user's cached Overview payload after any successful write.
//
// ── Why this is middleware and not a call in each handler ──────────────────
//
// The cache covers six tables — notes, note_references, note_ideas,
// idea_topics, ideas, topics — and they are written by roughly fifteen
// handlers spread over four routers. Adding a line to each of them would make
// the correctness of the whole page depend on nobody ever forgetting that
// line, including in 6c and 6d when the ideas and topics tiers give those same
// writes something further to invalidate.
//
// Mounting this on the routers instead makes forgetting impossible: every
// write to those tables goes through one of the four mounts in server.js, so a
// handler added later is covered the day it is written.
//
// ── Why it runs on `finish` rather than before the handler ─────────────────
//
// Invalidating on the way in would leave a window where the write has not
// committed yet but the cache is already empty — a read arriving in that
// window would rebuild from the OLD data and cache it, and the page would be
// wrong until the next write. On the way out, the row is committed before the
// entry is dropped. (A rebuild that started before the write and finishes
// after it is caught separately, by the version check in lib/overviewCache.js.)
//
// ── Why only 2xx and 3xx ───────────────────────────────────────────────────
//
// A 400 or a 404 wrote nothing. Dropping the payload for those would rebuild
// the same bytes at the cost of a full scan, on exactly the requests most
// likely to be repeated.

// Methods that cannot write. Everything else is treated as a write, so a verb
// added to a router later fails safe: at worst it costs one rebuild.
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const LOWEST_SUCCESS_STATUS = 200;
const LOWEST_ERROR_STATUS = 400;

const invalidatesOverview = (req, res, next) => {
    // Mounted after isAuth, so req.user is populated. The guard is here
    // because a cache keyed by `undefined` would be a cache shared by
    // everybody, and that is worth being unable to express.
    const userId = req.user?.id;

    if (userId === undefined || READ_METHODS.has(req.method)) {
        return next();
    }

    res.on('finish', () => {
        if (res.statusCode >= LOWEST_SUCCESS_STATUS && res.statusCode < LOWEST_ERROR_STATUS) {
            invalidateOverview(userId);
        }
    });

    next();
};

module.exports = invalidatesOverview;
