import { analyzeUrlForNote } from '../Analyze/analyzeUrl';
import { describeReference } from '../Analyze/navigation';
import { treeUrlForIdea } from '../Topics/treeFocus';

// Pure: what one endpoint returns -> what the drawer shows.
//
// ── Why three adapters and one drawer ──────────────────────────────────────
//
// The three tiers are the same picture and three different things to read. A
// note is a body and the passages it anchors to; an idea is a body and the
// notes gathered under it; a topic is a description and the ideas filed under
// it. The drawer's shell — the title, the close button, the loading and error
// states, the link back into Analyze — is identical for all three, so it is
// written once and each tier says only what goes inside it.
//
// The shape they all produce:
//
//   { title, body, isMarkdown, listHeading, items: [{ key, text, to }] }
//
// `to` is a route or null. A note's references are text and nothing more —
// they are already the drawer's own link at the foot — while an idea's notes
// and a topic's ideas are rows a reader wants to go to.
//
// ── Why the payloads are the ones they are ─────────────────────────────────
//
// All three endpoints existed before this page did, and all three already
// return exactly one tier's row with the tier below it nested inside: the
// Topic page's tree walks down through them a level at a time. So the drawer
// reads what the tree reads, and there is no /api/overview/:something to keep
// in step with either of them.

// The endpoint one rail's group is read from. Paired with the adapter below so
// a rail cannot be fetched one way and interpreted another.
export const DETAIL_PATHS = {
    notes: (id) => `/notes/${id}`,
    ideas: (id) => `/ideas/${id}`,
    topics: (id) => `/topics/${id}`,
};

// What an untitled row in a list is called. Distinct from tierLabels' version
// of the same idea because that one names the group being hovered and this one
// names a row inside it — "Untitled note" in a list of notes, whatever rail
// the list is on.
const UNTITLED_ROW = 'Untitled';

const titled = (text) => (typeof text === 'string' && text.trim() !== '' ? text : UNTITLED_ROW);

// A note: its markdown body, and the passages it anchors to.
//
// The references are printed rather than linked because the foot of the drawer
// already links, and to the passage the reader clicked nearest rather than to
// whichever one they happen to look at in the list.
const fromNote = (note, books) => ({
    title: note.title || '',
    body: note.body || '',
    isMarkdown: true,
    listHeading: 'References',
    items: (note.references || []).map(reference => ({
        key: String(reference.id ?? `${reference.bookId}.${reference.chapter}.${reference.startVerse}`),
        text: describeReference(books, reference),
        to: null,
    })),
});

// An idea: its markdown body, and the notes gathered under it.
//
// Each note links into Analyze at its first reference — the same destination
// its row in the topic tree leads to, built by the same function, so a note is
// reached the same way from everywhere in the app.
const fromIdea = (idea) => ({
    title: idea.title || '',
    body: idea.body || '',
    isMarkdown: true,
    listHeading: 'Notes',
    items: (idea.notes || []).map(note => ({
        key: String(note.id),
        text: titled(note.title),
        to: analyzeUrlForNote(note),
    })),
});

// A topic: its description, and the ideas filed under it.
//
// The description is plain text, not markdown — that is what the field is on
// the /topics page that writes it, and rendering it as markdown here would
// make one field mean two things depending on where it was read.
//
// An idea has no page of its own, so its row leads to the tree, opened at this
// topic with that idea marked — the link contract Topics/treeFocus.js owns.
const fromTopic = (topic) => ({
    title: topic.name || '',
    body: topic.description || '',
    isMarkdown: false,
    listHeading: 'Ideas',
    items: (topic.ideas || []).map(idea => ({
        key: String(idea.id),
        text: titled(idea.title),
        to: treeUrlForIdea(idea.id, topic.id),
    })),
});

const ADAPTERS = {
    notes: (payload, books) => (payload.note ? fromNote(payload.note, books) : null),
    ideas: (payload) => (payload.idea ? fromIdea(payload.idea) : null),
    topics: (payload) => (payload.topic ? fromTopic(payload.topic) : null),
};

/**
 * One endpoint's body -> the drawer's shape, or null when the response did not
 * carry the row it was asked for.
 *
 * @param rail    which tier was fetched
 * @param payload the parsed response body
 * @param books   the canon, for turning a reference tuple into "Romans 5:1–5"
 */
export const toTierDetail = (rail, payload, books) => {
    const adapt = ADAPTERS[rail];
    if (!adapt || !payload) return null;

    return adapt(payload, books);
};

export default toTierDetail;
