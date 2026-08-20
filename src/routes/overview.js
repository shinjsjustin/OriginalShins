const express = require('express');

const { parseOverviewQuery } = require('../lib/overviewInput');
const { buildOverviewPayload, selectTiers } = require('../lib/overview');
const { readOverview, scopeKeyFor } = require('../lib/overviewCache');
const { ownsTopic } = require('../lib/topics');

const router = express.Router();

// The response changes the moment the reader writes a note, and it is scoped
// to one user. Caching happens server-side, where it can be invalidated; the
// browser must not hold a copy it has no way of being told is wrong.
const CACHE_CONTROL = 'private, no-store';

// GET /api/overview?tiers=notes,ideas,topics&topicId=3
//
// Every anchor point the Overview page plots, grouped by the thing it belongs
// to, as the compact arrays the plan specifies, plus what the page says about
// one when the reader points at it:
//
//   {
//     notes:      [ [noteId, [verseIndex, ...]], ... ],
//     noteLabels: [ [noteId, title, [[anchor, bookId, chapter, from, to], ...]], ... ],
//     ideas: …, ideaLabels: …, topics: …, topicLabels: …
//   }
//
// An anchor is the midpoint of one reference's verse_index range; a group's
// anchors are sorted and deduplicated. All of that is computed in
// src/lib/overview.js so the client does no arithmetic beyond turning a
// verse_index into a y.
//
// The three tiers are the same references grouped three ways — by note, by the
// ideas those notes are linked to, and by the topics those ideas are filed
// under — so one note appears on all three rails. That is the plan's table,
// and it is the picture: a passage lighting up on the topics rail as well as
// the notes rail is what says the two are connected.
//
// The label tiers are what the tooltip and the drawer read: an anchor is one
// integer and has no memory of the range it was the middle of, so "Romans
// 5:1–5" has to be shipped rather than derived. They are display data only —
// no BODY is here, and the drawer fetches the one thing it opens from
// GET /api/notes/:id, /api/ideas/:id or /api/topics/:id.
//
// ── The two params ─────────────────────────────────────────────────────────
//
// `tiers` names the rails to return, defaulting to all three. It is applied
// AFTER the cache rather than before it: the payload is built whole, so a
// reader toggling the topics rail off and on again is served from memory both
// times instead of re-running the widest join of the three on the way back.
//
// `topicId` restricts every tier to what falls under one topic — the plan's
// own answer to its open question 2, the cross-testament noise a topic like
// "Faith" produces when the whole canon is on one axis. It changes which rows
// are READ, so it is part of the cache key.
//
// A topicId naming a topic the caller does not own is a 404 rather than an
// empty diagram. Every join would simply match nothing, and "you have written
// nothing under this topic" and "this is not your topic" are answers a reader
// must not have to tell apart by squinting at an empty rail.
router.get('/', async (req, res) => {
    const parsed = parseOverviewQuery(req.query);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    const { tiers, topicId } = parsed.value;

    try {
        if (topicId !== null && !await ownsTopic(req.user.id, topicId)) {
            return res.status(404).json({ error: 'Topic not found' });
        }

        const payload = await readOverview(
            req.user.id,
            scopeKeyFor(topicId),
            () => buildOverviewPayload(req.user.id, topicId)
        );

        res.set('Cache-Control', CACHE_CONTROL);
        res.status(200).json(selectTiers(payload, tiers));
    } catch (err) {
        console.error('GET /api/overview error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
