import { countLabel, joinCounts } from '../Library/format';
import { analyzeUrlForNote } from '../Analyze/analyzeUrl';

// The Topic page's tree, as data. No React and no fetching: what a row is, what
// expanding it would load, and what dropping one row onto another means.
//
// Everything here is pure so the drag rules can be tested directly, which
// matters more here than for the other pure modules in this app — a drop is one
// gesture that has to resolve to exactly one of three different writes.

export const TOPIC = 'topic';
export const IDEA = 'idea';
export const NOTE = 'note';
export const BUCKET = 'bucket';

// Branch keys. A node's key is a path rather than an id, because the same idea
// can be filed under two topics and the same note under two ideas: `idea:4`
// would name two rows that expand independently, and collapsing one would
// collapse the other.
export const ROOT_KEY = 'root';
export const UNFILED_IDEAS_KEY = 'unfiled-ideas';
export const UNFILED_NOTES_KEY = 'unfiled-notes';

// What a drop means. PLACE puts the dragged row where the target row sits — in
// the target's container, at the target's index. APPEND puts it at the end of
// the target itself, which is what dropping onto a container rather than onto
// one of its rows means.
export const PLACE = 'place';
export const APPEND = 'append';

const keyFor = (containerKey, kind, id) => `${containerKey}/${kind}:${id}`;

// ─── Rows ───────────────────────────────────────────────────────────────────
//
// Every row carries where it sits as well as what it is: `containerId` is the
// id of the topic or idea it is filed under, and null means it has no link row
// at all — it is a topic at the root, or it is sitting in an unfiled bucket.
// A move needs both ends, and the row that was dragged is the only place the
// "from" end can come from.

export const topicNode = (topic, index) => ({
    key: keyFor(ROOT_KEY, TOPIC, topic.id),
    kind: TOPIC,
    childKind: IDEA,
    id: topic.id,
    title: topic.name,
    detail: joinCounts([
        countLabel(topic.ideaCount, 'idea'),
        countLabel(topic.noteCount, 'note'),
    ]),
    childCount: topic.ideaCount,
    containerId: null,
    containerKey: ROOT_KEY,
    index,
});

export const ideaNode = (idea, index, container) => ({
    key: keyFor(container.key, IDEA, idea.id),
    kind: IDEA,
    childKind: NOTE,
    id: idea.id,
    title: idea.title,
    detail: countLabel(idea.noteCount, 'note'),
    childCount: idea.noteCount,
    containerId: container.id,
    containerKey: container.key,
    index,
});

export const noteNode = (note, index, container) => ({
    key: keyFor(container.key, NOTE, note.id),
    kind: NOTE,
    // A note is the bottom of the tree: there is nothing under it to load.
    childKind: null,
    id: note.id,
    title: note.title,
    firstReference: note.firstReference || null,
    containerId: container.id,
    containerKey: container.key,
    index,
});

// The two buckets. They are rows like any other — they take drops and they
// expand — but they stand for the absence of a container, so their id is null
// and every child loaded into them has `containerId: null`.
//
// They are always rendered, loaded or not, empty or not. An orphan is only
// reachable through them, so a bucket that hid itself when it had nothing to
// show would be indistinguishable from one whose contents had not loaded yet.
export const bucketNodes = () => [
    {
        key: UNFILED_IDEAS_KEY,
        kind: BUCKET,
        childKind: IDEA,
        id: null,
        title: 'Unfiled ideas',
        detail: 'Ideas filed under no topic',
        containerId: null,
        containerKey: ROOT_KEY,
        index: null,
    },
    {
        key: UNFILED_NOTES_KEY,
        kind: BUCKET,
        childKind: NOTE,
        id: null,
        title: 'Unfiled notes',
        detail: 'Notes filed under no idea',
        containerId: null,
        containerKey: ROOT_KEY,
        index: null,
    },
];

// One bucket by key. A page arriving with something to focus finds the node
// that owns the row rather than rebuilding its key, so the path format above
// stays private to this module.
export const bucketNodeFor = (key) => bucketNodes().find(node => node.key === key) || null;

// Turns one branch's payload into rows, using the container's childKind to pick
// the shape. The container is passed whole because a child needs both halves of
// where it sits — the key it hangs under and the id it is linked to.
export const childNodesOf = (container, items) => {
    const build = container.childKind === IDEA ? ideaNode : noteNode;
    return items.map((item, index) => build(item, index, container));
};

export const canExpand = (node) => node.childKind !== null;

// ─── Drops ──────────────────────────────────────────────────────────────────

// What dropping `dragged` onto `target` means, or null when it means nothing.
//
// The rule is decided entirely by the two kinds:
//
//   same kind          — PLACE: go where that row is, in its container
//   target takes this  — APPEND: go into that row, at the end
//   anything else      — no drop
//
// which covers re-parenting and reordering with one gesture: dropping an idea
// onto an idea in another topic places it in that topic, and dropping it onto
// one of its own siblings just reorders them.
export const dropIntentFor = (dragged, target) => {
    if (!dragged || !target || dragged.key === target.key) {
        return null;
    }

    if (target.kind === dragged.kind) {
        // Two rows sitting in the same bucket have no link row between them and
        // a container to carry an order, so the buckets are not sortable. They
        // list in the row's own sort_order, which is creation order.
        const bothUnfiled = target.containerId === null && dragged.containerId === null;
        if (bothUnfiled && dragged.kind !== TOPIC) {
            return null;
        }
        return PLACE;
    }

    return target.childKind === dragged.kind ? APPEND : null;
};

// Where the dragged row ends up: which container, and at which index within it.
// `containerId: null` is a real destination — the unfiled bucket — and
// `position: null` means append.
export const destinationFor = (dragged, target) => {
    const intent = dropIntentFor(dragged, target);
    if (intent === null) {
        return null;
    }

    return intent === APPEND
        ? { containerId: target.id, containerKey: target.key, position: null }
        : { containerId: target.containerId, containerKey: target.containerKey, position: target.index };
};

// `ids` with the entry at `fromIndex` lifted out and put back at `toIndex`.
// Returns a new array; the caller's list is never touched.
export const moveWithin = (ids, fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= ids.length) {
        return ids;
    }

    const moved = ids[fromIndex];
    const without = [...ids.slice(0, fromIndex), ...ids.slice(fromIndex + 1)];
    const landing = Math.max(0, Math.min(toIndex, without.length));

    return [...without.slice(0, landing), moved, ...without.slice(landing)];
};

// Where a note row links to: the Analyze page, positioned at the note's first
// anchor and opened on the note.
//
// Built by Analyze/analyzeUrl.js and re-exported here, so a note row still
// reaches for it through the model it already imports. It moved there when
// search grew note results of its own — the query-string format is the Analyze
// page's contract with everything that links into it, not this page's private
// arrangement with it.
export { analyzeUrlForNote };
