const express = require('express');
const isScrollKey = require('../middleware/isScrollKey');
const scrolls = require('../lib/scrolls');
const scrollInput = require('../lib/scrollInput');
const { buildOpenApi } = require('../lib/scrollsOpenApi');
const { MAX_CHAPTER_NUMBER, parsePositiveInt, parseRowId, parseBookScope } = require('../lib/params');

const ANSWERED_ERROR = 'Question already answered';

// The AI's door: scrolls only, keyed by a per-user API key. There is no scroll
// delete here on purpose; a key can add and edit, never remove a whole scroll.
const createAgentRouter = (deps = {}) => {
    const d = { auth: isScrollKey, ...scrolls, ...scrollInput, ...deps };
    const router = express.Router();

    const fail = (res, label, err) => {
        console.error(`${label} failed:`, err);
        res.status(500).json({ error: 'Something went wrong' });
    };
    // Wraps a handler so a throw is a logged 500 instead of an unhandled rejection.
    const route = (label, handler) => async (req, res) => {
        try {
            await handler(req, res);
        } catch (err) {
            fail(res, label, err);
        }
    };
    const badRequest = (res, error) => res.status(400).json({ error });
    const notFound = (res) => res.status(404).json({ error: 'Not found' });
    const answered = (res) => res.status(409).json({ error: ANSWERED_ERROR });

    router.get('/openapi.json', (req, res) => {
        res.status(200).json(buildOpenApi(`${req.protocol}://${req.get('host')}/api/agent`));
    });

    router.use(d.auth);

    router.get('/scrolls', route('GET /api/agent/scrolls', async (req, res) => {
        const scope = parseBookScope(req.query.book);
        if (scope.error) return badRequest(res, scope.error);

        const filter = {};
        if (scope.bookId !== null) filter.bookId = scope.bookId;
        if (req.query.chapter !== undefined) {
            if (scope.bookId === null) return badRequest(res, 'chapter needs a book');
            const chapter = parsePositiveInt(req.query.chapter, MAX_CHAPTER_NUMBER);
            if (chapter === null) return badRequest(res, `chapter must be between 1 and ${MAX_CHAPTER_NUMBER}`);
            filter.chapter = chapter;
        }
        res.status(200).json({ scrolls: await d.findScrolls(req.user.id, filter) });
    }));

    router.post('/scrolls', route('POST /api/agent/scrolls', async (req, res) => {
        const parsed = d.parseCreateScroll(req.body);
        if (parsed.error) return badRequest(res, parsed.error);

        const result = await d.createScroll(req.user.id, parsed.value);
        if (result.error) return badRequest(res, result.error);
        if (result.conflict) {
            return res.status(409).json({
                error: `Chapter already has a scroll: ${result.conflict.title}`,
                conflict: result.conflict,
            });
        }
        res.status(201).json({ scroll: result.scroll });
    }));

    // Every :id route validates its ids first, so a bad one never reaches the lib.
    router.param('id', (req, res, next, value) => {
        req.scrollId = parseRowId(value);
        return req.scrollId === null ? badRequest(res, 'id must be a positive integer') : next();
    });
    router.param('blockId', (req, res, next, value) => {
        req.blockId = parseRowId(value);
        return req.blockId === null ? badRequest(res, 'blockId must be a positive integer') : next();
    });

    router.get('/scrolls/:id', route('GET /api/agent/scrolls/:id', async (req, res) => {
        const scroll = await d.findScroll(req.user.id, req.scrollId);
        if (!scroll) return notFound(res);
        res.status(200).json({ scroll });
    }));

    router.patch('/scrolls/:id', route('PATCH /api/agent/scrolls/:id', async (req, res) => {
        const parsed = d.parseTitlePatch(req.body);
        if (parsed.error) return badRequest(res, parsed.error);

        if (!(await d.updateTitle(req.user.id, req.scrollId, parsed.value.title))) return notFound(res);
        res.status(200).json({ scroll: await d.findScroll(req.user.id, req.scrollId) });
    }));

    router.post('/scrolls/:id/blocks', route('POST /api/agent/scrolls/:id/blocks', async (req, res) => {
        const parsed = d.parseBlocks(req.body && req.body.blocks);
        if (parsed.error) return badRequest(res, parsed.error);

        const scroll = await d.appendBlocks(req.user.id, req.scrollId, parsed.value);
        if (!scroll) return notFound(res);
        res.status(201).json({ scroll });
    }));

    // The block lib calls take a block id alone, so the URL's scroll is checked
    // here: a block of another scroll must not be reachable through this one.
    const hasBlock = async (req) => {
        const scroll = await d.findScroll(req.user.id, req.scrollId);
        return Boolean(scroll) && scroll.blocks.some((block) => block.id === req.blockId);
    };

    router.patch('/scrolls/:id/blocks/:blockId', route('PATCH /api/agent/scrolls/:id/blocks/:blockId', async (req, res) => {
        const parsed = d.parseBlockPatch(req.body);
        if (parsed.error) return badRequest(res, parsed.error);
        if (!(await hasBlock(req))) return notFound(res);

        const result = await d.updateBlock(req.user.id, req.blockId, parsed.value);
        if (result === d.ANSWERED) return answered(res);
        if (result !== true) return notFound(res);
        res.status(200).json({ scroll: await d.findScroll(req.user.id, req.scrollId) });
    }));

    router.delete('/scrolls/:id/blocks/:blockId', route('DELETE /api/agent/scrolls/:id/blocks/:blockId', async (req, res) => {
        if (!(await hasBlock(req))) return notFound(res);

        const result = await d.deleteBlock(req.user.id, req.blockId);
        if (result === d.ANSWERED) return answered(res);
        if (result !== true) return notFound(res);
        res.status(204).end();
    }));

    return router;
};

module.exports = { createAgentRouter };
