// Validation for the JSON bodies the ideas API accepts.
//
// An idea is a note's shape one tier up: a title and a markdown body. It shares
// the notes API's rule that everything is optional at creation, because the
// management UI creates one and lets you fill it in afterwards.
const {
    ok,
    fail,
    isPlainObject,
    parseTextField,
    parseIdList,
    parseNullableId,
    parsePosition,
} = require('./textInput');

// VARCHAR(255) and TEXT, matching the columns in 003_ideas_topics.sql.
const MAX_TITLE_LENGTH = 255;
const MAX_BODY_LENGTH = 65535;

const DEFAULT_TITLE = 'Untitled idea';

const parseTitle = (value, fallback) =>
    parseTextField('title', value, { fallback, maxLength: MAX_TITLE_LENGTH, trim: true });

const parseBody = (value, fallback) =>
    parseTextField('body', value, { fallback, maxLength: MAX_BODY_LENGTH });

// POST /api/ideas — { title?, body? }
const parseCreateIdea = (payload) => {
    if (!isPlainObject(payload)) {
        return fail('request body must be a JSON object');
    }

    const title = parseTitle(payload.title, DEFAULT_TITLE);
    if (title.error) return title;

    const body = parseBody(payload.body, '');
    if (body.error) return body;

    return ok({ title: title.value, body: body.value });
};

// PATCH /api/ideas/:id — a partial update, same rule as a note's: only the
// fields present are written, and naming none of them is an error rather than
// a silent no-op.
const parseUpdateIdea = (payload) => {
    if (!isPlainObject(payload)) {
        return fail('request body must be a JSON object');
    }

    const changes = {};

    if (payload.title !== undefined) {
        const title = parseTitle(payload.title, '');
        if (title.error) return title;
        changes.title = title.value;
    }

    if (payload.body !== undefined) {
        const body = parseBody(payload.body, '');
        if (body.error) return body;
        changes.body = body.value;
    }

    if (Object.keys(changes).length === 0) {
        return fail('request body must contain at least one of: title, body');
    }

    return ok(changes);
};

// PUT /api/ideas/:id/topics — { topicIds: [...] }, the complete link set. An
// empty array files the idea under nothing, which the Topic page shows in its
// "unfiled ideas" bucket rather than treating as an error.
const parseIdeaTopics = (payload) => {
    if (!isPlainObject(payload)) {
        return fail('request body must be a JSON object');
    }
    return parseIdList('topicIds', payload.topicIds);
};

// PUT /api/ideas/:id/notes/order — { noteIds: [...] }, the notes filed under
// this idea in their new order. Writes note_ideas.sort_order, and like every
// order here it names the container's complete membership.
const parseIdeaNoteOrder = (payload) => {
    if (!isPlainObject(payload)) {
        return fail('request body must be a JSON object');
    }
    return parseIdList('noteIds', payload.noteIds);
};

// PUT /api/ideas/:id/topic — { fromTopicId, toTopicId, position? }
//
// One membership, not the set: this is the drag-between-parents move, and it
// names the topic the idea is leaving as well as the one it is joining, so the
// server rewrites exactly one link row. Either side may be null, which is how
// an idea is dragged out of the tree into the unfiled bucket and back again.
//
// The names cross tiers on purpose — from the tree's side a topic contains an
// idea — so they are mapped here onto the container vocabulary src/lib/ordering
// uses, and nothing downstream has to hold both.
const parseIdeaMove = (payload) => {
    if (!isPlainObject(payload)) {
        return fail('request body must be a JSON object');
    }

    const fromTopicId = parseNullableId('fromTopicId', payload.fromTopicId);
    if (fromTopicId.error) return fromTopicId;

    const toTopicId = parseNullableId('toTopicId', payload.toTopicId);
    if (toTopicId.error) return toTopicId;

    const position = parsePosition('position', payload.position);
    if (position.error) return position;

    return ok({
        fromContainerId: fromTopicId.value,
        toContainerId: toTopicId.value,
        position: position.value,
    });
};

module.exports = {
    DEFAULT_TITLE,
    MAX_TITLE_LENGTH,
    MAX_BODY_LENGTH,
    parseCreateIdea,
    parseUpdateIdea,
    parseIdeaTopics,
    parseIdeaNoteOrder,
    parseIdeaMove,
};
