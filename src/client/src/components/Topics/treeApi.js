import { fetchJson } from '../../config/api';
import { TOPIC, IDEA, UNFILED_IDEAS_KEY, UNFILED_NOTES_KEY } from './treeModel';

// Every request the Topic page makes, in one place, so the hook above it deals
// in rows and the components above that deal in neither.
//
// ── Why the tree reuses the existing endpoints ──────────────────────────────
//
// The three levels come from GET /topics, GET /topics/:id and GET /ideas/:id
// rather than from tree-specific routes. Those payloads were already shaped for
// exactly one level each — /topics/:id deliberately does not nest notes — so a
// nested endpoint would either duplicate them or ship a whole topic's notes on
// every topic click and display them on almost none of them.
//
// The two unfiled buckets do get their own paths. They are not a narrowing of
// any list endpoint: GET /notes answers a question about one chapter and
// requires a book and chapter to do it, and GET /ideas serves the multi-select,
// which wants every idea. "Which of these has no parent?" is a third question.

// The root level. It takes the fetch options through so the page's first load
// can be cancelled on unmount, the way every other initial load in this app is.
export const fetchTopics = (options) =>
    fetchJson('/topics', options).then(data => data.topics || []);

const fetchTopicIdeas = (topicId) =>
    fetchJson(`/topics/${topicId}`).then(data => data.topic.ideas || []);

const fetchIdeaNotes = (ideaId) =>
    fetchJson(`/ideas/${ideaId}`).then(data => data.idea.notes || []);

const fetchUnfiledIdeas = () => fetchJson('/ideas/unfiled').then(data => data.ideas || []);

const fetchUnfiledNotes = () => fetchJson('/notes/unfiled').then(data => data.notes || []);

// One entry point for every lazy load, so expanding a row is the same call
// whatever the row is. The buckets are matched by key rather than by kind: they
// are the only two rows standing for the absence of a container, and there is
// exactly one of each.
export const fetchChildren = (node) => {
    if (node.key === UNFILED_IDEAS_KEY) {
        return fetchUnfiledIdeas();
    }
    if (node.key === UNFILED_NOTES_KEY) {
        return fetchUnfiledNotes();
    }
    return node.kind === TOPIC ? fetchTopicIdeas(node.id) : fetchIdeaNotes(node.id);
};

// ─── Writes ─────────────────────────────────────────────────────────────────
//
// Each reorder takes the container's COMPLETE ordered membership, matching the
// endpoints: a partial order would renumber some rows and leave the rest at
// stale positions, and the server refuses one rather than half-apply it.

export const reorderTopics = (topicIds) =>
    fetchJson('/topics/order', { method: 'PUT', body: { topicIds } });

const reorderTopicIdeas = (topicId, ideaIds) =>
    fetchJson(`/topics/${topicId}/ideas/order`, { method: 'PUT', body: { ideaIds } });

const reorderIdeaNotes = (ideaId, noteIds) =>
    fetchJson(`/ideas/${ideaId}/notes/order`, { method: 'PUT', body: { noteIds } });

export const reorderChildren = (kind, containerId, ids) =>
    (kind === IDEA
        ? reorderTopicIdeas(containerId, ids)
        : reorderIdeaNotes(containerId, ids));

// A move names the container it leaves as well as the one it joins, so the
// server rewrites exactly one link row and the row's other memberships are left
// alone. Either end may be null — that is an unfiled bucket, not a missing
// field, which is why the endpoints require the key to be present either way.
const moveIdea = (ideaId, { fromContainerId, toContainerId, position }) =>
    fetchJson(`/ideas/${ideaId}/topic`, {
        method: 'PUT',
        body: { fromTopicId: fromContainerId, toTopicId: toContainerId, position },
    });

const moveNote = (noteId, { fromContainerId, toContainerId, position }) =>
    fetchJson(`/notes/${noteId}/idea`, {
        method: 'PUT',
        body: { fromIdeaId: fromContainerId, toIdeaId: toContainerId, position },
    });

export const moveNode = (node, destination) => {
    const move = {
        fromContainerId: node.containerId,
        toContainerId: destination.containerId,
        position: destination.position,
    };

    return node.kind === IDEA ? moveIdea(node.id, move) : moveNote(node.id, move);
};
