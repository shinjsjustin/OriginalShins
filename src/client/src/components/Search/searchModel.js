import { analyzeUrlForChapter, analyzeUrlForNote } from '../Analyze/analyzeUrl';
import { treeUrlForIdea, treeUrlForTopic } from '../Topics/treeFocus';

// The search page as data: what the four groups are called, what a row of each
// one reads as, and — the part worth testing on its own — where clicking it
// goes.
//
// Nothing here fetches or renders. A result is a row from a table the reader
// already has a page for, so every destination is an existing URL with an
// existing meaning, and this module is where the four are chosen rather than
// four link expressions scattered through the JSX.

// The client half of the server's minimum. Like Library/slug.js it is a
// convenience for the input — it stops a one-character query from becoming a
// request the server will refuse — and never the authority: searchInput.js
// checks the same thing again on the way in.
export const MIN_QUERY_LENGTH = 2;

export const isSearchable = (query) => query.trim().length >= MIN_QUERY_LENGTH;

// What the page shows before anything has been asked for, and what it falls
// back to when a request fails. One shape means the render never has to ask
// whether a group is missing or merely empty.
export const EMPTY_RESULTS = Object.freeze({
    notes: [],
    ideas: [],
    topics: [],
    scripture: [],
});

// An idea's row lives under a topic in the tree, so a link to it needs one.
// An idea filed under several is opened under the first — any of them shows the
// idea, and picking the first is the one rule that needs no explaining. Filed
// under none, it is in the unfiled bucket, which `treeUrlForIdea` takes null
// for.
const firstTopicIdOf = (idea) => {
    const topics = idea.topics || [];
    return topics.length === 0 ? null : topics[0].id;
};

// The four groups, in the order the page renders them: the reader's own writing
// first — that is what the plan means by "notes, ideas and topics first" — and
// scripture, which is the same for everybody, last.
export const GROUPS = Object.freeze([
    {
        key: 'notes',
        heading: 'Notes',
        // A note with no title is a legal row; the editor calls it this too.
        titleOf: (note) => note.title || 'Untitled note',
        detailOf: (note) => note.snippet,
        keyOf: (note) => note.id,
        // Straight into the editor, at the chapter of the note's first anchor.
        linkOf: (note) => analyzeUrlForNote(note),
    },
    {
        key: 'ideas',
        heading: 'Ideas',
        titleOf: (idea) => idea.title || 'Untitled idea',
        detailOf: (idea) => idea.snippet,
        keyOf: (idea) => idea.id,
        linkOf: (idea) => treeUrlForIdea(idea.id, firstTopicIdOf(idea)),
    },
    {
        key: 'topics',
        heading: 'Topics',
        titleOf: (topic) => topic.name,
        detailOf: (topic) => topic.snippet,
        keyOf: (topic) => topic.id,
        linkOf: (topic) => treeUrlForTopic(topic.id),
    },
    {
        key: 'scripture',
        heading: 'Scripture',
        titleOf: (verse) => `${verse.bookName} ${verse.chapter}:${verse.verse}`,
        detailOf: (verse) => verse.snippet,
        // Verses are the one group whose rows carry no id of their own here.
        // verse_index is the app's whole-Bible key and is unique by definition.
        keyOf: (verse) => verse.verseIndex,
        // The left scripture panel, on that chapter. Not the verse: the panel
        // renders a chapter at a time, and ?l= is the format it already reads.
        linkOf: (verse) => analyzeUrlForChapter(verse.bookId, verse.chapter),
    },
]);

// The payload, reduced to the four arrays the page renders. A group the server
// left out becomes an empty list rather than undefined — this is a boundary,
// and the render below it should not have to defend itself.
export const resultsFrom = (payload) => GROUPS.reduce((acc, group) => ({
    ...acc,
    [group.key]: Array.isArray(payload && payload[group.key]) ? payload[group.key] : [],
}), {});

export const totalResults = (results) =>
    GROUPS.reduce((total, group) => total + results[group.key].length, 0);
