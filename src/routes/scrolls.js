const express = require('express');
const scrolls = require('../lib/scrolls');
const { parseAnswer } = require('../lib/scrollInput');
const { MAX_BOOK_ID, MAX_CHAPTER_NUMBER, parsePositiveInt, parseRowId } = require('../lib/params');

// The site's side of scrolls: read, answer, delete. Nothing here edits or
// deletes a block; users answer, the AI writes.
const createScrollsRouter = (deps = {}) => {
    const d = { ...scrolls, parseAnswer, ...deps };
    const router = express.Router();

    // Wraps a handler so a throw is a logged 500 instead of an unhandled rejection.
    const route = (label, handler) => async (req, res) => {
        try {
            await handler(req, res);
        } catch (err) {
            console.error(`${label} failed:`, err);
            res.status(500).json({ error: 'Something went wrong' });
        }
    };
    const badRequest = (res, error) => res.status(400).json({ error });
    const notFound = (res) => res.status(404).json({ error: 'Not found' });

    router.param('id', (req, res, next, value) => {
        req.scrollId = parseRowId(value);
        return req.scrollId === null ? badRequest(res, 'id must be a positive integer') : next();
    });
    router.param('blockId', (req, res, next, value) => {
        req.blockId = parseRowId(value);
        return req.blockId === null ? badRequest(res, 'blockId must be a positive integer') : next();
    });

    router.get('/', route('GET /api/scrolls', async (req, res) => {
        res.status(200).json({ scrolls: await d.findScrolls(req.user.id) });
    }));

    router.get('/covering', route('GET /api/scrolls/covering', async (req, res) => {
        const bookId = parsePositiveInt(req.query.book, MAX_BOOK_ID);
        if (bookId === null) return badRequest(res, `book must be a book id between 1 and ${MAX_BOOK_ID}`);
        const chapter = parsePositiveInt(req.query.chapter, MAX_CHAPTER_NUMBER);
        if (chapter === null) return badRequest(res, `chapter must be between 1 and ${MAX_CHAPTER_NUMBER}`);

        const [scroll = null] = await d.findScrolls(req.user.id, { bookId, chapter });
        res.status(200).json({ scroll });
    }));

    router.get('/:id', route('GET /api/scrolls/:id', async (req, res) => {
        const scroll = await d.findScroll(req.user.id, req.scrollId);
        if (!scroll) return notFound(res);
        res.status(200).json({ scroll });
    }));

    router.put('/:id/blocks/:blockId/answer', route('PUT /api/scrolls/:id/blocks/:blockId/answer', async (req, res) => {
        const parsed = d.parseAnswer(req.body);
        if (parsed.error) return badRequest(res, parsed.error);

        // The block must sit in the scroll named by the URL, not just be the caller's.
        const before = await d.findScroll(req.user.id, req.scrollId);
        if (!before || !before.blocks.some((b) => b.id === req.blockId)) return notFound(res);

        const result = await d.saveAnswer(req.user.id, req.blockId, parsed.value.answer);
        if (result === d.MISSING) return notFound(res);
        if (result === d.NOT_QUESTION) return res.status(422).json({ error: 'Only questions take answers' });

        const after = await d.findScroll(req.user.id, req.scrollId);
        const block = after && after.blocks.find((b) => b.id === req.blockId);
        if (!block) return notFound(res);
        res.status(200).json({ block });
    }));

    router.delete('/:id', route('DELETE /api/scrolls/:id', async (req, res) => {
        if (!(await d.deleteScroll(req.user.id, req.scrollId))) return notFound(res);
        res.status(204).end();
    }));

    return router;
};

module.exports = { createScrollsRouter };
