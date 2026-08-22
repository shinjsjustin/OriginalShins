// Which ideas belong to the chapter under study, and the order the note editor
// offers every idea in.
//
// Both are pure derivations over lists Analyze already holds, and both are
// needed in two places at once — the panel's "Ideas in this chapter" section
// and the editor's picker are the same judgement rendered twice — so they live
// here rather than being worked out inline where they happen to be read.

// The two halves of the editor's picker. Exported because the tests name them
// and because a heading spelled twice is a heading that drifts.
export const IN_CHAPTER_HEADING = 'In this chapter';
export const OTHER_IDEAS_HEADING = 'Other ideas';

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

// The picker's shape: an id and the label to show. The editor never sees an
// idea's body, so this is everything it needs.
const toOption = (idea) => ({ id: idea.id, label: idea.title });

/**
 * Every idea, offered to the note editor with this chapter's first.
 *
 * A note written here is usually filed under an idea imported here, so those
 * go at the top under a heading. The rest stay below and stay checkable: an
 * idea is not confined to the chapters it has been imported into, and a picker
 * that hid the others would make filing a note under anything else impossible
 * rather than merely less likely.
 *
 * With nothing imported there is no top group and no heading either — one
 * ungrouped list, exactly what a reader who has never imported anything sees.
 *
 * @returns [{ heading?, options: [{ id, label }] }] for MultiSelect
 */
export const groupIdeaOptions = (ideas = [], chapterIdeas = []) => {
    const here = new Set(chapterIdeas.map(idea => idea.id));
    const rest = ideas.filter(idea => !here.has(idea.id)).map(toOption);

    if (chapterIdeas.length === 0) {
        return [{ options: rest }];
    }

    return [
        { heading: IN_CHAPTER_HEADING, options: chapterIdeas.map(toOption) },
        ...(rest.length > 0 ? [{ heading: OTHER_IDEAS_HEADING, options: rest }] : []),
    ];
};
