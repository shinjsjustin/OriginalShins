// The Topic page's other query-string contract: which row a link into the tree
// wants brought into view.
//
// /topics-tree?topic=3          — open topic 3, highlight it
// /topics-tree?topic=3&idea=7   — open topic 3, highlight idea 7 inside it
// /topics-tree?idea=7           — open the unfiled ideas bucket, highlight 7
//
// It exists because search results for an idea and a topic have to land
// somewhere, and the tree is where those two tiers live. Written here rather
// than in the search page for the same reason analyzeUrl.js is not written in
// the tree: the page that reads a param owns the name of it.
//
// Pure. Building a link needs no state, and reading one back needs only the
// params the router already parsed.

export const TOPIC_PARAM = 'topic';
export const IDEA_PARAM = 'idea';

const TREE_PATH = '/topics-tree';

export const treeUrlForTopic = (topicId) => `${TREE_PATH}?${TOPIC_PARAM}=${topicId}`;

// An idea is reached through the topic it is filed under, because that is where
// its row is: the tree has no flat list of ideas. `topicId` of null is not a
// missing argument but the other real case — an idea filed under no topic sits
// in the unfiled bucket, and that is the row to open.
export const treeUrlForIdea = (ideaId, topicId = null) => (topicId === null
    ? `${TREE_PATH}?${IDEA_PARAM}=${ideaId}`
    : `${TREE_PATH}?${TOPIC_PARAM}=${topicId}&${IDEA_PARAM}=${ideaId}`);

// A param that is absent, malformed or not a positive integer focuses nothing.
// The page still renders — a stale link from a deleted topic must show the tree
// rather than an error.
const parseId = (value) => {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
        return null;
    }
    const id = Number(value);
    return id >= 1 ? id : null;
};

// Reads both params off a URLSearchParams into the ids the page focuses on.
export const focusFromParams = (searchParams) => ({
    topicId: parseId(searchParams.get(TOPIC_PARAM)),
    ideaId: parseId(searchParams.get(IDEA_PARAM)),
});
