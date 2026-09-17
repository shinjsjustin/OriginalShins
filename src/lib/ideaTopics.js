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

// An idea and a topic may only be linked when they are in the same book. Both
// tables carry a book_id, so the rule is one comparison — asked here, in the
// seam that already owns this pair, rather than in src/lib/links.js, whose
// other two specs link notes and a note has no book.
//
// Takes a connection so the caller can ask it inside the transaction that does
// the write, exactly as the ownership checks are. It counts MISMATCHES rather
// than matches, and is scoped to the user, so a topic id that names nothing —
// or someone else's row — contributes nothing here and is left to the
// ownership check to refuse in its own words.
const hasTopicOutsideIdeaBook = async (connection, userId, ideaId, topicIds) => {
    if (topicIds.length === 0) {
        return false;
    }

    const placeholders = topicIds.map(() => '?').join(', ');
    const [rows] = await connection.execute(
        `SELECT COUNT(*) AS mismatched
         FROM topics t
         JOIN ideas i ON i.id = ? AND i.user_id = ?
         WHERE t.id IN (${placeholders}) AND t.user_id = ? AND t.book_id <> i.book_id`,
        [ideaId, userId, ...topicIds, userId]
    );

    return Number(rows[0].mismatched) > 0;
};

// One flat query for the whole list rather than one per idea, because the
// callers that load a list load a whole one: GET /api/ideas, both scoped to a
// book for the Thoughts canvas and unscoped for Analyze's chapter shortlist.
// The single-row callers — GET, PATCH and PUT /api/ideas/:id — come through
// here too, hydrating a one-idea array, so an idea carries its topics the same
// way whichever endpoint returned it.
const withTopics = async (userId, ideas) => {
    const links = await findTopicsForIdeas(userId, ideas.map(idea => idea.id));

    const byIdeaId = links.reduce((acc, link) => ({
        ...acc,
        [link.ideaId]: [...(acc[link.ideaId] || []), { id: link.id, name: link.name, slug: link.slug }],
    }), {});

    return ideas.map(idea => ({ ...idea, topics: byIdeaId[idea.id] || [] }));
};

module.exports = { hasTopicOutsideIdeaBook, withTopics };
