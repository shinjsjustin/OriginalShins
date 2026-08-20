// Everything GET /api/search reads, in one place.
//
// It is the one module here that crosses every tier, and that is deliberate:
// the four groups differ in which table they hit, but the rule that ranks them
// — a title hit outranks a body hit, then the row's own order — is one rule and
// belongs in one file. Splitting it across notes.js, ideas.js and topics.js
// would put three copies of it where two could drift apart unnoticed.
//
// It reads and never writes, so it composes the other tiers' readers freely:
// references.js for a note's first anchor and topics.js for an idea's topics.
// Neither of those reads this module, so nothing here closes a cycle.
const db = require('../db/db');
const { withFirstReferences } = require('./references');
const { findTopicsForIdeas } = require('./topics');
const { buildSnippet } = require('./snippet');

// Per-group caps. They are the answer to "never return the whole table": a
// query matching every row a user has still costs one bounded page.
//
// Scripture is the wider cap because it is the group a reader scrolls — a word
// like "shepherd" is a handful of notes and a hundred verses — and because its
// rows are ranked by relevance rather than by the reader's own ordering.
const CONTENT_LIMIT = 20;
const SCRIPTURE_LIMIT = 50;

// LIKE reads % and _ as wildcards and \ as its own escape, so a query
// containing any of them would otherwise match by accident: "100%" would become
// "starts with 100". Escaped here with LIKE's default escape character, which
// is why no clause below spells out ESCAPE.
const escapeLike = (term) => term.replace(/[\\%_]/g, character => `\\${character}`);

const containsPattern = (term) => `%${escapeLike(term)}%`;

// The ranking rule the three content groups share.
//
// `match_rank` is 0 for a title hit and 1 for a body-only hit, so ORDER BY puts
// every title match first and leaves the row's own sort_order to break ties
// within each half. LIKE against a utf8mb4_unicode_ci column is already
// case-insensitive; nothing here lowercases either side.
//
// Everything interpolated here — the table, the two column names, the limit —
// is a literal chosen by one of the three callers below and never a value from
// a request. The search TERM is bound, every time, as the four placeholders.
// The limit is interpolated rather than bound because a bound LIMIT is the one
// placeholder the driver has to send as a string.
const contentQuery = ({ table, columns, titleColumn, bodyColumn }) => `
    SELECT ${columns},
           CASE WHEN ${titleColumn} LIKE ? THEN 0 ELSE 1 END AS match_rank
    FROM ${table}
    WHERE user_id = ?
      AND (${titleColumn} LIKE ? OR ${bodyColumn} LIKE ?)
    ORDER BY match_rank, sort_order, id
    LIMIT ${CONTENT_LIMIT}`;

// One pattern, three placeholders: the rank, then the two halves of the WHERE.
const contentParams = (userId, pattern) => [pattern, userId, pattern, pattern];

// Notes carry `firstReference` for the same reason the tree's note rows do: it
// is the chapter the Analyze link opens at. A note with no anchor still comes
// back — it is reachable through the notes panel's unreferenced list.
const searchNotes = async (userId, query) => {
    const pattern = containsPattern(query);
    const [rows] = await db.execute(
        contentQuery({
            table: 'notes',
            columns: 'id, title, body',
            titleColumn: 'title',
            bodyColumn: 'body',
        }),
        contentParams(userId, pattern)
    );

    return withFirstReferences(userId, rows.map(row => ({
        id: row.id,
        title: row.title,
        snippet: buildSnippet(row.body, query),
    })));
};

// Ideas carry the topics they are filed under, because that is what the search
// result links to: the Topic page, opened on the topic this idea sits under. An
// idea filed nowhere comes back with an empty list and links to the unfiled
// bucket instead.
const searchIdeas = async (userId, query) => {
    const pattern = containsPattern(query);
    const [rows] = await db.execute(
        contentQuery({
            table: 'ideas',
            columns: 'id, title, body',
            titleColumn: 'title',
            bodyColumn: 'body',
        }),
        contentParams(userId, pattern)
    );

    const links = await findTopicsForIdeas(userId, rows.map(row => row.id));
    const topicsByIdeaId = links.reduce((acc, link) => ({
        ...acc,
        [link.ideaId]: [
            ...(acc[link.ideaId] || []),
            { id: link.id, name: link.name, slug: link.slug },
        ],
    }), {});

    return rows.map(row => ({
        id: row.id,
        title: row.title,
        snippet: buildSnippet(row.body, query),
        topics: topicsByIdeaId[row.id] || [],
    }));
};

const searchTopics = async (userId, query) => {
    const pattern = containsPattern(query);
    const [rows] = await db.execute(
        contentQuery({
            table: 'topics',
            columns: 'id, name, slug, description',
            titleColumn: 'name',
            bodyColumn: 'description',
        }),
        contentParams(userId, pattern)
    );

    return rows.map(row => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        snippet: buildSnippet(row.description, query),
    }));
};

// The one group that is not user-scoped, because scripture is not a user's: the
// tables are static reference data every account reads the same copy of.
//
// NATURAL LANGUAGE MODE, not BOOLEAN MODE. Boolean mode would read +, -, * and
// " out of whatever the reader typed as operators, which turns an apostrophe or
// a hyphen in a phrase into a syntax the reader never asked for. Natural
// language mode treats the whole bound parameter as words.
//
// verse_index rides along because it is how the rest of the app addresses a
// verse, and the tie-break: equally relevant verses list in canonical order.
const searchScripture = async (query) => {
    const [rows] = await db.execute(
        `SELECT v.book_id, b.name AS book_name, v.chapter, v.verse, v.verse_index, v.text,
                MATCH (v.text) AGAINST (? IN NATURAL LANGUAGE MODE) AS score
         FROM verses v
         JOIN books b ON b.id = v.book_id
         WHERE MATCH (v.text) AGAINST (? IN NATURAL LANGUAGE MODE)
         ORDER BY score DESC, v.verse_index
         LIMIT ${SCRIPTURE_LIMIT}`,
        [query, query]
    );

    return rows.map(row => ({
        bookId: row.book_id,
        bookName: row.book_name,
        chapter: row.chapter,
        verse: row.verse,
        verseIndex: row.verse_index,
        snippet: buildSnippet(row.text, query),
    }));
};

// The whole payload. Four independent queries, so they go out together rather
// than one after another — the slowest of them decides the response time
// instead of their sum.
const searchAll = async (userId, query) => {
    const [notes, ideas, topics, scripture] = await Promise.all([
        searchNotes(userId, query),
        searchIdeas(userId, query),
        searchTopics(userId, query),
        searchScripture(query),
    ]);

    return { notes, ideas, topics, scripture };
};

// MySQL 1191 — MATCH ... AGAINST ran against a column with no FULLTEXT index on
// it, which means migration 004 has not been applied. Translated here so the
// route can say so instead of reporting a generic 500 for a deployment step
// somebody skipped.
const isMissingFulltextIndexError = (err) => err && err.code === 'ER_FT_MATCHING_KEY_NOT_FOUND';

module.exports = {
    CONTENT_LIMIT,
    SCRIPTURE_LIMIT,
    searchNotes,
    searchIdeas,
    searchTopics,
    searchScripture,
    searchAll,
    isMissingFulltextIndexError,
};
