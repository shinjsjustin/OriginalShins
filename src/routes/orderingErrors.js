// Turns the results src/lib/ordering.js returns into HTTP responses.
//
// Five handlers across three route files perform an ordering or a move, and all
// five refuse a request in exactly the same four ways. The mapping lives here
// so a stale reorder cannot answer 409 on one route and 400 on another, and so
// the status codes stay out of the query module that produced the constants.
const {
    MISSING_CONTAINER,
    MISSING_MEMBER,
    STALE_MEMBERSHIP,
    NOTHING_TO_MOVE,
} = require('../lib/ordering');

// `labels` names the two tiers in the caller's own words — { container: 'Topic',
// member: 'Idea' } — so the message says what the client asked about rather than
// leaking the tree module's container/member vocabulary into the API.
const RESPONSES = {
    // A row that is not the caller's is answered exactly like one that never
    // existed, the same rule every other read and write in this API follows.
    [MISSING_CONTAINER]: (labels) => ({ status: 404, error: `${labels.container} not found` }),
    [MISSING_MEMBER]: (labels) => ({ status: 404, error: `${labels.member} not found` }),

    // The client sent an order for a set the server no longer holds — something
    // was created, filed or unfiled since its last read. 409, not 400: the
    // request was well formed and would have been right a moment ago, and the
    // fix is to reload the branch rather than to correct the body.
    //
    // Worded without either label, because the same answer covers a topic whose
    // ideas moved and the root list itself, where there is no container to name.
    [STALE_MEMBERSHIP]: () => ({
        status: 409,
        error: 'That list has changed since you loaded it. Reload and try again.',
    }),

    // Both ends of a move were null, which describes no movement at all.
    [NOTHING_TO_MOVE]: (labels) => ({
        status: 400,
        error: `A move must name a ${labels.container.toLowerCase()} to leave, to join, or both`,
    }),
};

// Sends the response for `error`, or 500 for a constant nothing here knows —
// which would mean ordering.js grew a failure this file was not taught about,
// and is a bug rather than a client mistake.
const respondToOrderingError = (res, error, labels) => {
    const build = RESPONSES[error];
    if (!build) {
        console.error('Unmapped ordering error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }

    const { status, error: message } = build(labels);
    return res.status(status).json({ error: message });
};

module.exports = { respondToOrderingError };
