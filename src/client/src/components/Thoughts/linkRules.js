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
// ── The chain, and its one gap ─────────────────────────────────────────────
//
// The corpus is three tiers deep — topic contains idea contains note — and a
// link only ever joins a tier to the tier immediately under it. That is not a
// UI restriction: those are the only two link tables that exist. There is no
// topic-to-note edge to write, which is why a selection of notes and topics is
// refused rather than interpreted as "put these notes under that topic
// somehow".
//
// ── Two tiers, and exactly two ─────────────────────────────────────────────
//
// One tier is not a link, it is half of one. All three is ambiguous in a way
// no default resolves honestly: notes+ideas+topics could mean "link the notes
// to the ideas", "link the ideas to the topics", or both, and picking one for
// the reader writes edges they did not ask for. Refusing costs them one click
// (deselect a tier) and tells them exactly which one.
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

// Every [parent, child] a link may join — consecutive entries of TIER_ORDER.
export const LINKABLE_PAIRS = Object.freeze(
    TIER_ORDER.slice(0, -1).map((parent, index) => Object.freeze([parent, TIER_ORDER[index + 1]]))
);

// The one line shown under a disabled Link button.
//
// Each is phrased as the next move rather than as the rule that was broken:
// "why is this greyed out" is the only question a disabled control provokes,
// and the useful answer is what to select next, not which constraint failed.
export const LINK_HINTS = Object.freeze({
    empty: 'Select pinned items to link.',
    noteOnly: 'Also select an idea — notes link to ideas.',
    ideaOnly: 'Also select a note or a topic to link these ideas to.',
    topicOnly: 'Also select an idea — topics link to ideas.',
    nonAdjacent: 'A note links to an idea and an idea to a topic, so a note and a topic cannot be linked directly.',
    allTiers: 'Link two tiers at a time: notes with ideas, or ideas with topics.',
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
    if (occupied.length > 2) return REFUSED(LINK_HINTS.allTiers);

    const [parentTier, childTier] = occupied;
    const isAdjacent = LINKABLE_PAIRS.some(
        ([parent, child]) => parent === parentTier && child === childTier
    );
    if (!isAdjacent) return REFUSED(LINK_HINTS.nonAdjacent);

    const parents = byTier[TIER_ORDER.indexOf(parentTier)];
    const children = byTier[TIER_ORDER.indexOf(childTier)];

    // Child-major: every parent of one child before the next child, so the
    // caller can slice the list into one PUT per child. Fresh objects, never
    // the caller's own — this runs on every render of the action bar and must
    // not hand React state back out by reference.
    const pairs = children.flatMap(child =>
        parents.map(parent => [
            { itemType: parent.itemType, itemId: parent.itemId },
            { itemType: child.itemType, itemId: child.itemId },
        ])
    );

    return { canLink: true, reason: null, pairs };
};

export default evaluateLink;
