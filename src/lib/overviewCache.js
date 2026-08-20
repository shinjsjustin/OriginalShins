// The Overview page's payload cache.
//
// ── Why anything is cached ─────────────────────────────────────────────────
//
// /api/overview is the one endpoint that reads a user's ENTIRE corpus: every
// reference of every note, and from 6d every idea and topic above them, which
// is the same references again through two more link tables. That is three
// table scans the Analyze page never asks for, answering a question whose
// answer only changes when the reader writes something. So it is computed once
// and held until a write makes it wrong.
//
// In memory, per process. The plan's audience is a single user, so a Redis or
// a table would be machinery for a Map. If this ever runs on more than one
// process, the store below is the only thing that has to change — the two
// functions it exports are already the whole contract.
//
// ── Why an entry is per SCOPE and not per request ──────────────────────────
//
// 6d gives the endpoint a query string: `?tiers=` picks rails and `?topicId=`
// restricts every rail to one topic. Only one of those changes what has to be
// READ. The tiers are a selection from a payload that was built whole, so they
// are applied in the route and never reach this cache — otherwise turning a
// rail off and on again would rebuild the two that never moved. `topicId` is a
// different set of rows, so it is a different entry.
//
// The scope key is therefore the topic filter alone, and the number of entries
// a user can hold is bounded by the number of topics they have written plus
// one. An invalidation drops all of them: a write to any of the six tables can
// change what falls under any topic.
//
// ── Why an entry carries a version ─────────────────────────────────────────
//
// A rebuild is asynchronous, so a write can land in the middle of one:
//
//   read  → cache miss → SELECT ... ─────────────────┐
//   write →                 INSERT, commit, invalidate│
//   read  →                                      ← rows from BEFORE the insert
//
// Storing those rows would cache a payload that was already stale, and it
// would stay stale until the next write — the exact failure the invalidation
// exists to prevent. The version is bumped by every invalidation, so a
// rebuild that started before one simply declines to store its result.
//
// ── Who invalidates ────────────────────────────────────────────────────────
//
// src/middleware/invalidateOverview.js, mounted on every router that can write
// notes, note_references, note_ideas, idea_topics, ideas or topics. No handler
// calls this directly; see that file for why.

// userId -> { version, payloads: Map<scopeKey, payload> }. The inner map is
// empty when there is nothing cached, which is both the initial state and what
// an invalidation leaves.
const cache = new Map();

const emptyEntry = () => ({ version: 0, payloads: new Map() });

const entryFor = (userId) => cache.get(userId) || emptyEntry();

/**
 * The cache key for one topic scope. Null — the whole corpus — is named rather
 * than left as an empty string so a key is never ambiguous with a missing one.
 */
const scopeKeyFor = (topicId) => (topicId === null || topicId === undefined
    ? 'all'
    : `topic:${topicId}`);

/**
 * The cached payload for `userId` in `scope`, building it with `build` on a
 * miss.
 *
 * `build` is a function rather than a value so a hit costs no query at all,
 * and it is passed in rather than imported so this module knows nothing about
 * what an overview payload contains.
 */
const readOverview = async (userId, scope, build) => {
    const before = entryFor(userId);
    const cached = before.payloads.get(scope);
    if (cached) {
        return cached;
    }

    const payload = await build();

    // Only store it if no write happened while the query was running. If one
    // did, this payload predates it and the next read rebuilds instead.
    const after = entryFor(userId);
    if (after.version === before.version) {
        cache.set(userId, {
            version: after.version,
            // A new Map rather than a mutation of the one on the entry: the
            // entry a caller is holding must not change under it.
            payloads: new Map(after.payloads).set(scope, payload),
        });
    }

    return payload;
};

/** Drops every scope one user has cached. The next read rebuilds. */
const invalidateOverview = (userId) => {
    const current = entryFor(userId);
    cache.set(userId, { version: current.version + 1, payloads: new Map() });
};

/** Drops everything. For tests and for the verification script. */
const clearOverviewCache = () => {
    cache.clear();
};

module.exports = { scopeKeyFor, readOverview, invalidateOverview, clearOverviewCache };
