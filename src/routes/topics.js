const express = require('express');

const { parseRowId } = require('../lib/params');
const {
    parseCreateTopic,
    parseUpdateTopic,
    parseTopicOrder,
    parseTopicIdeaOrder,
} = require('../lib/topicInput');
const {
    findTopics,
    findTopicById,
    findNotesForTopics,
    insertTopic,
    updateTopic,
    removeTopic,
    reorderTopics,
    isDuplicateSlugError,
} = require('../lib/topics');
const { findIdeasForTopic } = require('../lib/ideas');
const { removePinsForItem } = require('../lib/pins');
const { TREE_SPECS, reorderMembers, inTransaction } = require('../lib/ordering');
const { respondToOrderingError } = require('./orderingErrors');

const router = express.Router();

// Mounted behind isAuth. The top tier: a topic gathers ideas, which gather
// notes, and every one of those links is optional in both directions.

// UNIQUE (user_id, slug) is enforced by the database, not by a read-then-write
// that two concurrent requests could both pass. Every write that can collide
// funnels through here so the 409 reads the same wherever it comes from.
const respondToWriteError = (res, err, context) => {
    if (isDuplicateSlugError(err)) {
        return res.status(409).json({ error: 'You already have a topic with that slug' });
    }

    console.error(`${context} error:`, err);
    return res.status(500).json({ error: 'Internal server error' });
};

// GET /api/topics
// Every topic with the size of what hangs beneath it, and the notes filed
// directly under it.
//
// The notes ride along on the list rather than being a request per card: the
// topics view draws every fan at once, so a per-topic endpoint would be one
// round trip per card on a view that opens cold. Two queries either way.
router.get('/', async (req, res) => {
    try {
        const topics = await findTopics(req.user.id);
        const notes = await findNotesForTopics(req.user.id, topics.map(topic => topic.id));

        const notesByTopicId = notes.reduce((byTopicId, note) => ({
            ...byTopicId,
            [note.topicId]: [...(byTopicId[note.topicId] || []), note],
        }), {});

        res.status(200).json({
            topics: topics.map(topic => ({
                ...topic,
                notes: notesByTopicId[topic.id] || [],
            })),
        });
    } catch (err) {
        console.error('GET /api/topics error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/topics/order — { topicIds: [...] }
//
// The root level of the Topic page's tree, reordered by dragging. Topics have
// no link row above them, so their position is topics.sort_order and the whole
// list is named at once — see src/lib/topics.js for why a partial list is
// refused rather than half-applied.
router.put('/order', async (req, res) => {
    const parsed = parseTopicOrder(req.body);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    try {
        const result = await inTransaction(
            connection => reorderTopics(connection, req.user.id, parsed.value)
        );
        if (result.error) {
            return respondToOrderingError(res, result.error, { container: 'Topic', member: 'Topic' });
        }

        res.status(200).json({ ordered: result.ordered });
    } catch (err) {
        console.error('PUT /api/topics/order error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/topics/:id — the topic with the ideas filed under it.
//
// The notes beneath those ideas are NOT nested here. The Topic page loads the
// tree a level at a time, so a note list on this payload would be fetched on
// every topic click and displayed on almost none of them.
router.get('/:id', async (req, res) => {
    const topicId = parseRowId(req.params.id);
    if (topicId === null) {
        return res.status(400).json({ error: 'id must be a positive integer' });
    }

    try {
        const topic = await findTopicById(req.user.id, topicId);
        if (!topic) {
            return res.status(404).json({ error: 'Topic not found' });
        }

        const ideas = await findIdeasForTopic(req.user.id, topicId);
        res.status(200).json({ topic: { ...topic, ideas } });
    } catch (err) {
        console.error(`GET /api/topics/${req.params.id} error:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/topics — { name, slug?, description? }
// The name is required because the slug is derived from it; the client sends
// the slug it generated and the server derives it again regardless.
router.post('/', async (req, res) => {
    const parsed = parseCreateTopic(req.body);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    try {
        const topicId = await insertTopic(req.user.id, parsed.value);
        const topic = await findTopicById(req.user.id, topicId);

        res.status(201).json({ topic });
    } catch (err) {
        return respondToWriteError(res, err, 'POST /api/topics');
    }
});

// PATCH /api/topics/:id — partial update of name, slug and/or description.
router.patch('/:id', async (req, res) => {
    const topicId = parseRowId(req.params.id);
    if (topicId === null) {
        return res.status(400).json({ error: 'id must be a positive integer' });
    }

    const parsed = parseUpdateTopic(req.body);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    try {
        const updated = await updateTopic(req.user.id, topicId, parsed.value);
        if (!updated) {
            return res.status(404).json({ error: 'Topic not found' });
        }

        const topic = await findTopicById(req.user.id, topicId);
        res.status(200).json({ topic });
    } catch (err) {
        return respondToWriteError(res, err, `PATCH /api/topics/${req.params.id}`);
    }
});

// DELETE /api/topics/:id
// Its rows in idea_topics go with it via cascade. The ideas it gathered survive
// as unfiled ideas — deleting a topic must never take an idea with it.
router.delete('/:id', async (req, res) => {
    const topicId = parseRowId(req.params.id);
    if (topicId === null) {
        return res.status(400).json({ error: 'id must be a positive integer' });
    }

    try {
        const removed = await removeTopic(req.user.id, topicId);
        if (!removed) {
            return res.status(404).json({ error: 'Topic not found' });
        }

        // Deliberately a second statement after the delete, NOT one transaction
        // with it. A pin carries no foreign key to its item, so the window
        // between these two lines cannot produce a wrong answer: findPins
        // hydrates every pin through a join to the item's own table, and a pin
        // pointing at a topic that no longer exists produces no joined row and
        // so is already invisible to every reader. This call only stops dead
        // rows accumulating — cleanup, not correctness. Please don't "fix" it
        // into a transaction; there is no bug here to fix.
        await removePinsForItem(req.user.id, 'topic', topicId);

        res.status(204).end();
    } catch (err) {
        console.error(`DELETE /api/topics/${req.params.id} error:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/topics/:id/ideas/order — { ideaIds: [...] }
//
// Reorders the ideas filed under one topic by writing idea_topics.sort_order.
// It is scoped to this topic alone: an idea filed under two topics keeps its
// own position under each, which is the whole reason the order lives on the
// link row rather than on the idea.
router.put('/:id/ideas/order', async (req, res) => {
    const topicId = parseRowId(req.params.id);
    if (topicId === null) {
        return res.status(400).json({ error: 'id must be a positive integer' });
    }

    const parsed = parseTopicIdeaOrder(req.body);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    try {
        // Ownership of the topic and the membership check both happen inside
        // the transaction that renumbers, so nothing can be filed or unfiled
        // between reading the set and writing its order.
        const result = await inTransaction(connection => reorderMembers(
            connection,
            TREE_SPECS.ideasInTopic,
            req.user.id,
            topicId,
            parsed.value
        ));

        if (result.error) {
            return respondToOrderingError(res, result.error, { container: 'Topic', member: 'Idea' });
        }

        res.status(200).json({ ordered: result.ordered });
    } catch (err) {
        console.error(`PUT /api/topics/${req.params.id}/ideas/order error:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
