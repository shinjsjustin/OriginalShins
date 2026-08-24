// The scripture behind a note's anchors.
//
// `note_references` stores WHERE a note is anchored and never WHAT the passage
// says: the text lives in `verses`, it is the same for every reader, and it is
// reached by joining the reference's index range to it. This module is the only
// place that join is written.
//
// ── Why the text is not simply part of the reference shape ─────────────────
//
// Every payload that carries references carries a lot of them — a chapter's
// notes, the editor's anchor list, the Overview drawer — and not one of those
// prints scripture. They print "John 3:16–18". Hanging the verses off
// references.js's mapper would put chapters of prose into payloads that show a
// label, for every reader on every navigation. The Thoughts page is the one
// place a note's passage is actually READ, so it is the one caller that asks,
// and it asks by itself.
//
// ── The range is the index range, never the verse numbers ─────────────────
//
// start_index / end_index are the denormalized `verse_index` bounds
// references.js resolved when the anchor was written, so they already account
// for the verses this translation omits — a reference stored as 36..38 over a
// gap covers exactly the rows that exist. Selecting BETWEEN those two is
// therefore the whole passage and nothing else, with no per-verse arithmetic
// here to get wrong.
const db = require('../db/db');
const { findReferencesForNotes } = require('./references');

// One statement for every range, rather than one per reference. A note with
// four anchors is four ORs, not four round trips — and the ranges may overlap
// without consequence, since each is bucketed back out of the result below.
//
// The book name rides along on each row because the card that shows a passage
// prints "Genesis 1:3–5" above it, and a second query for 66 static rows to
// learn one name is a round trip spent on nothing.
const findVersesInRanges = async (ranges) => {
    if (ranges.length === 0) {
        return [];
    }

    const clauses = ranges.map(() => '(v.verse_index BETWEEN ? AND ?)').join(' OR ');
    const params = ranges.flatMap(range => [range.startIndex, range.endIndex]);

    const [rows] = await db.execute(
        `SELECT v.verse, v.verse_index, v.text, b.name AS book_name
         FROM verses v
         JOIN books b ON b.id = v.book_id
         WHERE ${clauses}
         ORDER BY v.verse_index`,
        params
    );

    return rows.map(row => ({
        verse: row.verse,
        verseIndex: row.verse_index,
        text: row.text,
        bookName: row.book_name,
    }));
};

// Whether a verse falls inside one reference's range. The bounds are inclusive
// on both ends: end_index is the last verse of the anchor, not one past it.
const covers = (reference, verse) =>
    verse.verseIndex >= reference.startIndex && verse.verseIndex <= reference.endIndex;

/**
 * Every anchor of these notes, each with the verses it covers.
 *
 * Takes a list rather than one note because its caller wants a whole idea's
 * worth at once: the Thoughts page opens an idea into ~20 notes and draws all
 * of their passages on one canvas. Twenty notes are therefore two queries here
 * and one request over the wire, not twenty of each.
 *
 * Ownership is established by findReferencesForNotes, which joins to `notes`
 * and filters on user_id — a note belonging to someone else yields no
 * references here rather than someone else's scripture with someone else's
 * label. Callers still check the parent exists, because "no anchors" and "not
 * yours" are the same empty list and only one of them is a 404.
 *
 * @returns [{ id, noteId, bookId, chapter, startVerse, endVerse, startIndex,
 *             endIndex, sortOrder, bookName, verses: [{ verse, verseIndex, text }] }]
 *          note by note, in each note's own anchor order
 */
const findPassagesForNotes = async (userId, noteIds) => {
    const references = await findReferencesForNotes(userId, noteIds);
    if (references.length === 0) {
        return [];
    }

    const verses = await findVersesInRanges(references);

    return references.map(reference => {
        const covered = verses.filter(verse => covers(reference, verse));

        return {
            ...reference,
            // Taken off the verses rather than looked up separately, so a
            // reference and the text under it can never disagree about which
            // book they are in. Null only when the range covers nothing at
            // all, which the client renders as the reference's book id.
            bookName: covered.length > 0 ? covered[0].bookName : null,
            verses: covered.map(({ verse, verseIndex, text }) => ({ verse, verseIndex, text })),
        };
    });
};

module.exports = { findVersesInRanges, findPassagesForNotes };
