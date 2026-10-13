// Bourne's notes read: a page of notes, newest edit first, with every name
// Bourne needs to describe them without a second request.
const db = require('../db/db');
const { findNotesByIds } = require('./notes');
const { findTopicsForIdeas } = require('./topics');

const assertPositiveInteger = (value, name) => {
    if (!Number.isInteger(value) || value < 1) {
        throw new TypeError(`${name} must be a positive integer`);
    }
};

const assertNonNegativeInteger = (value, name) => {
    if (!Number.isInteger(value) || value < 0) {
        throw new TypeError(`${name} must be a non-negative integer`);
    }
};

const findNoteIds = async (userId, { sinceInstant, bookId, chapter, limit, offset }) => {
    const conditions = ['n.user_id = ?'];
    const params = [userId];

    if (sinceInstant !== undefined && sinceInstant !== null) {
        conditions.push('n.updated_at >= ?');
        params.push(sinceInstant);
    }

    if (bookId !== undefined && bookId !== null) {
        const anchor = ['nr.note_id = n.id', 'nr.book_id = ?'];
        params.push(bookId);
        if (chapter !== undefined && chapter !== null) {
            anchor.push('nr.chapter = ?');
            params.push(chapter);
        }
        conditions.push(`EXISTS (SELECT 1 FROM note_references nr WHERE ${anchor.join(' AND ')})`);
    }

    // LIMIT and OFFSET are asserted integers and interpolated: mysql2 prepared
    // statements reject them as placeholders. One extra row tells hasMore.
    const [rows] = await db.execute(
        `SELECT n.id
         FROM notes n
         WHERE ${conditions.join(' AND ')}
         ORDER BY n.updated_at DESC, n.id DESC
         LIMIT ${limit + 1} OFFSET ${offset}`,
        params
    );
    return rows.map(row => row.id);
};

const findBookNames = async (bookIds) => {
    if (bookIds.length === 0) {
        return new Map();
    }
    const placeholders = bookIds.map(() => '?').join(', ');
    const [rows] = await db.execute(
        `SELECT id, name FROM books WHERE id IN (${placeholders})`,
        bookIds
    );
    return new Map(rows.map(row => [row.id, row.name]));
};

const toNameRef = ({ id, name }) => ({ id, name });

const findNotesForBourne = async (userId, { sinceInstant, bookId, chapter, limit, offset }) => {
    assertPositiveInteger(limit, 'limit');
    assertNonNegativeInteger(offset, 'offset');

    const ids = await findNoteIds(userId, { sinceInstant, bookId, chapter, limit, offset });
    const hasMore = ids.length > limit;
    const notes = await findNotesByIds(userId, ids.slice(0, limit));

    const ideaIds = [...new Set(notes.flatMap(note => note.ideas.map(idea => idea.id)))];
    const bookIds = [...new Set(notes.flatMap(note => note.references.map(ref => ref.bookId)))];
    const [ideaTopics, bookNames] = await Promise.all([
        findTopicsForIdeas(userId, ideaIds),
        findBookNames(bookIds),
    ]);

    return {
        hasMore,
        notes: notes.map(note => ({
            id: note.id,
            title: note.title,
            body: note.body,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
            references: note.references.map(ref => ({
                bookId: ref.bookId,
                bookName: bookNames.get(ref.bookId),
                chapter: ref.chapter,
                startVerse: ref.startVerse,
                endVerse: ref.endVerse,
            })),
            ideas: note.ideas.map(idea => ({
                id: idea.id,
                title: idea.title,
                topics: ideaTopics.filter(topic => topic.ideaId === idea.id).map(toNameRef),
            })),
            topics: note.topics.map(toNameRef),
        })),
    };
};

module.exports = { findNotesForBourne };
