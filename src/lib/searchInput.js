// Validation for the one input GET /api/search takes.
//
// It sits beside the other *Input modules and returns the same { value } /
// { error } result they do, even though there is a single field to check: the
// route stays flat, and the rejection carries a message the search box can put
// in front of the reader unchanged.
const { fail, ok } = require('./textInput');

// Two characters, not one: a single character matches most of a user's rows and
// the endpoint would be answering "give me everything" through a cap.
//
// It is not three, which is what InnoDB's default innodb_ft_min_token_size
// would suggest — a two-character term still matches note titles, idea bodies
// and topic names through LIKE. It only means the scripture group comes back
// empty, which is a property of that index rather than a bad request.
const MIN_QUERY_LENGTH = 2;

// Nothing legitimate is longer, and a bounded term keeps both the LIKE scan and
// the fulltext parse bounded with it.
const MAX_QUERY_LENGTH = 100;

// Parses ?q=. Express hands back undefined for an absent param and an array for
// a repeated one, so both are named rather than falling through to a generic
// "invalid" that leaves the caller guessing which it was.
const parseSearchQuery = (value) => {
    if (Array.isArray(value)) {
        return fail('q must be given once');
    }
    if (typeof value !== 'string') {
        return fail('q is required');
    }

    const query = value.trim();
    if (query.length === 0) {
        return fail('q is required');
    }
    if (query.length < MIN_QUERY_LENGTH) {
        return fail(`q must be at least ${MIN_QUERY_LENGTH} characters`);
    }
    if (query.length > MAX_QUERY_LENGTH) {
        return fail(`q must be ${MAX_QUERY_LENGTH} characters or fewer`);
    }

    return ok(query);
};

module.exports = {
    MIN_QUERY_LENGTH,
    MAX_QUERY_LENGTH,
    parseSearchQuery,
};
