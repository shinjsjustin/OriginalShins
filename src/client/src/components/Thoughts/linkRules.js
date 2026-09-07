// Pure: a selection of pinned items -> may it be linked, and into what links.
//
// ── Why this is a module and not an `if` in the panel ──────────────────────
//
// Three things need the same answer and must not disagree about it: whether
// the Link button is enabled, what the one-line hint under it says when it is
// not, and which writes fire when it is pressed. If the enable-check and the
// write-builder are written separately they will drift, and the failure mode
// of that drift is a button that is enabled for a selection the builder then
// interprets differently — real PUTs against the reader's corpus, with no undo
// on this page. So the button reads `canLink`, the hint reads `reason`, and
// the handler iterates `pairs`, all from one call.
//
// ── The corpus is a DAG, not a chain ───────────────────────────────────────
//
// Topic contains idea contains note, AND a topic may contain a note directly:
// there are three link tables, not two. So a link joins any tier to any tier
// below it, and every two-tier selection is linkable. A three-tier selection is
// no longer ambiguous either — it means all three downward edges, and writes
// them.
//
// ── Which side of a pair is the parent ─────────────────────────────────────
//
// A pair is `[parent, child]`, parent being the higher tier. The child is the
// side that owns the set the API writes — `PUT /api/notes/:id/ideas` replaces
// a note's whole set of ideas, `PUT /api/ideas/:id/topics` an idea's topics —
// so the pairs come out child-major, every parent for one child adjacent in
// the list. That lets the caller collapse a child's pairs into the single PUT
// the endpoint actually wants instead of re-reading and re-writing the same
// note once per idea.

// The tiers, parent first. Adjacency in this list is the whole rule: the
// linkable pairs below are derived from it rather than listed again, so a
// fourth tier could never be added to one and forgotten in the other.
export const TIER_ORDER = Object.freeze(['topic', 'idea', 'note']);

// Every [parent, child] a link may join: any tier to any tier below it.
//
// This used to be "consecutive entries of TIER_ORDER", because the corpus was a
// chain and a link only ever joined a tier to the one immediately under it.
// note_topics ended that — a note may now be filed under a topic directly, with
// no idea in between — so the corpus is a DAG and the rule is descent rather
// than adjacency.
//
// Still derived from TIER_ORDER rather than listed out, for the reason the
// original derivation existed: a fourth tier cannot be added to one and
// forgotten in the other.
export const LINKABLE_PAIRS = Object.freeze(
    TIER_ORDER.flatMap((parent, index) =>
        TIER_ORDER.slice(index + 1).map(child => Object.freeze([parent, child])))
);

// The one line shown under a disabled Link button.
//
// Each is phrased as the next move rather than as the rule that was broken:
// "why is this greyed out" is the only question a disabled control provokes,
// and the useful answer is what to select next, not which constraint failed.
//
// `nonAdjacent` and `allTiers` are gone. Every two-tier selection is now
// linkable, so the first is unreachable, and a three-tier selection writes
// every downward edge rather than being refused.
export const LINK_HINTS = Object.freeze({
    empty: 'Select pinned items to link.',
    noteOnly: 'Also select an idea or a topic to link these notes to.',
    ideaOnly: 'Also select a note or a topic to link these ideas to.',
    topicOnly: 'Also select an idea or a note to link these topics to.',
    unknownType: 'Only topics, ideas and notes can be linked.',
});

// The hint for a selection that sits in exactly one tier, by that tier.
const SINGLE_TIER_HINTS = Object.freeze({
    note: LINK_HINTS.noteOnly,
    idea: LINK_HINTS.ideaOnly,
    topic: LINK_HINTS.topicOnly,
});

const REFUSED = (reason) => ({ canLink: false, reason, pairs: [] });

// A pin identifies its item by tier plus id and nothing else, so this is the
// whole of what makes two selected rows the same row.
const keyOf = (item) => `${item.itemType}:${item.itemId}`;

const isSelectable = (item) =>
    Boolean(item)
    && TIER_ORDER.includes(item.itemType)
    && Number.isInteger(item.itemId);

// The selected items of one tier, in selection order, with repeats removed.
//
// The panel selects by checkbox and by row click against the same list, so one
// row can arrive twice; a duplicated note would otherwise produce a duplicated
// pair and a second, identical write.
const itemsOfTier = (items, tier, seen) =>
    items.filter(item => {
        if (item.itemType !== tier || seen.has(keyOf(item))) return false;
        seen.add(keyOf(item));
        return true;
    });

/**
 * Can this selection be linked, and if so into which links?
 *
 * @param items selected pins: [{ itemType, itemId }, ...] in selection order
 * @returns { canLink, reason, pairs } — `reason` is null when canLink is true
 *          and otherwise the one-line hint to show; `pairs` is [] unless
 *          canLink, and is [[parent, child], ...] child-major when it is.
 */
export const evaluateLink = (items) => {
    if (!Array.isArray(items) || items.length === 0) return REFUSED(LINK_HINTS.empty);

    // One bad entry refuses the whole selection rather than being dropped.
    // Linking "the rest" would write edges the reader cannot reconcile with
    // what they can see selected on screen.
    if (!items.every(isSelectable)) return REFUSED(LINK_HINTS.unknownType);

    const seen = new Set();
    const byTier = TIER_ORDER.map(tier => itemsOfTier(items, tier, seen));
    const occupied = TIER_ORDER.filter((unused, index) => byTier[index].length > 0);

    if (occupied.length === 1) return REFUSED(SINGLE_TIER_HINTS[occupied[0]]);

    const itemsIn = (tier) => byTier[TIER_ORDER.indexOf(tier)];

    // Every linkable pair the selection actually occupies, in LINKABLE_PAIRS
    // order — so all three tiers come out topic>idea, topic>note, idea>note.
    //
    // Child-major inside each pair: every parent for one child before the next
    // child, so the caller can slice the list into one PUT per child. Fresh
    // objects, never the caller's own — this runs on every render of the action
    // bar and must not hand React state back out by reference.
    const pairs = LINKABLE_PAIRS
        .filter(([parent, child]) => itemsIn(parent).length > 0 && itemsIn(child).length > 0)
        .flatMap(([parentTier, childTier]) => itemsIn(childTier).flatMap(child =>
            itemsIn(parentTier).map(parent => [
                { itemType: parent.itemType, itemId: parent.itemId },
                { itemType: child.itemType, itemId: child.itemId },
            ])));

    return { canLink: true, reason: null, pairs };
};

export default evaluateLink;
