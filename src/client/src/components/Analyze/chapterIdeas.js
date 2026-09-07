// Which ideas belong to the chapter under study.
//
// A pure derivation over lists Analyze already holds, and needed in one place
// — the panel's "Ideas in this chapter" section. It lives here rather than
// inline because it is a judgement about what belongs to a chapter, not about
// how a list is drawn.
//
// It used to have a companion that ordered the note editor's picker with
// this chapter's ideas first. That picker is now a field of bubbles laid out
// by TOPIC, and a chapter is not a topic — there is no cell in that field for
// "here". The ordering went with it deliberately; the shortlist below is
// still where a chapter's own ideas are seen.

/**
 * The ideas this chapter holds: the ones imported into it, followed by the
 * ones that arrived by way of a note anchored here.
 *
 * Two ways in rather than one, because an idea can reach a chapter from either
 * end. Importing pins it before anything is written, which is what makes the
 * shortlist useful on an empty chapter; filing a note under an idea puts that
 * idea in the chapter whether or not anyone imported it, and a section that
 * omitted those would be a list of ideas in this chapter that leaves out ideas
 * in this chapter.
 *
 * Imports come first and in their stored order — that order is the reader's
 * own, and the note links behind them are in whatever order the notes happen
 * to be in. An idea reached both ways appears once, at its imported position.
 *
 * A note's link row carries an id and a title and no body, so `ideas` is
 * consulted for the full record; the link row stands in only while that list
 * is still loading, which costs the row its excerpt and nothing else.
 *
 * @param imported  GET /api/chapter-ideas — full idea records
 * @param notes     the chapter's notes, each carrying its `ideas` link rows
 * @param ideas     every idea the reader has, for hydrating a link row
 */
export const collectChapterIdeas = (imported = [], notes = [], ideas = []) => {
    const known = new Map();
    [...ideas, ...imported].forEach(idea => known.set(idea.id, idea));

    const collected = [];
    const seen = new Set();

    const take = (row) => {
        if (seen.has(row.id)) return;
        seen.add(row.id);
        collected.push(known.get(row.id) || row);
    };

    imported.forEach(take);
    notes.forEach(note => (note.ideas || []).forEach(take));

    return collected;
};
