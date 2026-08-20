// The validation primitives every JSON body in this API is built from.
//
// Each parser returns either { value } or { error } — a discriminated result
// rather than a throw, so route handlers stay flat and every rejection carries
// a message specific enough to act on. Notes, ideas and topics all carry the
// same kind of user-authored text, so the rules live here once instead of being
// restated (and drifting) in each feature's input module.
const { MAX_ROW_ID, parsePositiveIntField } = require('./params');

const ok = (value) => ({ value });
const fail = (error) => ({ error });

const isPlainObject = (value) =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

// One optional text field. Absent means "use the fallback"; present-but-empty
// is kept, because clearing a title or a description is a legitimate edit and
// not a request to restore a default.
const parseTextField = (name, value, { fallback, maxLength, trim = false }) => {
    if (value === undefined) {
        return ok(fallback);
    }
    if (typeof value !== 'string') {
        return fail(`${name} must be a string`);
    }

    const text = trim ? value.trim() : value;
    if (text.length > maxLength) {
        return fail(`${name} must be ${maxLength} characters or fewer`);
    }

    return ok(text);
};

// Same, but the field must end up non-empty. A topic's name is its identity —
// the slug is derived from it — so a blank one has nothing to fall back on.
const parseRequiredTextField = (name, value, options) => {
    const parsed = parseTextField(name, value, options);
    if (parsed.error) {
        return parsed;
    }
    if (parsed.value.length === 0) {
        return fail(`${name} is required`);
    }
    return parsed;
};

// A link table is replaced by sending its full membership, so the id list is
// the entire request body of PUT /api/notes/:id/ideas and its sibling. An empty
// array is valid and means "unlink everything" — the one call that leaves a
// legal orphan behind, so it must never be mistaken for a missing field.
const MAX_LINKED_IDS = 200;

const parseIdList = (name, value) => {
    if (!Array.isArray(value)) {
        return fail(`${name} must be an array of ids`);
    }
    if (value.length > MAX_LINKED_IDS) {
        return fail(`${name} must contain ${MAX_LINKED_IDS} ids or fewer`);
    }

    const ids = [];
    for (const entry of value) {
        const id = parsePositiveIntField(entry, MAX_ROW_ID);
        if (id === null) {
            return fail(`${name} must contain only positive integer ids`);
        }
        // Duplicates would collide on the link table's composite primary key.
        // The set is a set; silently deduplicating it is closer to what the
        // multi-select meant than a 400 would be.
        if (!ids.includes(id)) {
            ids.push(id);
        }
    }

    return ok(ids);
};

// One side of a move: the container a row is leaving or joining. Null is a
// meaningful value here and not a missing field — it names the unfiled bucket,
// which is where a row with no link row of its own lives. An absent key is
// therefore an error, while an explicit null is accepted.
const parseNullableId = (name, value) => {
    if (value === null) {
        return ok(null);
    }
    if (value === undefined) {
        return fail(`${name} is required (send null for unfiled)`);
    }

    const id = parsePositiveIntField(value, MAX_ROW_ID);
    return id === null ? fail(`${name} must be a positive integer or null`) : ok(id);
};

// Where in the destination a moved row lands. Unlike an id this counts from
// zero — dropping onto the first row of a list is position 0 — and omitting it
// means "append", which is what a drop onto a container rather than onto one of
// its rows means.
const parsePosition = (name, value) => {
    if (value === undefined || value === null) {
        return ok(null);
    }
    if (!Number.isInteger(value) || value < 0 || value > MAX_LINKED_IDS) {
        return fail(`${name} must be an integer between 0 and ${MAX_LINKED_IDS}`);
    }
    return ok(value);
};

module.exports = {
    MAX_LINKED_IDS,
    ok,
    fail,
    isPlainObject,
    parseTextField,
    parseRequiredTextField,
    parseIdList,
    parseNullableId,
    parsePosition,
};
