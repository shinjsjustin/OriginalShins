// Validation for the JSON bodies the topics API accepts.
//
// A topic differs from a note and an idea in one way that matters: it has a
// slug, and the slug is part of a UNIQUE (user_id, slug) key. So unlike a
// title, a name cannot be blank — there would be nothing to derive an identity
// from — and whatever slug the client sends is re-derived here before it is
// written.
const {
    ok,
    fail,
    isPlainObject,
    parseTextField,
    parseRequiredTextField,
    parseIdList,
} = require('./textInput');
const { MAX_SLUG_LENGTH, slugify, isValidSlug } = require('./slug');

const MAX_NAME_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 65535;

const parseName = (value, fallback) =>
    parseRequiredTextField('name', value, { fallback, maxLength: MAX_NAME_LENGTH, trim: true });

const parseDescription = (value, fallback) =>
    parseTextField('description', value, { fallback, maxLength: MAX_DESCRIPTION_LENGTH });

// The client generates the slug from the name as you type; this is the same
// rule applied again server-side. A slug the client omitted is derived from the
// name, and one it sent is normalized rather than taken at face value — so a
// hand-edited "Faith & Works" still lands as "faith-works".
const parseSlug = (value, name) => {
    if (value === undefined || value === null || value === '') {
        const derived = slugify(name);
        return derived.length === 0
            ? fail('name must contain at least one letter or number')
            : ok(derived);
    }

    if (typeof value !== 'string') {
        return fail('slug must be a string');
    }
    if (value.length > MAX_SLUG_LENGTH) {
        return fail(`slug must be ${MAX_SLUG_LENGTH} characters or fewer`);
    }

    const normalized = isValidSlug(value) ? value : slugify(value);
    return normalized.length === 0
        ? fail('slug must contain at least one letter or number')
        : ok(normalized);
};

// POST /api/topics — { name, slug?, description? }
const parseCreateTopic = (payload) => {
    if (!isPlainObject(payload)) {
        return fail('request body must be a JSON object');
    }

    const name = parseName(payload.name, '');
    if (name.error) return name;

    const slug = parseSlug(payload.slug, name.value);
    if (slug.error) return slug;

    const description = parseDescription(payload.description, '');
    if (description.error) return description;

    return ok({ name: name.value, slug: slug.value, description: description.value });
};

// PATCH /api/topics/:id — a partial update.
//
// Renaming does NOT silently re-slug: the slug may already be in a URL someone
// saved, so changing it is an explicit act. The management UI sends both fields
// when it wants both changed.
const parseUpdateTopic = (payload) => {
    if (!isPlainObject(payload)) {
        return fail('request body must be a JSON object');
    }

    const changes = {};

    if (payload.name !== undefined) {
        const name = parseName(payload.name, '');
        if (name.error) return name;
        changes.name = name.value;
    }

    if (payload.slug !== undefined) {
        // With no name in the patch there is nothing to derive from, so an
        // empty slug here is a rejection rather than a re-derivation.
        const slug = parseSlug(payload.slug, changes.name || '');
        if (slug.error) return slug;
        changes.slug = slug.value;
    }

    if (payload.description !== undefined) {
        const description = parseDescription(payload.description, '');
        if (description.error) return description;
        changes.description = description.value;
    }

    if (Object.keys(changes).length === 0) {
        return fail('request body must contain at least one of: name, slug, description');
    }

    return ok(changes);
};

// PUT /api/topics/order — { topicIds: [...] }, the complete ordered list.
//
// An order is sent whole for the same reason a link set is: the tree holds the
// entire list on screen, so it can name the entire list, and a partial one
// would renumber part of a run and leave the rest at stale positions.
const parseTopicOrder = (payload) => {
    if (!isPlainObject(payload)) {
        return fail('request body must be a JSON object');
    }
    return parseIdList('topicIds', payload.topicIds);
};

// PUT /api/topics/:id/ideas/order — { ideaIds: [...] }, the ideas filed under
// this topic in their new order. It writes idea_topics.sort_order, so it moves
// them within this topic only: the same idea under another topic keeps the
// place it has there.
const parseTopicIdeaOrder = (payload) => {
    if (!isPlainObject(payload)) {
        return fail('request body must be a JSON object');
    }
    return parseIdList('ideaIds', payload.ideaIds);
};

module.exports = {
    MAX_NAME_LENGTH,
    MAX_DESCRIPTION_LENGTH,
    parseCreateTopic,
    parseUpdateTopic,
    parseTopicOrder,
    parseTopicIdeaOrder,
};
