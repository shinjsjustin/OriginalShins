// Scroll reads and writes. A scroll covers a passage and holds ordered blocks;
// `scroll_chapters` lists each chapter the passage touches, and a chapter
// belongs to at most one scroll per user. Every function takes userId first and
// puts it in the SQL, so someone else's scroll answers like a missing one.
const db = require('../db/db');
const { inTransaction } = require('./ordering');
const { isDuplicateSlugError: isDuplicateEntry } = require('./topics');

const MISSING = 'missing';
const ANSWERED = 'answered';
const NOT_QUESTION = 'not-question';

const NULL_REFERENCE = [null, null, null, null];

const referenceParams = (reference) => reference
    ? [reference.bookId, reference.chapter, reference.startVerse, reference.endVerse]
    : NULL_REFERENCE;

const toSummary = (row) => ({
    id: row.id,
    title: row.title,
    passage: {
        bookId: row.book_id,
        bookName: row.book_name,
        startChapter: row.start_chapter,
        startVerse: row.start_verse,
        endChapter: row.end_chapter,
        endVerse: row.end_verse,
    },
    blockCount: Number(row.block_count),
    questionCount: Number(row.question_count),
    answeredCount: Number(row.answered_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const toBlock = (row) => ({
    id: row.id,
    position: row.position,
    kind: row.kind,
    body: row.body,
    reference: row.ref_book_id === null ? null : {
        bookId: row.ref_book_id,
        chapter: row.ref_chapter,
        startVerse: row.ref_start_verse,
        endVerse: row.ref_end_verse,
    },
    answer: row.answer === null ? null : {
        text: row.answer,
        answeredAt: row.answered_at,
        updatedAt: row.answer_updated_at,
    },
});

const SUMMARY_SELECT = `
    SELECT s.id, s.title, s.book_id, b.name AS book_name,
           s.start_chapter, s.start_verse, s.end_chapter, s.end_verse,
           s.created_at, s.updated_at,
           (SELECT COUNT(*) FROM scroll_blocks k WHERE k.scroll_id = s.id) AS block_count,
           (SELECT COUNT(*) FROM scroll_blocks k
             WHERE k.scroll_id = s.id AND k.kind = 'question') AS question_count,
           (SELECT COUNT(*) FROM scroll_blocks k
             WHERE k.scroll_id = s.id AND k.answer IS NOT NULL) AS answered_count
    FROM scrolls s
    JOIN books b ON b.id = s.book_id`;

const findScrolls = async (userId, { bookId, chapter } = {}) => {
    const where = ['s.user_id = ?'];
    const params = [userId];

    if (bookId !== undefined) {
        const filter = ['sc.scroll_id = s.id', 'sc.user_id = ?', 'sc.book_id = ?'];
        params.push(userId, bookId);
        if (chapter !== undefined) {
            filter.push('sc.chapter = ?');
            params.push(chapter);
        }
        where.push(`EXISTS (SELECT 1 FROM scroll_chapters sc WHERE ${filter.join(' AND ')})`);
    }

    const [rows] = await db.execute(
        `${SUMMARY_SELECT}
         WHERE ${where.join(' AND ')}
         ORDER BY s.created_at DESC, s.id DESC`,
        params
    );
    return rows.map(toSummary);
};

const findScroll = async (userId, scrollId) => {
    const [rows] = await db.execute(
        `${SUMMARY_SELECT} WHERE s.id = ? AND s.user_id = ?`,
        [scrollId, userId]
    );
    if (rows.length === 0) {
        return null;
    }

    const [blockRows] = await db.execute(
        `SELECT sb.id, sb.position, sb.kind, sb.body, sb.ref_book_id, sb.ref_chapter,
                sb.ref_start_verse, sb.ref_end_verse,
                sb.answer, sb.answered_at, sb.answer_updated_at
         FROM scroll_blocks sb
         JOIN scrolls s ON s.id = sb.scroll_id
         WHERE sb.scroll_id = ? AND s.user_id = ?
         ORDER BY sb.position`,
        [scrollId, userId]
    );
    return { ...toSummary(rows[0]), blocks: blockRows.map(toBlock) };
};

const insertBlocks = async (connection, scrollId, firstPosition, blocks) => {
    for (const [index, block] of blocks.entries()) {
        await connection.execute(
            `INSERT INTO scroll_blocks
                 (scroll_id, position, kind, body,
                  ref_book_id, ref_chapter, ref_start_verse, ref_end_verse)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [scrollId, firstPosition + index, block.kind, block.body, ...referenceParams(block.reference)]
        );
    }
};

// Checks every chapter the passage covers exists and both ends fit their
// chapter's verse_count. Returns the resolved end verse, or { error }.
const resolvePassage = async (connection, passage) => {
    const { bookId, startChapter, startVerse, endChapter } = passage;
    const [rows] = await connection.execute(
        `SELECT number, verse_count FROM chapters
         WHERE book_id = ? AND number BETWEEN ? AND ?
         ORDER BY number`,
        [bookId, startChapter, endChapter]
    );

    if (rows.length !== endChapter - startChapter + 1) {
        return { error: 'passage names a chapter that does not exist' };
    }
    if (startVerse > rows[0].verse_count) {
        return { error: `chapter ${startChapter} has only ${rows[0].verse_count} verses` };
    }

    const lastCount = rows[rows.length - 1].verse_count;
    const endVerse = passage.endVerse === null ? lastCount : passage.endVerse;
    if (endVerse > lastCount) {
        return { error: `chapter ${endChapter} has only ${lastCount} verses` };
    }
    return { endVerse };
};

const findConflict = async (userId, passage) => {
    const [rows] = await db.execute(
        `SELECT s.id, s.title
         FROM scroll_chapters sc
         JOIN scrolls s ON s.id = sc.scroll_id AND s.user_id = ?
         WHERE sc.user_id = ? AND sc.book_id = ? AND sc.chapter BETWEEN ? AND ?
         ORDER BY sc.chapter
         LIMIT 1`,
        [userId, userId, passage.bookId, passage.startChapter, passage.endChapter]
    );
    return rows.length > 0 ? { id: rows[0].id, title: rows[0].title } : null;
};

const writeScroll = (userId, { title, passage, blocks }) => inTransaction(async (connection) => {
    const resolved = await resolvePassage(connection, passage);
    if (resolved.error) {
        return resolved;
    }

    const [inserted] = await connection.execute(
        `INSERT INTO scrolls
             (user_id, title, book_id, start_chapter, start_verse, end_chapter, end_verse)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, title, passage.bookId, passage.startChapter, passage.startVerse,
            passage.endChapter, resolved.endVerse]
    );
    const scrollId = inserted.insertId;

    for (let chapter = passage.startChapter; chapter <= passage.endChapter; chapter += 1) {
        await connection.execute(
            'INSERT INTO scroll_chapters (scroll_id, user_id, book_id, chapter) VALUES (?, ?, ?, ?)',
            [scrollId, userId, passage.bookId, chapter]
        );
    }
    await insertBlocks(connection, scrollId, 1, blocks);
    return { scrollId };
});

// Returns { scroll }, { error } for a passage that does not fit the canon, or
// { conflict } when a covered chapter already belongs to one of the user's scrolls.
const createScroll = async (userId, input) => {
    let written;
    try {
        written = await writeScroll(userId, input);
    } catch (err) {
        if (!isDuplicateEntry(err)) {
            throw err;
        }
        const conflict = await findConflict(userId, input.passage);
        if (!conflict) {
            throw err;
        }
        return { conflict };
    }

    if (written.error) {
        return written;
    }
    return { scroll: await findScroll(userId, written.scrollId) };
};

const appendBlocks = async (userId, scrollId, blocks) => {
    const appended = await inTransaction(async (connection) => {
        const [owned] = await connection.execute(
            'SELECT id FROM scrolls WHERE id = ? AND user_id = ? FOR UPDATE',
            [scrollId, userId]
        );
        if (owned.length === 0) {
            return false;
        }

        const [[last]] = await connection.execute(
            'SELECT COALESCE(MAX(position), 0) AS max_position FROM scroll_blocks WHERE scroll_id = ?',
            [scrollId]
        );
        await insertBlocks(connection, scrollId, Number(last.max_position) + 1, blocks);
        return true;
    });

    return appended ? findScroll(userId, scrollId) : null;
};

// Why a guarded block write matched nothing: no such block for this user, or
// the guard (an answer is on it) refused.
const explainRefusal = async (userId, blockId, existsReason) => {
    const [rows] = await db.execute(
        `SELECT sb.id FROM scroll_blocks sb
         JOIN scrolls s ON s.id = sb.scroll_id
         WHERE sb.id = ? AND s.user_id = ?`,
        [blockId, userId]
    );
    return rows.length > 0 ? existsReason : MISSING;
};

const updateBlock = async (userId, blockId, { kind, body, reference }) => {
    const sets = [];
    const params = [];
    if (kind !== undefined) {
        sets.push('sb.kind = ?');
        params.push(kind);
    }
    if (body !== undefined) {
        sets.push('sb.body = ?');
        params.push(body);
    }
    if (reference !== undefined || (kind !== undefined && kind !== 'reference')) {
        sets.push('sb.ref_book_id = ?', 'sb.ref_chapter = ?', 'sb.ref_start_verse = ?', 'sb.ref_end_verse = ?');
        params.push(...referenceParams(kind !== undefined && kind !== 'reference' ? null : reference));
    }

    const [result] = await db.execute(
        `UPDATE scroll_blocks sb
         JOIN scrolls s ON s.id = sb.scroll_id
         SET ${sets.join(', ')}
         WHERE sb.id = ? AND s.user_id = ? AND sb.answer IS NULL`,
        [...params, blockId, userId]
    );
    return result.affectedRows > 0 ? true : explainRefusal(userId, blockId, ANSWERED);
};

const deleteBlock = async (userId, blockId) => {
    const [result] = await db.execute(
        `DELETE sb FROM scroll_blocks sb
         JOIN scrolls s ON s.id = sb.scroll_id
         WHERE sb.id = ? AND s.user_id = ? AND sb.answer IS NULL`,
        [blockId, userId]
    );
    return result.affectedRows > 0 ? true : explainRefusal(userId, blockId, ANSWERED);
};

// A null answer clears all three answer columns; otherwise answered_at is kept
// once set and answer_updated_at moves every time.
const saveAnswer = async (userId, blockId, answer) => {
    const assignments = answer === null
        ? 'sb.answer = NULL, sb.answered_at = NULL, sb.answer_updated_at = NULL'
        : `sb.answer = ?,
           sb.answered_at = IF(sb.answered_at IS NULL, CURRENT_TIMESTAMP, sb.answered_at),
           sb.answer_updated_at = CURRENT_TIMESTAMP`;

    const [result] = await db.execute(
        `UPDATE scroll_blocks sb
         JOIN scrolls s ON s.id = sb.scroll_id
         SET ${assignments}
         WHERE sb.id = ? AND s.user_id = ? AND sb.kind = 'question'`,
        [...(answer === null ? [] : [answer]), blockId, userId]
    );
    return result.affectedRows > 0 ? true : explainRefusal(userId, blockId, NOT_QUESTION);
};

const updateTitle = async (userId, scrollId, title) => {
    const [result] = await db.execute(
        'UPDATE scrolls SET title = ? WHERE id = ? AND user_id = ?',
        [title, scrollId, userId]
    );
    return result.affectedRows > 0;
};

const deleteScroll = async (userId, scrollId) => {
    const [result] = await db.execute(
        'DELETE FROM scrolls WHERE id = ? AND user_id = ?',
        [scrollId, userId]
    );
    return result.affectedRows > 0;
};

module.exports = {
    MISSING,
    ANSWERED,
    NOT_QUESTION,
    createScroll,
    findScrolls,
    findScroll,
    appendBlocks,
    updateBlock,
    deleteBlock,
    saveAnswer,
    updateTitle,
    deleteScroll,
};
