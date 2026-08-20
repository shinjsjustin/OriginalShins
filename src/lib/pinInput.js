// Validation for the JSON bodies the pins API accepts.
//
// A pin differs from a topic, an idea and a note in one way that matters: it
// carries no user-authored text at all. Its whole body is a pointer — a type
// and an id — so everything here is about proving that pointer is one the
// database's ENUM and INT UNSIGNED columns can actually hold, before a query
// finds out for us.
const {
    ok,
    fail,
    isPlainObject,
    MAX_LINKED_IDS,
} = require('./textInput');
const { MAX_ROW_ID, parsePositiveIntField } = require('./params');
const { ITEM_TYPES } = require('./pins');

// The largest selection one request may name. The panel's Unpin-selected acts
// on a selection the user made by hand, so this is the same ceiling a link set
// gets rather than a second number meaning the same thing.
const MAX_PIN_ITEMS = MAX_LINKED_IDS;

// The item_type ENUM, checked against the same list src/lib/pins.js resolves a
// table from. Membership is tested with includes() on that exported list rather
// than restated here, so adding a fourth tier is one edit and not two that can
// drift apart.
const parseItemType = (value) => {
    if (typeof value !== 'string') {
        return fail('itemType must be a string');
    }
    if (!ITEM_TYPES.includes(value)) {
        return fail(`itemType must be one of: ${ITEM_TYPES.join(', ')}`);
    }
    return ok(value);
};

// The id half of the pointer: the same positive-integer rule params.js#parseRowId
// applies to a URL segment, in the form that also accepts the number a JSON
// body legitimately carries — exactly as parseIdList in src/lib/textInput.js
// does for the ids inside a link set.
const parseItemId = (value) => {
    const id = parsePositiveIntField(value, MAX_ROW_ID);
    return id === null ? fail('itemId must be a positive integer') : ok(id);
};

// One { itemType, itemId } pair, wherever it appears — as the whole body of a
// POST or as one entry in a DELETE's list. `label` names the pair in the error
// so a bad entry inside an array says which field of what was wrong.
const parsePinTarget = (payload, label = 'request body') => {
    if (!isPlainObject(payload)) {
        return fail(`${label} must be a JSON object`);
    }

    const itemType = parseItemType(payload.itemType);
    if (itemType.error) return itemType;

    const itemId = parseItemId(payload.itemId);
    if (itemId.error) return itemId;

    return ok({ itemType: itemType.value, itemId: itemId.value });
};

// POST /api/pins — { itemType, itemId }
const parseCreatePin = (payload) => parsePinTarget(payload);

// DELETE /api/pins — { items: [{ itemType, itemId }, ...] }
//
// A list rather than a single pair because the panel unpins a whole selection
// at once; a single-card unpin is just a list of one, so the client has one
// code path instead of two. An empty list is refused — unlike a link set, where
// empty means "unlink everything", there is nothing an empty unpin could mean
// that DELETE /api/pins/all does not already say.
const parseUnpinItems = (payload) => {
    if (!isPlainObject(payload)) {
        return fail('request body must be a JSON object');
    }
    if (!Array.isArray(payload.items)) {
        return fail('items must be an array of { itemType, itemId }');
    }
    if (payload.items.length === 0) {
        return fail('items must contain at least one { itemType, itemId }');
    }
    if (payload.items.length > MAX_PIN_ITEMS) {
        return fail(`items must contain ${MAX_PIN_ITEMS} entries or fewer`);
    }

    const items = [];
    const seen = new Set();

    for (const entry of payload.items) {
        const parsed = parsePinTarget(entry, 'each entry in items');
        if (parsed.error) return parsed;

        // The same pin named twice deletes the same row twice. Deduplicating is
        // closer to what the selection meant than a 400 would be — the same
        // reasoning parseIdList applies to a link set.
        const key = `${parsed.value.itemType}:${parsed.value.itemId}`;
        if (!seen.has(key)) {
            seen.add(key);
            items.push(parsed.value);
        }
    }

    return ok(items);
};

module.exports = {
    MAX_PIN_ITEMS,
    parseItemType,
    parseItemId,
    parseCreatePin,
    parseUnpinItems,
};
