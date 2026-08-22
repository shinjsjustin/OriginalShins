// Attaching each idea's topics to a list of ideas.
//
// Composition rather than a table of its own: src/lib/ideas.js reads `ideas`,
// src/lib/topics.js reads `topics`, and neither requires the other, which is
// what keeps the two link directions from turning into a circular import. This
// module is the seam where the two tiers meet, so every endpoint that returns
// ideas can hydrate them identically without either tier learning about the
// other. It lives here rather than inside one router because more than one
// router now serves ideas — /api/ideas and /api/chapter-ideas — and an idea
// hydrated two slightly different ways is two shapes for the client to hold.
const { findTopicsForIdeas } = require('./topics');

// One flat query for the whole list rather than one per idea: every caller
// loads a list at a time — the management page, the note editor's multi-select,
// and the Analyze panel's imported set.
const withTopics = async (userId, ideas) => {
    const links = await findTopicsForIdeas(userId, ideas.map(idea => idea.id));

    const byIdeaId = links.reduce((acc, link) => ({
        ...acc,
        [link.ideaId]: [...(acc[link.ideaId] || []), { id: link.id, name: link.name, slug: link.slug }],
    }), {});

    return ideas.map(idea => ({ ...idea, topics: byIdeaId[idea.id] || [] }));
};

module.exports = { withTopics };
