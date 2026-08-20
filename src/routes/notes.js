const express = require('express');
const db = require('../db/db');

const { MAX_BOOK_ID, MAX_CHAPTER_NUMBER, parsePositiveInt, parseRowId } = require('../lib/params');
const {
    parseCreateNote,
    parseUpdateNote,
    parseReference,
    parseNoteIdeas,
    parseNoteMove,
} = require('../lib/noteInput');
const { LINK_SPECS, MISSING_PARENT, replaceLinks } = require('../lib/links');
const { findChapter } = require('../lib/chapters');
const { removePinsForItem } = require('../lib/pins');
const { findReferencesOverlappingChapter, insertReference } = require('../lib/references');
const {
    findNoteById,
    findNotesByIds,
    findUnreferencedNotes,
    findUnfiledNotes,
    insertNote,
    updateNote,
    removeNote,
    noteExistsForUser,
} = require('../lib/notes');
const { TREE_SPECS, moveMember, inTransaction } = require('../lib/ordering');
const { respondToOrderingError } = require('./orderingErrors');

const router = express.Router();

// Mounted behind isAuth, so req.user is always populated and every handler
// below takes its user id from the token rather than from the request.

// GET /api/notes?bookId=&chapter=
// The notes panel's whole payload for one chapter, in two lists:
//
//   notes        — notes with at least one reference overlapping this chapter,
//                  in the order their anchors appear in the text
//   unreferenced — notes with no reference at all, which are therefore
//                  invisible in the scripture panels and reachable only here
//
// Every note in either list carries its complete reference set, so opening the
// editor needs no further request.
router.get('/', async (req, res) => {
    const bookId = parsePositiveInt(req.query.bookId, MAX_BOOK_ID);
    const chapterNumber = parsePositiveInt(req.query.chapter, MAX_CHAPTER_NUMBER);

    if (bookId === null || chapterNumber === null) {
        return res.status(400).json({
            error: 'bookId and chapter must be positive integers within the canon',
        });
    }

    try {
        const found = await findChapter(bookId, chapterNumber);
        if (!found) {
            return res.status(404).json({ error: 'Chapter not found' });
        }

        const references = await findReferencesOverlappingChapter(
            req.user.id,
            found.chapter.startIndex,
            found.chapter.endIndex
        );

        // The overlap query is ordered by start_index, so first appearance here
        // is passage order. Deduplicate while preserving it.
        const noteIds = [...new Set(references.map(reference => reference.noteId))];

        const [notes, unreferenced] = await Promise.all([
            findNotesByIds(req.user.id, noteIds),
            findUnreferencedNotes(req.user.id),
        ]);

        res.status(200).json({ notes, unreferenced });
    } catch (err) {
        console.error('GET /api/notes error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/notes/unfiled
//
// The plan's unfiled query: every note with no row in note_ideas. This is the
// Topic page's "Unfiled notes" bucket — the only place an orphan note can be
// reached from that page, since a note under no idea hangs off no topic either.
//
// A dedicated path rather than a flag on GET /api/notes, because that endpoint
// answers a question about one chapter and requires bookId and chapter to do
// it; "which notes have no idea?" is not a narrowing of it. Declared before the
// /:id routes so the literal segment is matched first.
//
// Do not confuse it with the `unreferenced` list GET /api/notes returns: that
// one is about scripture anchors, this one is about ideas, and a note can be in
// both, one or neither.
router.get('/unfiled', async (req, res) => {
    try {
        const notes = await findUnfiledNotes(req.user.id);
        res.status(200).json({ notes });
    } catch (err) {
        console.error('GET /api/notes/unfiled error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/notes/:id — one note, with its complete reference and idea sets.
//
// The Overview page's drawer is what needs this. That page loads /api/overview,
// which ships anchors and titles and deliberately not bodies: a body is the one
// field with no bound on its length, and a few thousand of them would turn a
// payload measured in hundreds of kilobytes into one measured in megabytes for
// the sake of the one note the reader has just clicked. So the body is fetched
// when a note is actually opened, which is the moment it is first wanted.
//
// Declared after /unfiled so the literal segment still wins, and before the
// other /:id routes so the read sits beside them rather than under the writes.
router.get('/:id', async (req, res) => {
    const noteId = parseRowId(req.params.id);
    if (noteId === null) {
        return res.status(400).json({ error: 'id must be a positive integer' });
    }

    try {
        // findNoteById scopes by user_id, so a note belonging to someone else
        // is a 404 here and not a 403 — the two answers would differ only by
        // telling the caller that the row exists.
        const note = await findNoteById(req.user.id, noteId);
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        res.status(200).json({ note });
    } catch (err) {
        console.error(`GET /api/notes/${req.params.id} error:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/notes
// Body: { title?, body?, reference? }
//
// One endpoint, two creation paths. Omitting `reference` makes a standalone
// note; including it anchors the note to a verse range in the same transaction,
// so a note is never briefly visible without the anchor it was created from.
router.post('/', async (req, res) => {
    const parsed = parseCreateNote(req.body);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    const { title, body, reference } = parsed.value;

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const noteId = await insertNote(connection, req.user.id, { title, body });

        if (reference) {
            // insertReference derives start_index/end_index from `verses`; a
            // null result means the range names no verse that exists.
            const inserted = await insertReference(connection, noteId, reference);
            if (!inserted) {
                await connection.rollback();
                return res.status(400).json({ error: 'That verse range does not exist' });
            }
        }

        await connection.commit();

        const note = await findNoteById(req.user.id, noteId);
        res.status(201).json({ note });
    } catch (err) {
        if (connection) {
            await connection.rollback().catch(rollbackErr => {
                console.error('POST /api/notes rollback failed:', rollbackErr);
            });
        }
        console.error('POST /api/notes error:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// PATCH /api/notes/:id — partial update of title and/or body.
router.patch('/:id', async (req, res) => {
    const noteId = parseRowId(req.params.id);
    if (noteId === null) {
        return res.status(400).json({ error: 'id must be a positive integer' });
    }

    const parsed = parseUpdateNote(req.body);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    try {
        const updated = await updateNote(req.user.id, noteId, parsed.value);
        if (!updated) {
            return res.status(404).json({ error: 'Note not found' });
        }

        const note = await findNoteById(req.user.id, noteId);
        res.status(200).json({ note });
    } catch (err) {
        console.error(`PATCH /api/notes/${req.params.id} error:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/notes/:id — takes the note's references with it via cascade.
router.delete('/:id', async (req, res) => {
    const noteId = parseRowId(req.params.id);
    if (noteId === null) {
        return res.status(400).json({ error: 'id must be a positive integer' });
    }

    try {
        const removed = await removeNote(req.user.id, noteId);
        if (!removed) {
            return res.status(404).json({ error: 'Note not found' });
        }

        // Deliberately a second statement after the delete, NOT one transaction
        // with it. A pin carries no foreign key to its item, so the window
        // between these two lines cannot produce a wrong answer: findPins
        // hydrates every pin through a join to the item's own table, and a pin
        // pointing at a note that no longer exists produces no joined row and
        // so is already invisible to every reader. This call only stops dead
        // rows accumulating — cleanup, not correctness. Please don't "fix" it
        // into a transaction; there is no bug here to fix.
        await removePinsForItem(req.user.id, 'note', noteId);

        res.status(204).end();
    } catch (err) {
        console.error(`DELETE /api/notes/${req.params.id} error:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/notes/:id/references
// Body: { bookId, chapter, startVerse, endVerse }
//
// Adds an anchor to an existing note — the editor's "add reference from the
// current selection". The index bounds are computed here, never accepted.
router.post('/:id/references', async (req, res) => {
    const noteId = parseRowId(req.params.id);
    if (noteId === null) {
        return res.status(400).json({ error: 'id must be a positive integer' });
    }

    const parsed = parseReference(req.body);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    try {
        // Ownership first: a note id belonging to someone else must look
        // exactly like one that does not exist.
        if (!await noteExistsForUser(req.user.id, noteId)) {
            return res.status(404).json({ error: 'Note not found' });
        }

        const inserted = await insertReference(db, noteId, parsed.value);
        if (!inserted) {
            return res.status(400).json({ error: 'That verse range does not exist' });
        }

        const note = await findNoteById(req.user.id, noteId);
        res.status(201).json({ note, reference: inserted });
    } catch (err) {
        console.error(`POST /api/notes/${req.params.id}/references error:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/notes/:id/ideas — { ideaIds: [...] }
//
// Replaces the note's ENTIRE idea set in one call. Unlike references, which are
// added and removed one at a time because each one is a separate act of
// anchoring, idea links come from a multi-select: the widget knows the whole
// membership, so it sends the whole membership. There is deliberately no
// add-one/remove-one pair to fall out of step with it.
//
// An empty array unlinks the note from every idea. That leaves an orphan note,
// which the plan makes a legal state — so it is a normal 200, not an error.
router.put('/:id/ideas', async (req, res) => {
    const noteId = parseRowId(req.params.id);
    if (noteId === null) {
        return res.status(400).json({ error: 'id must be a positive integer' });
    }

    const parsed = parseNoteIdeas(req.body);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Ownership of the note and of every idea id is checked inside the
        // transaction, so nothing can change between the check and the write.
        const result = await replaceLinks(
            connection,
            LINK_SPECS.noteIdeas,
            req.user.id,
            noteId,
            parsed.value
        );

        if (result.error) {
            await connection.rollback();
            return result.error === MISSING_PARENT
                ? res.status(404).json({ error: 'Note not found' })
                : res.status(400).json({ error: 'ideaIds names an idea that does not exist' });
        }

        await connection.commit();

        const note = await findNoteById(req.user.id, noteId);
        res.status(200).json({ note });
    } catch (err) {
        if (connection) {
            await connection.rollback().catch(rollbackErr => {
                console.error(`PUT /api/notes/${req.params.id}/ideas rollback failed:`, rollbackErr);
            });
        }
        console.error(`PUT /api/notes/${req.params.id}/ideas error:`, err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// PUT /api/notes/:id/idea — { fromIdeaId, toIdeaId, position? }
//
// Drag a note from one idea to another, the note tier's mirror of
// PUT /api/ideas/:id/topic. Singular `idea` and one membership: the note's
// other ideas are untouched, unlike the full-set PUT /:id/ideas above, which is
// still how the editor's multi-select saves.
//
// The old note_ideas row is deleted and the new one inserted in one
// transaction. `toIdeaId: null` drops the note into the unfiled bucket;
// `fromIdeaId: null` files one out of it — which is the acceptance case for the
// whole tree, since a note dragged out of Unfiled must leave it.
router.put('/:id/idea', async (req, res) => {
    const noteId = parseRowId(req.params.id);
    if (noteId === null) {
        return res.status(400).json({ error: 'id must be a positive integer' });
    }

    const parsed = parseNoteMove(req.body);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    try {
        const result = await inTransaction(connection => moveMember(
            connection,
            TREE_SPECS.notesInIdea,
            req.user.id,
            noteId,
            parsed.value
        ));

        if (result.error) {
            return respondToOrderingError(res, result.error, { container: 'Idea', member: 'Note' });
        }

        res.status(200).json({ filed: result.filed, position: result.position ?? null });
    } catch (err) {
        console.error(`PUT /api/notes/${req.params.id}/idea error:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
