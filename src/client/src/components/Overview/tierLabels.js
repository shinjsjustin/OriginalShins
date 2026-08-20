import { describeReference } from '../Analyze/navigation';

// Pure: one label tier of /api/overview -> what the page says about a group.
//
// A group is a note, an idea or a topic, and all three ship the same shape —
// [groupId, title, references] — because all three are collections of the same
// note references. So one module reads all three label tiers, and the tooltip
// that prints them does not know which rail it is over.
//
// ── Why the server ships this and the client formats it ────────────────────
//
// The split is along the line of what each side knows. Only the database knows
// that note 17's second reference covers Romans 5:1-5, so the tuple
// [anchor, bookId, chapter, startVerse, endVerse] comes over the wire. Only the
// client knows that book 45 is called "Romans" — it has the canon loaded for
// the axis already — so the name is joined on here rather than repeated a few
// thousand times in the payload. describeReference is the Analyze page's own
// formatter, reused so a reference reads identically in a tooltip, in the
// drawer and in the note editor.
//
// ── Shape ──────────────────────────────────────────────────────────────────
//
// A Map keyed by group id, one per rail. The lookup happens on hover, from an
// id read off a DOM attribute, and it happens for one group at a time — which
// is a Map, not a scan of a few thousand entries. Per rail rather than one map
// for everything, because note 7 and topic 7 are different things and a single
// map would have to key on a composed string to say so.

// What a group with no title of its own is called, by rail. A note and an idea
// may legally have no title, and a tooltip that opens with a blank line is a
// tooltip that looks broken. A topic's name is required, so it has no case
// here beyond the fallback.
export const UNTITLED = 'Untitled note';

const UNTITLED_BY_RAIL = {
    notes: UNTITLED,
    ideas: 'Untitled idea',
    topics: 'Untitled topic',
};

// Semicolons rather than commas: a reference already contains a comma's worth
// of punctuation, and "Romans 5:1–5, Hebrews 11:1" reads as one reference with
// a stutter in it.
const REFERENCE_SEPARATOR = '; ';

// How many references a tooltip prints before it stops counting them out.
//
// On the notes rail this is almost never reached — a note has a handful of
// references. On the topics rail it always is: a topic gathers every reference
// of every note under every one of its ideas, and a tooltip listing four
// hundred passages is a wall of text that covers the diagram it is describing.
// So the summary names the first few and says how many more there are, which
// is the thing a reader can actually use.
export const MAX_SUMMARY_REFERENCES = 6;

// One [anchor, bookId, chapter, startVerse, endVerse] tuple, or null if the
// entry is not one. Every field is used to place or to print, so a partial
// tuple has nothing to contribute and is dropped rather than rendered as NaN.
const asReferenceTuple = (entry) => {
    if (!Array.isArray(entry) || entry.length < 5) return null;
    if (!entry.slice(0, 5).every(Number.isInteger)) return null;

    const [anchor, bookId, chapter, startVerse, endVerse] = entry;
    return { anchor, bookId, chapter, startVerse, endVerse };
};

// One [groupId, title, references] entry, or null.
const asLabelEntry = (entry, untitled) => {
    if (!Array.isArray(entry) || entry.length < 3) return null;

    const [groupId, title, references] = entry;
    if (!Number.isInteger(groupId) || !Array.isArray(references)) return null;

    return {
        groupId,
        title: typeof title === 'string' && title.trim() !== '' ? title : untitled,
        references,
    };
};

/** The first few reference labels, and how many were left unnamed. */
const summarize = (references) => {
    const named = references.slice(0, MAX_SUMMARY_REFERENCES)
        .map(reference => reference.label)
        .join(REFERENCE_SEPARATOR);

    const remaining = references.length - MAX_SUMMARY_REFERENCES;
    return remaining > 0 ? `${named} · and ${remaining} more` : named;
};

/**
 * One label tier -> Map from group id to { title, references, summary }.
 *
 * `references` carry the `label` each one prints as, and `summary` is the
 * first few of those labels joined — the line under the title in a tooltip.
 * Both are computed once at load rather than per hover: the canon and the
 * payload each change once, at mount, and a pointer crossing a dense rail
 * should not be formatting strings.
 *
 * @param tier  one label tier of the payload
 * @param books the canon, from /api/books, for the book names
 * @param rail  which rail it belongs to, for what an untitled group is called
 */
export const buildLabels = (tier, books, rail = 'notes') => {
    if (!Array.isArray(tier)) return new Map();

    const untitled = UNTITLED_BY_RAIL[rail] || UNTITLED;

    return new Map(tier.flatMap(entry => {
        const label = asLabelEntry(entry, untitled);
        if (!label) return [];

        const references = label.references
            .map(asReferenceTuple)
            .filter(Boolean)
            .map(reference => ({
                ...reference,
                label: describeReference(books, reference),
            }));

        return [[label.groupId, {
            groupId: label.groupId,
            title: label.title,
            references,
            summary: summarize(references),
        }]];
    }));
};

/**
 * The reference whose anchor is closest to `verseIndex`, or null when the
 * group has none.
 *
 * This is what turns a click on an arc into a destination: the reader clicked
 * somewhere along a chain, the nearest anchor is worked out from the click's y,
 * and the reference that anchor came from is the chapter /analyze opens at. It
 * earns most on the upper rails, where a topic's chain can run the height of
 * the canon and its first reference says nothing about where the reader was
 * pointing.
 *
 * Ties go to the earlier reference, which is the canonically earlier one — the
 * query that built the tier ordered it by start_index. A tie is two references
 * whose ranges share a midpoint, which is ordinary: 45:1-5 and 45:2-4 both
 * anchor at 45:3.
 */
export const nearestReference = (label, verseIndex) => {
    if (!label || label.references.length === 0) return null;
    if (!Number.isFinite(verseIndex)) return label.references[0];

    return label.references.reduce((closest, reference) =>
        Math.abs(reference.anchor - verseIndex) < Math.abs(closest.anchor - verseIndex)
            ? reference
            : closest);
};
