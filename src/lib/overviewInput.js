// Validation for the two query params GET /api/overview takes.
//
// It sits beside the other *Input modules and returns the same { value } /
// { error } result they do, so the route stays flat and every rejection
// carries a message specific enough to act on.
//
// ── Why the endpoint has a query string at all ─────────────────────────────
//
// Through 6c there was one answer to this question, so there was nothing to
// parse. 6d puts three tiers on the wire instead of one, and the plan's
// surface — /api/overview?tiers=&topicId=&q= — exists for two reasons the
// phase makes real:
//
//   • `tiers` is what a rail toggle costs. The reader who has turned the
//     topics rail off should not be paying for the topics tier on the next
//     load, and the tier they turned off is the widest join of the three.
//   • `topicId` is the plan's answer to its own open question 2, the
//     cross-testament noise: a topic like "Faith" spans nearly the full height
//     of the canon, and enough of those read as static. Restricting every tier
//     to one topic is the "filter to one topic" it asks to plan for.
//
// `q` belongs to 6e and is not parsed here: an unknown param is ignored rather
// than refused, so a link written for a later phase still renders today.
const { fail, ok } = require('./textInput');
const { MAX_ROW_ID, parsePositiveInt } = require('./params');

// The tiers, in the order the plan gives them and the order the rails are
// drawn in. Frozen because it is also the answer to "what may `tiers` name?"
// and a caller must not be able to widen it.
const TIER_KEYS = Object.freeze(['notes', 'ideas', 'topics']);

const SEPARATOR = ',';

// Parses ?tiers=notes,ideas. Absent means all three — the page's own default,
// and the answer that was correct before this param existed, so a client
// written for 6c gets exactly what it got then.
//
// An empty list is refused rather than answered with an empty object: a client
// that wants no tiers has no reason to make the request, so `?tiers=` is far
// more likely to be a bug in how the string was built than an intention.
const parseTiers = (value) => {
    if (value === undefined) {
        return ok([...TIER_KEYS]);
    }
    if (Array.isArray(value)) {
        return fail('tiers must be given once');
    }
    if (typeof value !== 'string') {
        return fail('tiers must be a comma-separated list');
    }

    const named = value.split(SEPARATOR).map(tier => tier.trim()).filter(Boolean);
    if (named.length === 0) {
        return fail(`tiers must name at least one of ${TIER_KEYS.join(SEPARATOR)}`);
    }

    const unknown = named.find(tier => !TIER_KEYS.includes(tier));
    if (unknown !== undefined) {
        return fail(`tiers may only name ${TIER_KEYS.join(SEPARATOR)}`);
    }

    // Returned in the canonical order rather than the order asked for, and
    // deduplicated: the response is an object whose keys have no order, and
    // ?tiers=ideas,notes and ?tiers=notes,ideas are the same request. Making
    // them the same VALUE is what lets the two share a cache entry.
    return ok(TIER_KEYS.filter(tier => named.includes(tier)));
};

// Parses ?topicId=. Absent means the whole corpus; present, it must look like
// a row id. Whether that row exists and belongs to the caller is checked by
// the route against the database, not here.
const parseTopicId = (value) => {
    if (value === undefined) {
        return ok(null);
    }
    if (Array.isArray(value)) {
        return fail('topicId must be given once');
    }

    const topicId = parsePositiveInt(value, MAX_ROW_ID);
    return topicId === null ? fail('topicId must be a positive integer') : ok(topicId);
};

/** The whole query string -> { tiers, topicId }, or the first refusal. */
const parseOverviewQuery = (query = {}) => {
    const tiers = parseTiers(query.tiers);
    if (tiers.error) {
        return tiers;
    }

    const topicId = parseTopicId(query.topicId);
    if (topicId.error) {
        return topicId;
    }

    return ok({ tiers: tiers.value, topicId: topicId.value });
};

module.exports = {
    TIER_KEYS,
    parseTiers,
    parseTopicId,
    parseOverviewQuery,
};
