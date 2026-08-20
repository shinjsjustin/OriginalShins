import React from 'react';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TopicTree from './TopicTree';

// ─── A standing-in tree API ─────────────────────────────────────────────────
//
// Stateful, for the same reason the Analyze and Library suites' mocks are: the
// flows worth testing here are round trips. "Dragging a note out of Unfiled
// files it" is only proven if the note leaves the bucket on the NEXT fetch,
// computed by the store from its link tables — a canned response would let a
// client-side guess pass.
//
// So the store performs a move the way src/lib/ordering.js does: the old link
// row is deleted, the new one inserted at the position asked for, and the
// destination renumbered densely. And it derives every list from the link
// tables rather than storing it, so an order is read back the way the SQL reads
// it: by sort_order.

let store;
let requests;

const resetStore = () => {
    store = { topics: [], ideas: [], notes: [], ideaTopics: [], noteIdeas: [] };
};

const byOrder = (a, b) => a.sortOrder - b.sortOrder;

const addTopic = (name) => {
    const topic = {
        id: store.topics.length + 1,
        name,
        slug: name.toLowerCase(),
        description: '',
        sortOrder: store.topics.length,
    };
    store.topics = [...store.topics, topic];
    return topic;
};

const addIdea = (title) => {
    const idea = { id: store.ideas.length + 1, title, body: '', sortOrder: store.ideas.length };
    store.ideas = [...store.ideas, idea];
    return idea;
};

const addNote = (title, firstReference = null) => {
    const note = { id: store.notes.length + 1, title, sortOrder: store.notes.length, firstReference };
    store.notes = [...store.notes, note];
    return note;
};

const fileIdea = (ideaId, topicId) => {
    const sortOrder = store.ideaTopics.filter(link => link.topicId === topicId).length;
    store.ideaTopics = [...store.ideaTopics, { ideaId, topicId, sortOrder }];
};

const fileNote = (noteId, ideaId) => {
    const sortOrder = store.noteIdeas.filter(link => link.ideaId === ideaId).length;
    store.noteIdeas = [...store.noteIdeas, { noteId, ideaId, sortOrder }];
};

// ─── Reads ──────────────────────────────────────────────────────────────────

const notesOfIdea = (ideaId) => store.noteIdeas
    .filter(link => link.ideaId === ideaId)
    .sort(byOrder)
    .map(link => store.notes.find(note => note.id === link.noteId));

const ideasOfTopic = (topicId) => store.ideaTopics
    .filter(link => link.topicId === topicId)
    .sort(byOrder)
    .map(link => store.ideas.find(idea => idea.id === link.ideaId));

const hydrateIdea = (idea) => ({
    id: idea.id,
    title: idea.title,
    sortOrder: idea.sortOrder,
    noteCount: notesOfIdea(idea.id).length,
});

const hydrateNote = (note) => ({
    id: note.id,
    title: note.title,
    sortOrder: note.sortOrder,
    firstReference: note.firstReference,
});

// The counts walk topic -> idea -> note and count DISTINCT notes, exactly as
// the list query does: a note reached through two of a topic's ideas counts
// once.
const hydrateTopic = (topic) => {
    const ideas = ideasOfTopic(topic.id);
    const noteIds = new Set(ideas.flatMap(idea => notesOfIdea(idea.id).map(note => note.id)));

    return { ...topic, ideaCount: ideas.length, noteCount: noteIds.size };
};

const unfiledIdeas = () => store.ideas
    .filter(idea => !store.ideaTopics.some(link => link.ideaId === idea.id))
    .sort(byOrder);

const unfiledNotes = () => store.notes
    .filter(note => !store.noteIdeas.some(link => link.noteId === note.id))
    .sort(byOrder);

// ─── Writes ─────────────────────────────────────────────────────────────────

const applyOrder = (links, scopeKey, scopeValue, memberKey, orderedIds) => links.map(link => (
    link[scopeKey] === scopeValue && orderedIds.includes(link[memberKey])
        ? { ...link, sortOrder: orderedIds.indexOf(link[memberKey]) }
        : link
));

// Delete the old row, insert the new one at `position`, renumber the
// destination — the same three steps the transaction performs.
const moveLink = (links, { scopeKey, memberKey }, memberId, { from, to, position }) => {
    const withoutOld = links.filter(
        link => !(link[memberKey] === memberId && link[scopeKey] === from)
    );

    if (to === null) {
        return withoutOld;
    }

    const destination = withoutOld
        .filter(link => link[scopeKey] === to && link[memberKey] !== memberId)
        .sort(byOrder)
        .map(link => link[memberKey]);

    const slot = position === null || position === undefined
        ? destination.length
        : Math.max(0, Math.min(position, destination.length));
    const ordered = [...destination.slice(0, slot), memberId, ...destination.slice(slot)];

    const others = withoutOld.filter(
        link => !(link[scopeKey] === to && link[memberKey] === memberId)
    );
    const inserted = [...others, { [scopeKey]: to, [memberKey]: memberId, sortOrder: slot }];

    return applyOrder(inserted, scopeKey, to, memberKey, ordered);
};

// ─── Routing ────────────────────────────────────────────────────────────────

const jsonResponse = (body, status = 200) => Promise.resolve({
    ok: true,
    status,
    json: () => Promise.resolve(body),
});

const failure = (status) => Promise.resolve({ ok: false, status, json: () => Promise.resolve({}) });

const ROUTES = [
    // Literal paths first, exactly as the router declares them: /ideas/unfiled
    // must not be read as an id.
    ['GET', /\/ideas\/unfiled$/, () => jsonResponse({ ideas: unfiledIdeas().map(hydrateIdea) })],
    ['GET', /\/notes\/unfiled$/, () => jsonResponse({ notes: unfiledNotes().map(hydrateNote) })],

    ['GET', /\/topics$/, () => jsonResponse({
        topics: [...store.topics].sort(byOrder).map(hydrateTopic),
    })],

    ['GET', /\/topics\/(\d+)$/, ([id]) => {
        const topic = store.topics.find(item => item.id === id);
        return topic
            ? jsonResponse({ topic: { ...hydrateTopic(topic), ideas: ideasOfTopic(id).map(hydrateIdea) } })
            : failure(404);
    }],

    ['GET', /\/ideas\/(\d+)$/, ([id]) => {
        const idea = store.ideas.find(item => item.id === id);
        return idea
            ? jsonResponse({ idea: { ...hydrateIdea(idea), topics: [], notes: notesOfIdea(id).map(hydrateNote) } })
            : failure(404);
    }],

    ['PUT', /\/topics\/order$/, (_params, body) => {
        store.topics = store.topics.map(topic => ({
            ...topic,
            sortOrder: body.topicIds.indexOf(topic.id),
        }));
        return jsonResponse({ ordered: body.topicIds.length });
    }],

    ['PUT', /\/topics\/(\d+)\/ideas\/order$/, ([topicId], body) => {
        store.ideaTopics = applyOrder(store.ideaTopics, 'topicId', topicId, 'ideaId', body.ideaIds);
        return jsonResponse({ ordered: body.ideaIds.length });
    }],

    ['PUT', /\/ideas\/(\d+)\/notes\/order$/, ([ideaId], body) => {
        store.noteIdeas = applyOrder(store.noteIdeas, 'ideaId', ideaId, 'noteId', body.noteIds);
        return jsonResponse({ ordered: body.noteIds.length });
    }],

    ['PUT', /\/ideas\/(\d+)\/topic$/, ([ideaId], body) => {
        store.ideaTopics = moveLink(
            store.ideaTopics,
            { scopeKey: 'topicId', memberKey: 'ideaId' },
            ideaId,
            { from: body.fromTopicId, to: body.toTopicId, position: body.position }
        );
        return jsonResponse({ filed: body.toTopicId !== null });
    }],

    ['PUT', /\/notes\/(\d+)\/idea$/, ([noteId], body) => {
        store.noteIdeas = moveLink(
            store.noteIdeas,
            { scopeKey: 'ideaId', memberKey: 'noteId' },
            noteId,
            { from: body.fromIdeaId, to: body.toIdeaId, position: body.position }
        );
        return jsonResponse({ filed: body.toIdeaId !== null });
    }],
];

const handleRequest = (url, options = {}) => {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;
    requests.push({ url, method, body });

    for (const [routeMethod, pattern, handle] of ROUTES) {
        const match = pattern.exec(url);
        if (routeMethod === method && match) {
            return handle(match.slice(1).map(Number), body);
        }
    }

    return failure(404);
};

beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    resetStore();
    requests = [];
    global.fetch = jest.fn(handleRequest);
});

afterEach(async () => {
    // Let any request the last assertion did not wait on settle inside act(),
    // so a stray "not wrapped in act" warning cannot bury a real one.
    await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
    });

    jest.resetAllMocks();
    localStorage.clear();
});

// ─── Driving the page ───────────────────────────────────────────────────────

// `path` is how a link into this page arrives: /topics-tree?topic=3&idea=7
// names a row to open and bring into view, and the default is the bare page.
const mount = async (path = '/topics-tree') => {
    let result;
    await act(async () => {
        result = render(
            <MemoryRouter initialEntries={[path]}><TopicTree /></MemoryRouter>
        );
    });
    return result;
};

const row = (key) => document.querySelector(`[data-tree-key="${key}"]`);

const rowsOfKind = (kind) => Array.from(document.querySelectorAll(`[data-tree-kind="${kind}"]`));

const titlesOfKind = (kind) => rowsOfKind(kind)
    .map(node => node.querySelector('.tree-row-title').textContent);

const open = async (key) => {
    await act(async () => {
        fireEvent.click(row(key).querySelector('.tree-row-label'));
    });
};

// jsdom supplies no DataTransfer, and the handlers guard for that — but the
// real ones set effectAllowed and call setData, so the fake carries both and
// the drags here take the same path a browser would.
const dataTransfer = () => ({
    effectAllowed: '',
    dropEffect: '',
    setData: jest.fn(),
    getData: jest.fn(() => ''),
});

const dragOnto = async (sourceKey, targetKey) => {
    const transfer = dataTransfer();
    await act(async () => {
        fireEvent.dragStart(row(sourceKey), { dataTransfer: transfer });
    });
    await act(async () => {
        fireEvent.dragOver(row(targetKey), { dataTransfer: transfer });
    });
    await act(async () => {
        fireEvent.drop(row(targetKey), { dataTransfer: transfer });
    });
};

const writes = () => requests.filter(request => request.method !== 'GET');

const TOPIC_KEY = (id) => `root/topic:${id}`;
const IDEA_IN_TOPIC = (topicId, ideaId) => `${TOPIC_KEY(topicId)}/idea:${ideaId}`;
const NOTE_IN_IDEA = (ideaKey, noteId) => `${ideaKey}/note:${noteId}`;
const UNFILED_NOTE = (noteId) => `unfiled-notes/note:${noteId}`;

describe('the tree', () => {
    test('renders topics at the root with what hangs beneath them', async () => {
        // Arrange
        const faith = addTopic('Faith');
        const abiding = addIdea('Abiding');
        const first = addNote('First');
        fileIdea(abiding.id, faith.id);
        fileNote(first.id, abiding.id);

        // Act
        await mount();

        // Assert
        await waitFor(() => expect(rowsOfKind('topic')).toHaveLength(1));
        expect(row(TOPIC_KEY(faith.id))).toHaveTextContent('1 idea · 1 note');
    });

    test('loads a level at a time, and only when it is opened', async () => {
        // Arrange
        const faith = addTopic('Faith');
        const abiding = addIdea('Abiding');
        const first = addNote('First');
        fileIdea(abiding.id, faith.id);
        fileNote(first.id, abiding.id);

        await mount();
        await waitFor(() => expect(rowsOfKind('topic')).toHaveLength(1));

        // Assert — the root is loaded; nothing below it has been asked for.
        expect(requests.filter(r => /\/topics\/\d+$/.test(r.url))).toHaveLength(0);
        expect(rowsOfKind('idea')).toHaveLength(0);

        // Act — open the topic.
        await open(TOPIC_KEY(faith.id));

        // Assert — its ideas arrived, and its notes still have not.
        await waitFor(() => expect(titlesOfKind('idea')).toEqual(['Abiding']));
        expect(requests.filter(r => /\/ideas\/\d+$/.test(r.url))).toHaveLength(0);

        // Act — open the idea.
        await open(IDEA_IN_TOPIC(faith.id, abiding.id));

        // Assert — the third level, and no further.
        await waitFor(() => expect(titlesOfKind('note')).toEqual(['First']));
    });

    test('shows both unfiled buckets before anything is loaded at all', async () => {
        await mount();

        // They are the only route to an orphan, so they may not wait on the
        // topics arriving — or on there being any.
        expect(screen.getByText('Unfiled ideas')).toBeInTheDocument();
        expect(screen.getByText('Unfiled notes')).toBeInTheDocument();
    });
});

describe('unfiled buckets', () => {
    test('an orphan note and an orphan idea are reachable through them', async () => {
        // Arrange — a note under no idea and an idea under no topic. Neither
        // hangs off anything the three levels walk down from.
        const faith = addTopic('Faith');
        const abiding = addIdea('Abiding');
        fileIdea(abiding.id, faith.id);
        addIdea('Loose idea');
        addNote('Loose note');

        await mount();

        // Act
        await open('unfiled-ideas');
        await open('unfiled-notes');

        // Assert
        await waitFor(() => expect(screen.getByText('Loose idea')).toBeInTheDocument());
        expect(screen.getByText('Loose note')).toBeInTheDocument();
    });

    test('says so when there is nothing unfiled', async () => {
        const faith = addTopic('Faith');
        const abiding = addIdea('Abiding');
        fileIdea(abiding.id, faith.id);

        await mount();
        await open('unfiled-ideas');

        // An empty bucket is the good case, and has to be distinguishable from
        // one that has not loaded.
        await waitFor(() => expect(screen.getByText('Nothing unfiled.')).toBeInTheDocument());
    });
});

describe('filing by drag', () => {
    test('dragging a note out of Unfiled into an idea files it and empties the bucket', async () => {
        // Arrange
        const faith = addTopic('Faith');
        const abiding = addIdea('Abiding');
        fileIdea(abiding.id, faith.id);
        const loose = addNote('Loose note');

        await mount();
        await open(TOPIC_KEY(faith.id));
        await waitFor(() => expect(rowsOfKind('idea')).toHaveLength(1));
        await open('unfiled-notes');
        await waitFor(() => expect(screen.getByText('Loose note')).toBeInTheDocument());

        // Act
        await dragOnto(UNFILED_NOTE(loose.id), IDEA_IN_TOPIC(faith.id, abiding.id));

        // Assert — one link row written, from nowhere to the idea.
        expect(writes()).toHaveLength(1);
        expect(writes()[0].body).toEqual({ fromIdeaId: null, toIdeaId: abiding.id, position: null });
        expect(store.noteIdeas).toEqual([{ noteId: loose.id, ideaId: abiding.id, sortOrder: 0 }]);

        // Assert — and the bucket, refetched, no longer holds it.
        await waitFor(() => expect(screen.getByText('Nothing unfiled.')).toBeInTheDocument());
    });

    test('dragging a filed note onto Unfiled notes drops its link row', async () => {
        // Arrange
        const faith = addTopic('Faith');
        const abiding = addIdea('Abiding');
        const first = addNote('First');
        fileIdea(abiding.id, faith.id);
        fileNote(first.id, abiding.id);

        await mount();
        await open(TOPIC_KEY(faith.id));
        await waitFor(() => expect(rowsOfKind('idea')).toHaveLength(1));
        const ideaKey = IDEA_IN_TOPIC(faith.id, abiding.id);
        await open(ideaKey);
        await waitFor(() => expect(titlesOfKind('note')).toEqual(['First']));

        // Act
        await dragOnto(NOTE_IN_IDEA(ideaKey, first.id), 'unfiled-notes');

        // Assert — unfiling is a normal write, not an error: an orphan is legal.
        expect(writes()[0].body).toEqual({ fromIdeaId: abiding.id, toIdeaId: null, position: null });
        expect(store.noteIdeas).toEqual([]);
    });

    test('dragging an idea onto another topic rewrites its link row', async () => {
        // Arrange
        const faith = addTopic('Faith');
        const grace = addTopic('Grace');
        const abiding = addIdea('Abiding');
        fileIdea(abiding.id, faith.id);

        await mount();
        await open(TOPIC_KEY(faith.id));
        await waitFor(() => expect(rowsOfKind('idea')).toHaveLength(1));

        // Act — onto the topic row itself, which appends into it.
        await dragOnto(IDEA_IN_TOPIC(faith.id, abiding.id), TOPIC_KEY(grace.id));

        // Assert — the old row is gone and a new one exists; nothing is patched.
        expect(store.ideaTopics).toEqual([
            { topicId: grace.id, ideaId: abiding.id, sortOrder: 0 },
        ]);
        await waitFor(() => expect(row(TOPIC_KEY(grace.id))).toHaveTextContent('1 idea'));
        expect(row(TOPIC_KEY(faith.id))).toHaveTextContent('0 ideas');
    });

    test('refuses a drop that means nothing, without asking the server', async () => {
        // Arrange
        const faith = addTopic('Faith');
        const abiding = addIdea('Abiding');
        const first = addNote('First');
        fileIdea(abiding.id, faith.id);
        fileNote(first.id, abiding.id);

        await mount();
        await open(TOPIC_KEY(faith.id));
        await waitFor(() => expect(rowsOfKind('idea')).toHaveLength(1));
        const ideaKey = IDEA_IN_TOPIC(faith.id, abiding.id);
        await open(ideaKey);
        await waitFor(() => expect(titlesOfKind('note')).toEqual(['First']));

        // Act — a note onto a topic. A topic holds ideas, not notes.
        await dragOnto(NOTE_IN_IDEA(ideaKey, first.id), TOPIC_KEY(faith.id));

        // Assert
        expect(writes()).toHaveLength(0);
    });
});

describe('reordering', () => {
    test('reorders the ideas under a topic and the new order survives a reload', async () => {
        // Arrange
        const faith = addTopic('Faith');
        const abiding = addIdea('Abiding');
        const pruning = addIdea('Pruning');
        fileIdea(abiding.id, faith.id);
        fileIdea(pruning.id, faith.id);

        const first = await mount();
        await open(TOPIC_KEY(faith.id));
        await waitFor(() => expect(titlesOfKind('idea')).toEqual(['Abiding', 'Pruning']));

        // Act — the second onto the first.
        await dragOnto(
            IDEA_IN_TOPIC(faith.id, pruning.id),
            IDEA_IN_TOPIC(faith.id, abiding.id)
        );

        // Assert — sent as the topic's complete order, and stored on the link
        // rows rather than on the ideas.
        expect(writes()).toHaveLength(1);
        expect(writes()[0].url).toMatch(/\/topics\/\d+\/ideas\/order$/);
        expect(writes()[0].body).toEqual({ ideaIds: [pruning.id, abiding.id] });
        await waitFor(() => expect(titlesOfKind('idea')).toEqual(['Pruning', 'Abiding']));

        // Assert — a fresh page reads the same order back, so it was persisted
        // and not merely rearranged on screen.
        first.unmount();
        await mount();
        await open(TOPIC_KEY(faith.id));
        await waitFor(() => expect(titlesOfKind('idea')).toEqual(['Pruning', 'Abiding']));
    });

    test('reorders the notes under an idea', async () => {
        const faith = addTopic('Faith');
        const abiding = addIdea('Abiding');
        const first = addNote('First');
        const second = addNote('Second');
        fileIdea(abiding.id, faith.id);
        fileNote(first.id, abiding.id);
        fileNote(second.id, abiding.id);

        await mount();
        await open(TOPIC_KEY(faith.id));
        await waitFor(() => expect(rowsOfKind('idea')).toHaveLength(1));
        const ideaKey = IDEA_IN_TOPIC(faith.id, abiding.id);
        await open(ideaKey);
        await waitFor(() => expect(titlesOfKind('note')).toEqual(['First', 'Second']));

        await dragOnto(NOTE_IN_IDEA(ideaKey, second.id), NOTE_IN_IDEA(ideaKey, first.id));

        expect(writes()[0].url).toMatch(/\/ideas\/\d+\/notes\/order$/);
        expect(writes()[0].body).toEqual({ noteIds: [second.id, first.id] });
        await waitFor(() => expect(titlesOfKind('note')).toEqual(['Second', 'First']));
    });

    test('reorders topics at the root', async () => {
        const faith = addTopic('Faith');
        const grace = addTopic('Grace');

        await mount();
        await waitFor(() => expect(titlesOfKind('topic')).toEqual(['Faith', 'Grace']));

        await dragOnto(TOPIC_KEY(grace.id), TOPIC_KEY(faith.id));

        // A topic has no link row above it, so its position is its own
        // sort_order and the whole list is sent.
        expect(writes()[0].body).toEqual({ topicIds: [grace.id, faith.id] });
        await waitFor(() => expect(titlesOfKind('topic')).toEqual(['Grace', 'Faith']));
    });

    test('leaves the unfiled buckets alone — they list in creation order', async () => {
        // Arrange — two orphan notes. Neither has a link row, so there is no
        // sort_order between them and a container to write.
        const first = addNote('First loose');
        const second = addNote('Second loose');

        await mount();
        await open('unfiled-notes');
        await waitFor(() => expect(titlesOfKind('note')).toEqual(['First loose', 'Second loose']));

        // Act
        await dragOnto(UNFILED_NOTE(second.id), UNFILED_NOTE(first.id));

        // Assert — no request, and the order is unchanged.
        expect(writes()).toHaveLength(0);
        expect(titlesOfKind('note')).toEqual(['First loose', 'Second loose']);
    });
});

describe('opening a note', () => {
    test('links to Analyze at the note first reference, opened on the note', async () => {
        // Arrange
        const faith = addTopic('Faith');
        const abiding = addIdea('Abiding');
        const anchored = addNote('Anchored', { bookId: 43, chapter: 15 });
        fileIdea(abiding.id, faith.id);
        fileNote(anchored.id, abiding.id);

        await mount();
        await open(TOPIC_KEY(faith.id));
        await waitFor(() => expect(rowsOfKind('idea')).toHaveLength(1));
        await open(IDEA_IN_TOPIC(faith.id, abiding.id));
        await waitFor(() => expect(titlesOfKind('note')).toEqual(['Anchored']));

        // Assert
        expect(screen.getByRole('link', { name: 'Anchored' }))
            .toHaveAttribute('href', `/analyze?l=43.15&note=${anchored.id}`);
    });

    test('links a note with no anchor without a position', async () => {
        const loose = addNote('Loose note');

        await mount();
        await open('unfiled-notes');
        await waitFor(() => expect(titlesOfKind('note')).toEqual(['Loose note']));

        expect(screen.getByRole('link', { name: 'Loose note' }))
            .toHaveAttribute('href', `/analyze?note=${loose.id}`);
    });
});

describe('failures', () => {
    test('shows the error when a branch cannot be loaded', async () => {
        const faith = addTopic('Faith');
        await mount();
        await waitFor(() => expect(rowsOfKind('topic')).toHaveLength(1));

        // The topic is gone by the time its branch is asked for.
        store.topics = [];

        await open(TOPIC_KEY(faith.id));

        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('could not find that'));
    });
});

// ─── Arriving with a row to focus ───────────────────────────────────────────
//
// Search results for an idea and a topic land here, so the page has to open
// what holds the row and mark it. The two-step case is the one worth having:
// an idea's row does not exist until its topic's branch has loaded, so
// focusing one is expand-then-find rather than a lookup.

describe('focus from the URL', () => {
    test('opens the topic a link names and marks its row', async () => {
        // Arrange
        const faith = addTopic('Faith');
        const grace = addIdea('Grace');
        fileIdea(grace.id, faith.id);

        // Act
        await mount(`/topics-tree?topic=${faith.id}`);

        // Assert — opened, so its ideas are on screen…
        await waitFor(() => expect(titlesOfKind('idea')).toEqual(['Grace']));
        // …and the topic itself is the row the reader came for.
        expect(row(TOPIC_KEY(faith.id))).toHaveClass('tree-row--focused');
    });

    test('marks the idea, not its topic, when the link names both', async () => {
        // Arrange
        const faith = addTopic('Faith');
        const grace = addIdea('Grace');
        const mercy = addIdea('Mercy');
        fileIdea(grace.id, faith.id);
        fileIdea(mercy.id, faith.id);

        // Act
        await mount(`/topics-tree?topic=${faith.id}&idea=${mercy.id}`);

        // Assert — the row only exists once the branch has loaded, which is
        // what makes this the two-step case.
        await waitFor(() => expect(row(IDEA_IN_TOPIC(faith.id, mercy.id)))
            .toHaveClass('tree-row--focused'));
        expect(row(TOPIC_KEY(faith.id))).not.toHaveClass('tree-row--focused');
    });

    test('opens the unfiled bucket for an idea filed under no topic', async () => {
        // Arrange — an idea under no topic has no row anywhere else in the tree.
        const loose = addIdea('Loose idea');

        // Act
        await mount(`/topics-tree?idea=${loose.id}`);

        // Assert
        await waitFor(() => expect(titlesOfKind('idea')).toEqual(['Loose idea']));
        expect(row(`unfiled-ideas/idea:${loose.id}`)).toHaveClass('tree-row--focused');
    });

    test('lets the reader close a row the link opened', async () => {
        // Arrange — the params stay in the URL after the page has acted on
        // them, exactly as Analyze's ?note= does, so nothing may reopen it.
        const faith = addTopic('Faith');
        const grace = addIdea('Grace');
        fileIdea(grace.id, faith.id);
        await mount(`/topics-tree?topic=${faith.id}`);
        await waitFor(() => expect(titlesOfKind('idea')).toEqual(['Grace']));

        // Act
        await open(TOPIC_KEY(faith.id));

        // Assert
        expect(titlesOfKind('idea')).toEqual([]);
    });

    test('renders the tree normally when the link names something gone', async () => {
        // Arrange — a saved link to a topic that has since been deleted.
        addTopic('Faith');

        // Act
        await mount('/topics-tree?topic=999');

        // Assert — the page, not an error, and nothing focused.
        await waitFor(() => expect(titlesOfKind('topic')).toEqual(['Faith']));
        expect(document.querySelector('.tree-row--focused')).toBeNull();
    });

    test('focuses nothing when no link asked for anything', async () => {
        // Arrange
        addTopic('Faith');

        // Act
        await mount();

        // Assert
        await waitFor(() => expect(titlesOfKind('topic')).toEqual(['Faith']));
        expect(document.querySelector('.tree-row--focused')).toBeNull();
    });
});
