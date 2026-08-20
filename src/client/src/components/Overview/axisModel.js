import { AXIS, LABEL_MIN_GAP, MAX_DETAIL_TIER } from './overviewLayout';

// Pure: turns the GET /api/books payload into every mark the axis draws.
//
// ── Why the index is re-derived here ───────────────────────────────────────
//
// The database stores chapters.start_index / end_index, but /api/books does
// not ship them — it ships each chapter's verseCount, which is what the
// picker grids need. Rather than add an endpoint, the model recomputes the
// index by the same rule the importer used: a running count over the chapters
// of the canon in canonical order (src/scripts/scripture/build-rows.js sets
// verseCount = the chapter's verse row count and endIndex = the running
// total, so the two agree exactly).
//
// This is the only arithmetic on the page that knows books exist. Everything
// downstream — ticks, labels, and every rail's stems and arcs — is placed by
// yForIndex from a verse_index alone.

export { LABEL_MIN_GAP, MAX_DETAIL_TIER } from './overviewLayout';

const AXIS_SPAN = AXIS.bottom - AXIS.top;

/**
 * The y of a verse_index on the axis: linear from verse 1 at the top to the
 * last verse at the bottom, with no per-book term anywhere in it.
 */
export const yForIndex = (verseIndex, totalVerses) => {
    if (totalVerses <= 1) return AXIS.top;
    return AXIS.top + ((verseIndex - 1) / (totalVerses - 1)) * AXIS_SPAN;
};

/**
 * The inverse of yForIndex: the verse_index a y on the axis names.
 *
 * 6c's click-through is what needs it. The reader clicks somewhere along a
 * note's chain, and "which of this note's references is that nearest?" is a
 * question about verse_index, not about pixels. Written as the inverse of the
 * mapping directly above it so the two cannot drift; the answer is not rounded,
 * because it is only ever compared against anchors and rounding it would move
 * the comparison by half a verse for no gain.
 */
export const indexForY = (y, totalVerses) => {
    if (totalVerses <= 1) return 1;
    return 1 + ((y - AXIS.top) / AXIS_SPAN) * (totalVerses - 1);
};

/**
 * The zoom tier at which a label with `gapUnits` of world room becomes
 * legible: the smallest k where gapUnits * 2^k reaches LABEL_MIN_GAP.
 */
export const tierForGap = (gapUnits) => {
    if (!(gapUnits > 0)) return MAX_DETAIL_TIER;

    const tier = Math.ceil(Math.log2(LABEL_MIN_GAP / gapUnits));
    return Math.min(Math.max(tier, 0), MAX_DETAIL_TIER);
};

/**
 * Builds the axis model, or null when the payload cannot describe an axis —
 * no books, or books carrying no chapters to measure. A null model is the
 * page's "nothing to draw" signal; it never divides by a zero verse total.
 */
export const buildAxisModel = (books) => {
    if (!Array.isArray(books) || books.length === 0) return null;

    const counted = countVerses(books);
    if (counted.totalVerses === 0) return null;

    return {
        totalVerses: counted.totalVerses,
        books: withLabelTiers(
            counted.books.map(book => ({
                ...book,
                y: yForIndex(book.startIndex, counted.totalVerses),
            })),
            AXIS.bottom
        ),
        chapters: withLabelTiers(
            counted.chapters.map(chapter => ({
                ...chapter,
                y: yForIndex(chapter.startIndex, counted.totalVerses),
            })),
            AXIS.bottom
        ),
    };
};

/**
 * One pass over the canon, accumulating verse_index as it goes. Books and
 * chapters come out flat and in canonical order, each carrying the span the
 * importer would have given it.
 */
const countVerses = (books) => {
    const countedBooks = [];
    const countedChapters = [];
    let runningIndex = 0;

    for (const book of books) {
        const chapters = Array.isArray(book.chapters) ? book.chapters : [];
        const startIndex = runningIndex + 1;

        for (const chapter of chapters) {
            const verseCount = Number(chapter.verseCount) || 0;

            countedChapters.push({
                key: `${book.id}.${chapter.number}`,
                bookId: book.id,
                number: chapter.number,
                startIndex: runningIndex + 1,
                endIndex: runningIndex + verseCount,
            });

            runningIndex += verseCount;
        }

        countedBooks.push({
            id: book.id,
            name: book.name,
            startIndex,
            endIndex: runningIndex,
        });
    }

    return { totalVerses: runningIndex, books: countedBooks, chapters: countedChapters };
};

/**
 * Assigns each mark the tier its label may appear at, from the distance to
 * the next mark down the axis. The last mark is measured against the foot of
 * the axis, so it is never held back for want of a neighbour.
 */
const withLabelTiers = (marks, axisEnd) =>
    marks.map((mark, position) => {
        const next = marks[position + 1];
        const gap = (next ? next.y : axisEnd) - mark.y;

        return { ...mark, tier: tierForGap(gap) };
    });
