const express = require('express');

const { MAX_BOOK_ID, MAX_CHAPTER_NUMBER, parsePositiveInt } = require('../lib/params');
const { parseChapterIdeas } = require('../lib/chapterIdeaInput');
const { findChapter } = require('../lib/chapters');
const { withTopics } = require('../lib/ideaTopics');
const { findChapterIdeas, replaceChapterIdeas } = require('../lib/chapterIdeas');
const { inTransaction } = require('../lib/ordering');

const router = express.Router();

// Mounted behind isAuth, so req.user is always populated and both handlers take
// their user id from the token rather than from the request.
//
// The ideas a reader has imported into one chapter: the Analyze notes panel's
// "Import idea" action pins an existing idea to the chapter being read, so a
// note written there can be filed under it without going through the whole idea
// list. The set is remembered in `chapter_ideas` rather than derived from the
// notes already anchored in the chapter, because an idea is imported before any
// note links to it — see src/db/migrations/007_chapter_ideas.sql.
//
// A router of its own rather than another handler on /api/ideas, for the same
// reason /api/references is not nested under /api/notes: what is addressed here
// is a chapter, and no id in either path names an idea.

// GET /api/chapter-ideas?bookId=&chapter= -> { ideas: [...] }
//
// Every idea imported into this chapter, hydrated exactly as GET /api/ideas
// hydrates its list — same fields, same note count, same topics — so the panel
// can render a row from either endpoint with one component.
router.get('/', async (req, res) => {
    const bookId = parsePositiveInt(req.query.bookId, MAX_BOOK_ID);
    const chapterNumber = parsePositiveInt(req.query.chapter, MAX_CHAPTER_NUMBER);

    if (bookId === null || chapterNumber === null) {
        return res.status(400).json({
            error: 'bookId and chapter must be positive integers within the canon',
        });
    }

    try {
        // The bounds above only prove the pair is in range; this proves the
        // chapter exists, exactly as GET /api/notes does before reading a
        // chapter's notes. Genesis 51 is in range and is not a chapter.
        const found = await findChapter(bookId, chapterNumber);
        if (!found) {
            return res.status(404).json({ error: 'Chapter not found' });
        }

        const imported = await findChapterIdeas(req.user.id, bookId, chapterNumber);
        res.status(200).json({ ideas: await withTopics(req.user.id, imported) });
    } catch (err) {
        console.error('GET /api/chapter-ideas error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/chapter-ideas — { bookId, chapter, ideaIds: [...] }
//
// Replaces the chapter's ENTIRE imported set in one call, the same shape as
// PUT /api/notes/:id/ideas and PUT /api/ideas/:id/topics. There is deliberately
// no import-one/remove-one pair: the panel holds the whole set, and a full-set
// PUT is the only shape that cannot leave the two out of step. An empty array
// imports nothing into the chapter, which is legal — it is how the last
// imported idea is removed.
//
// The coordinate travels in the body rather than the path because a chapter is
// not a row and has no id to put there; the GET reads it off the query string
// for the same reason.
//
// Returns the new set in the shape GET returns, so the panel needs no follow-up
// request to redraw.
router.put('/', async (req, res) => {
    const parsed = parseChapterIdeas(req.body);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    const { bookId, chapter, ideaIds } = parsed.value;

    try {
        const found = await findChapter(bookId, chapter);
        if (!found) {
            return res.status(404).json({ error: 'Chapter not found' });
        }

        // Ownership of every idea id is checked inside the transaction, so
        // nothing can change between the check and the write. There is no
        // parent row to check alongside it — the 404 above stands in for the
        // MISSING_PARENT case the link-table PUTs answer with.
        //
        // A refusal comes back through inTransaction as a value rather than a
        // throw, committing a transaction that wrote nothing: the check runs
        // before the first write, exactly as reorderMembers' does.
        const result = await inTransaction(connection => replaceChapterIdeas(
            connection,
            req.user.id,
            bookId,
            chapter,
            ideaIds
        ));

        if (result.error) {
            return res.status(400).json({ error: 'ideaIds names an idea that does not exist' });
        }

        const imported = await findChapterIdeas(req.user.id, bookId, chapter);
        res.status(200).json({ ideas: await withTopics(req.user.id, imported) });
    } catch (err) {
        console.error('PUT /api/chapter-ideas error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
