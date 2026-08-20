const express = require('express');
const db = require('../db/db');

const { parseRowId } = require('../lib/params');
const {
    parseCreateIdea,
    parseUpdateIdea,
    parseIdeaTopics,
    parseIdeaNoteOrder,
    parseIdeaMove,
} = require('../lib/ideaInput');
const {
    findIdeas,
    findIdeaById,
    findUnfiledIdeas,
    findNotesForIdea,
    insertIdea,
    updateIdea,
    removeIdea,
} = require('../lib/ideas');
const { removePinsForItem } = require('../lib/pins');
const { findTopicsForIdeas } = require('../lib/topics');
const { LINK_SPECS, MISSING_PARENT, replaceLinks } = require('../lib/links');
const { TREE_SPECS, reorderMembers, moveMember, inTransaction } = require('../lib/ordering');
const { respondToOrderingError } = require('./orderingErrors');

const router = express.Router();

// Mounted behind isAuth, so req.user is always populated and every handler
// takes its user id from the token rather than from the request.
//
// The ideas tier sits between notes and topics. Every relationship it takes
// part in is optional: an idea with no topics and no notes is a legal row, and
// nothing here refuses to create, read or save one.

// Attaches each idea's topics from a single flat query rather than one per
// idea. The lib modules read one table each, so composing the two tiers is the
// route's job — which is also what keeps them from requiring each other.
const withTopics = async (userId, ideas) => {
    const links = await findTopicsForIdeas(userId, ideas.map(idea => idea.id));

    const byIdeaId = links.reduce((acc, link) => ({
        ...acc,
        [link.ideaId]: [...(acc[link.ideaId] || []), { id: link.id, name: link.name, slug: link.slug }],
    }), {});

    return ideas.map(idea => ({ ...idea, topics: byIdeaId[idea.id] || [] }));
};

// GET /api/ideas
// Every idea the user has, each with its topics and how many notes it gathers.
// This is what the note editor's multi-select and the management list both
// read, so it carries enough to render either without a second request.
router.get('/', async (req, res) => {
    try {
        const ideas = await withTopics(req.user.id, await findIdeas(req.user.id));
        res.status(200).json({ ideas });
    } catch (err) {
        console.error('GET /api/ideas error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/ideas/unfiled
//
// The plan's second unfiled query: every idea with no row in idea_topics. It is
// the Topic page's "Unfiled ideas" bucket, and without it an idea filed under
// no topic would be unreachable from that page — it hangs off nothing the tree
// walks down from.
//
// A dedicated path rather than a flag on GET /api/ideas, because the two answer
// different questions: the list endpoint serves the management page and the
// note editor's multi-select, and both of them want every idea. Declared above
// GET /:id so the literal segment is matched before the id pattern.
router.get('/unfiled', async (req, res) => {
    try {
        // No topics are attached: having none is what put these here.
        const ideas = await findUnfiledIdeas(req.user.id);
        res.status(200).json({ ideas: ideas.map(idea => ({ ...idea, topics: [] })) });
    } catch (err) {
        console.error('GET /api/ideas/unfiled error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/ideas/:id — the idea with its linked topics and notes.
//
// This is also the Topic page's third-level lazy load: expanding an idea in the
// tree reads its notes from here rather than from an endpoint of its own. The
// notes it carries are compact rows — a title and the one anchor a tree row
// links to — because a tree row is a way to reach a note, not a rendering of
// one. See findNotesForIdea in src/lib/ideas.js.
router.get('/:id', async (req, res) => {
    const ideaId = parseRowId(req.params.id);
    if (ideaId === null) {
        return res.status(400).json({ error: 'id must be a positive integer' });
    }

    try {
        const idea = await findIdeaById(req.user.id, ideaId);
        if (!idea) {
            return res.status(404).json({ error: 'Idea not found' });
        }

        const [[withItsTopics], notes] = await Promise.all([
            withTopics(req.user.id, [idea]),
            findNotesForIdea(req.user.id, ideaId),
        ]);

        res.status(200).json({ idea: { ...withItsTopics, notes } });
    } catch (err) {
        console.error(`GET /api/ideas/${req.params.id} error:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/ideas — { title?, body? }
// Both optional, exactly as for a note: the management UI creates an idea and
// lets you fill it in, and topics are linked afterwards by PUT /:id/topics.
router.post('/', async (req, res) => {
    const parsed = parseCreateIdea(req.body);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    try {
        const ideaId = await insertIdea(req.user.id, parsed.value);
        const idea = await findIdeaById(req.user.id, ideaId);

        // A brand-new idea has no links yet, so there is nothing to look up.
        res.status(201).json({ idea: { ...idea, topics: [] } });
    } catch (err) {
        console.error('POST /api/ideas error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PATCH /api/ideas/:id — partial update of title and/or body.
router.patch('/:id', async (req, res) => {
    const ideaId = parseRowId(req.params.id);
    if (ideaId === null) {
        return res.status(400).json({ error: 'id must be a positive integer' });
    }

    const parsed = parseUpdateIdea(req.body);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    try {
        const updated = await updateIdea(req.user.id, ideaId, parsed.value);
        if (!updated) {
            return res.status(404).json({ error: 'Idea not found' });
        }

        const [idea] = await withTopics(req.user.id, [await findIdeaById(req.user.id, ideaId)]);
        res.status(200).json({ idea });
    } catch (err) {
        console.error(`PATCH /api/ideas/${req.params.id} error:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/ideas/:id
// Its rows in note_ideas and idea_topics go with it via cascade. The notes it
// gathered survive as unfiled notes — deleting an idea must never take a note
// with it.
router.delete('/:id', async (req, res) => {
    const ideaId = parseRowId(req.params.id);
    if (ideaId === null) {
        return res.status(400).json({ error: 'id must be a positive integer' });
    }

    try {
        const removed = await removeIdea(req.user.id, ideaId);
        if (!removed) {
            return res.status(404).json({ error: 'Idea not found' });
        }

        // Deliberately a second statement after the delete, NOT one transaction
        // with it. A pin carries no foreign key to its item, so the window
        // between these two lines cannot produce a wrong answer: findPins
        // hydrates every pin through a join to the item's own table, and a pin
        // pointing at an idea that no longer exists produces no joined row and
        // so is already invisible to every reader. This call only stops dead
        // rows accumulating — cleanup, not correctness. Please don't "fix" it
        // into a transaction; there is no bug here to fix.
        await removePinsForItem(req.user.id, 'idea', ideaId);

        res.status(204).end();
    } catch (err) {
        console.error(`DELETE /api/ideas/${req.params.id} error:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/ideas/:id/topics — { topicIds: [...] }
//
// Replaces the idea's ENTIRE topic set in one call. There is deliberately no
// add-one/remove-one pair: the UI is a multi-select, and a full-set PUT is the
// only shape that cannot leave the two out of step. An empty array files the
// idea under nothing, which is legal.
router.put('/:id/topics', async (req, res) => {
    const ideaId = parseRowId(req.params.id);
    if (ideaId === null) {
        return res.status(400).json({ error: 'id must be a positive integer' });
    }

    const parsed = parseIdeaTopics(req.body);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Ownership of the idea and of every topic id is checked inside the
        // transaction, so nothing can change between the check and the write.
        const result = await replaceLinks(
            connection,
            LINK_SPECS.ideaTopics,
            req.user.id,
            ideaId,
            parsed.value
        );

        if (result.error) {
            await connection.rollback();
            return result.error === MISSING_PARENT
                ? res.status(404).json({ error: 'Idea not found' })
                : res.status(400).json({ error: 'topicIds names a topic that does not exist' });
        }

        await connection.commit();

        const [idea] = await withTopics(req.user.id, [await findIdeaById(req.user.id, ideaId)]);
        res.status(200).json({ idea });
    } catch (err) {
        if (connection) {
            await connection.rollback().catch(rollbackErr => {
                console.error(`PUT /api/ideas/${req.params.id}/topics rollback failed:`, rollbackErr);
            });
        }
        console.error(`PUT /api/ideas/${req.params.id}/topics error:`, err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// PUT /api/ideas/:id/notes/order — { noteIds: [...] }
//
// Reorders the notes filed under one idea by writing note_ideas.sort_order,
// scoped to this idea alone. The mirror of PUT /api/topics/:id/ideas/order one
// tier up, and refused the same way when the set has moved on.
router.put('/:id/notes/order', async (req, res) => {
    const ideaId = parseRowId(req.params.id);
    if (ideaId === null) {
        return res.status(400).json({ error: 'id must be a positive integer' });
    }

    const parsed = parseIdeaNoteOrder(req.body);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    try {
        const result = await inTransaction(connection => reorderMembers(
            connection,
            TREE_SPECS.notesInIdea,
            req.user.id,
            ideaId,
            parsed.value
        ));

        if (result.error) {
            return respondToOrderingError(res, result.error, { container: 'Idea', member: 'Note' });
        }

        res.status(200).json({ ordered: result.ordered });
    } catch (err) {
        console.error(`PUT /api/ideas/${req.params.id}/notes/order error:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/ideas/:id/topic — { fromTopicId, toTopicId, position? }
//
// Drag an idea from one topic to another. Singular `topic`, and deliberately
// not the full-set PUT /:id/topics beside it: this rewrites ONE membership and
// leaves the idea's other topics alone, which is what dragging one row of a
// tree means. The full-set replace is still how the multi-select saves.
//
// The old link row is deleted and a new one inserted inside one transaction —
// a link row's topic_id is half its primary key, so a move is never an update.
// Either end may be null, which is how an idea is dragged into the unfiled
// bucket and back out again.
router.put('/:id/topic', async (req, res) => {
    const ideaId = parseRowId(req.params.id);
    if (ideaId === null) {
        return res.status(400).json({ error: 'id must be a positive integer' });
    }

    const parsed = parseIdeaMove(req.body);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    try {
        const result = await inTransaction(connection => moveMember(
            connection,
            TREE_SPECS.ideasInTopic,
            req.user.id,
            ideaId,
            parsed.value
        ));

        if (result.error) {
            return respondToOrderingError(res, result.error, { container: 'Topic', member: 'Idea' });
        }

        res.status(200).json({ filed: result.filed, position: result.position ?? null });
    } catch (err) {
        console.error(`PUT /api/ideas/${req.params.id}/topic error:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
