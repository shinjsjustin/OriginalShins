const express = require('express');
const db = require('../db/db');

const router = express.Router();

// The books + chapter grid is static reference data: it only changes when the
// scripture importer is re-run, which also restarts the server. A year is the
// longest max-age HTTP defines any meaning for.
//
// `private` rather than `public` — the response itself is translation-wide and
// user-agnostic, but it is served behind isAuth, and a shared/proxy cache must
// never hand an authorized response to a different client.
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const CACHE_CONTROL = `private, max-age=${ONE_YEAR_SECONDS}, immutable`;

// GET /api/books
// The whole 66-book canon plus every chapter's verse count — everything the
// Analyze page's book and chapter picker grids need, in one request.
//
// Shape:
//   { books: [ { id, name, abbrev, testament, chapterCount, canonicalOrder,
//                chapters: [ { number, verseCount } ] } ] }
router.get('/', async (req, res) => {
    try {
        const [bookRows] = await db.execute(
            `SELECT id, name, abbrev, testament, chapter_count, canonical_order
             FROM books
             ORDER BY canonical_order`
        );

        const [chapterRows] = await db.execute(
            `SELECT book_id, number, verse_count
             FROM chapters
             ORDER BY book_id, number`
        );

        if (bookRows.length === 0) {
            // Empty tables mean the importer has not been run — that is a server
            // misconfiguration, not an empty-but-valid result.
            console.error('GET /api/books: books table is empty; run npm run import:scripture');
            return res.status(503).json({ error: 'Scripture data has not been imported' });
        }

        // Group chapters by book in one pass rather than filtering per book.
        const chaptersByBook = chapterRows.reduce((acc, row) => ({
            ...acc,
            [row.book_id]: [
                ...(acc[row.book_id] || []),
                { number: row.number, verseCount: row.verse_count },
            ],
        }), {});

        const books = bookRows.map(row => ({
            id: row.id,
            name: row.name,
            abbrev: row.abbrev,
            testament: row.testament,
            chapterCount: row.chapter_count,
            canonicalOrder: row.canonical_order,
            chapters: chaptersByBook[row.id] || [],
        }));

        res.set('Cache-Control', CACHE_CONTROL);
        res.status(200).json({ books });
    } catch (err) {
        console.error('GET /api/books error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
