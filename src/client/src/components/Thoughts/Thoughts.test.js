import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Thoughts from './Thoughts';
import { CREATE_FORMS } from './CreateModal';

// ─── Creating on this page means pinning ────────────────────────────────────
//
// The panel is the page's only editing surface — there is no input for a topic
// anywhere else — so a topic created here and left unpinned would be a topic
// the reader has just named and cannot touch. The auto-pin is what makes the
// create button worth having, and it is wiring between two hooks that neither
// hook can assert on its own: useThoughtsData makes the row, usePins pins it,
// and this page is the only thing that knows they are about the same item.
//
// So the test is the whole round trip through the real components — the bar's
// button, the modal's fields, the panel's list — over a standing-in API. A
// create that forgot to pin, or that pinned the wrong id, fails here and
// nowhere else.

let store;
let requests;

const resetStore = () => {
    store = {
        topics: [], ideas: [], notes: [], passages: [], pins: [], nextTopicId: 1, nextIdeaId: 1,
        location: { primary: { bookId: 40, chapter: 1 }, compare: null, noteId: null },
    };
};

// The 66-book canon useBooks reads. Only the two books the suite actually
// scopes to are here — everything else about the canon is BookGrid's own
// tests' business.
const BOOKS = [
    { id: 40, name: 'Matthew', testament: 'NT', canonicalOrder: 40, chapterCount: 28 },
    { id: 41, name: 'Mark', testament: 'NT', canonicalOrder: 41, chapterCount: 16 },
];

const jsonResponse = (body, status = 200) => Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
});

const addTopic = ({ name, slug, description, bookId = 40 }) => {
    const topic = {
        id: store.nextTopicId,
        name,
        slug: slug || name,
        description: description || '',
        ideaCount: 0,
        bookId,
    };

    store.nextTopicId += 1;
    store.topics = [...store.topics, topic];
    return topic;
};

const addIdea = ({ title, body, bookId = 40 }) => {
    const idea = {
        id: store.nextIdeaId,
        title,
        body: body || '',
        topics: [],
        bookId,
    };

    store.nextIdeaId += 1;
    store.ideas = [...store.ideas, idea];
    return idea;
};

// Matches with or without the scope, and applies it when it is there — so a
// test asserting that the page asked for one book is asserting against a
// server that actually answers differently, rather than one that ignores the
// param. This is the failure commit 5d39cb8 fixed for note_topics.
const scopedList = (url, kind) => {
    const match = new RegExp(`/${kind}(\\?book=(\\d+))?$`).exec(url);
    if (!match) return null;

    const bookId = match[2] === undefined ? null : Number(match[2]);
    const rows = bookId === null
        ? store[kind]
        : store[kind].filter(row => row.bookId === bookId);

    return jsonResponse({ [kind]: rows });
};

// The server hydrates a pin by joining the item's own table, so a pinned topic
// is listed by its CURRENT name — the fake does the same join.
const hydratePin = (pin) => ({
    ...pin,
    title: (store.topics.find(topic => topic.id === pin.itemId) || {}).name || '',
});

const handleRequest = (url, options = {}) => {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;
    requests.push({ url, method, body });

    if (method === 'GET') {
        const topics = scopedList(url, 'topics');
        if (topics) return topics;

        const ideas = scopedList(url, 'ideas');
        if (ideas) return ideas;
    }

    if (url.endsWith('/topics') && method === 'POST') {
        return jsonResponse({ topic: addTopic(body) }, 201);
    }

    if (url.endsWith('/ideas') && method === 'POST') {
        return jsonResponse({ idea: addIdea(body) }, 201);
    }

    if (url.endsWith('/books') && method === 'GET') {
        return jsonResponse({ books: BOOKS });
    }

    if (url.endsWith('/user/location') && method === 'GET') {
        return jsonResponse({ location: store.location });
    }

    // The idea view's three reads, in the order the page issues them: the idea
    // with its note rows, the passages for the whole ring, then each note's
    // body. The passages come back as one flat list carrying `noteId`, exactly
    // as GET /api/ideas/:id/passages ships them — the page is what groups them.
    const ideaPassages = /\/ideas\/(\d+)\/passages$/.exec(url);
    if (ideaPassages && method === 'GET') {
        return jsonResponse({ passages: store.passages });
    }

    const idea = /\/ideas\/(\d+)$/.exec(url);
    if (idea && method === 'GET') {
        const found = store.ideas.find(row => row.id === Number(idea[1]));
        if (!found) return jsonResponse({ error: 'not found' }, 404);

        return jsonResponse({
            idea: { ...found, notes: store.notes.map(({ id, title }) => ({ id, title })) },
        });
    }

    const note = /\/notes\/(\d+)$/.exec(url);
    if (note && method === 'GET') {
        const found = store.notes.find(row => row.id === Number(note[1]));
        if (!found) return jsonResponse({ error: 'not found' }, 404);

        return jsonResponse({ note: found });
    }

    if (url.endsWith('/pins') && method === 'GET') {
        return jsonResponse({ pins: store.pins.map(hydratePin) });
    }

    if (url.endsWith('/pins') && method === 'POST') {
        store.pins = [...store.pins, { ...body, createdAt: '2026-08-20T10:00:00.000Z' }];
        return jsonResponse({}, 201);
    }

    if (url.endsWith('/pins/all') && method === 'DELETE') {
        store.pins = [];
        return jsonResponse({}, 204);
    }

    return jsonResponse({ error: 'not found' }, 404);
};

beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    resetStore();
    requests = [];
    global.fetch = jest.fn(handleRequest);
});

afterEach(() => {
    jest.resetAllMocks();
    localStorage.clear();
});

// Mounted inside an async act so the load requests, which resolve on the
// microtask queue right after render, land while React still expects updates.
const renderThoughts = async (entry = '/thoughts') => {
    await act(async () => {
        render(
            <MemoryRouter initialEntries={[entry]}>
                <Thoughts />
            </MemoryRouter>
        );
    });
};

const clickButton = async (name) => {
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name }));
    });
};

const panel = () => screen.getByRole('complementary', { name: 'Pinned' });

describe('creating a topic from the top bar', () => {
    test('leaves the new topic pinned, so the panel can edit it', async () => {
        // Arrange
        await renderThoughts();
        expect(screen.getByRole('heading', { name: 'Pinned (0)' })).toBeInTheDocument();

        // Act
        await clickButton('+ Topic');
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Providence' } });
        await clickButton(CREATE_FORMS.topic.submitLabel);

        // Assert — the row is in the panel, under its tier…
        expect(screen.getByRole('heading', { name: 'Pinned (1)' })).toBeInTheDocument();
        expect(within(panel()).getByText('Providence')).toBeInTheDocument();
        expect(within(panel()).getByText('TOPIC')).toBeInTheDocument();

        // …and it is pinned on the server, by the id the create came back with.
        expect(requests).toContainEqual(expect.objectContaining({
            method: 'POST',
            body: { itemType: 'topic', itemId: 1 },
        }));

        // The modal is done: the item is now editable in the panel.
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    test('does not pin anything when the create itself fails', async () => {
        // Arrange
        await renderThoughts();
        global.fetch = jest.fn((url, options = {}) => (
            (options.method === 'POST' && url.endsWith('/topics'))
                ? jsonResponse({ error: 'nope' }, 500)
                : handleRequest(url, options)
        ));

        // Act
        await clickButton('+ Topic');
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Providence' } });
        await clickButton(CREATE_FORMS.topic.submitLabel);

        // Assert
        expect(screen.getByRole('heading', { name: 'Pinned (0)' })).toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent(/server ran into a problem/i);
        // Still open, still holding what was typed, so the reader can retry.
        expect(screen.getByLabelText('Name')).toHaveValue('Providence');
    });
});

// ─── The idea view's passages ───────────────────────────────────────────────
//
// A note stores WHERE it is anchored and never what the passage says, and this
// page shows scripture nowhere else — so the verses behind a note's anchors are
// a request of their own, and one the ring cannot draw without.
//
// The join is the thing worth a test here rather than in IdeaOrbit's own file.
// The passages arrive as one flat list for the whole idea while the bodies
// arrive one note at a time, and matching them up is this page's hook doing it:
// a grouping keyed on the wrong field, or a fetch that never went out, is a
// ring of note cards that bloom into nothing, and every component below would
// still pass its own tests.
describe('opening an idea', () => {
    const seedIdea = () => {
        store.ideas = [{ id: 5, title: 'Covenant renewal', body: '', topics: [], bookId: 40 }];
        store.notes = [
            { id: 9, title: 'Light first', body: 'Order of creation', references: [], ideas: [] },
            { id: 10, title: 'Unanchored', body: 'No verses here', references: [], ideas: [] },
        ];
        store.passages = [{
            id: 3,
            noteId: 9,
            bookId: 1,
            bookName: 'Genesis',
            chapter: 1,
            startVerse: 3,
            endVerse: 3,
            startIndex: 2,
            endIndex: 2,
            sortOrder: 0,
            verses: [{ verse: 3, verseIndex: 2, text: 'Let there be light.' }],
        }];
    };

    test('draws each note with the scripture its anchors point at', async () => {
        // Arrange
        seedIdea();

        // Act
        await renderThoughts('/thoughts?idea=5');

        // Assert — the passage went to the note that owns it, and only to it.
        expect(screen.getByText('Genesis 1:3')).toBeInTheDocument();
        expect(screen.getByText('Let there be light.', { exact: false })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Light first/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Unanchored/ })).not.toBeInTheDocument();
    });

    test('asks for them once for the whole ring, not once per note', async () => {
        // Arrange
        seedIdea();

        // Act
        await renderThoughts('/thoughts?idea=5');

        // Assert — two notes, one passages request.
        const passageRequests = requests.filter(request => request.url.includes('/passages'));
        expect(passageRequests).toHaveLength(1);
        expect(passageRequests[0].url).toMatch(/\/ideas\/5\/passages$/);
    });
});

// ─── Scoping the page to one book ────────────────────────────────────────────
describe('scoping the page to one book', () => {
    test('asks for only the book in scope', async () => {
        await renderThoughts('/thoughts?book=41');

        const listReads = requests.filter(r => r.method === 'GET' && /\/(topics|ideas)/.test(r.url));
        expect(listReads).not.toHaveLength(0);
        listReads.forEach(read => expect(read.url).toContain('book=41'));
    });

    test('a book with nothing in it says so, and is not an error', async () => {
        addTopic({ name: 'Faith', bookId: 40 });
        await renderThoughts('/thoughts?book=41');

        expect(await screen.findByText(/No topics in Mark yet/)).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    test('nothing is fetched before the scope is settled', async () => {
        // A bare /thoughts has to read the saved location first. If the corpus
        // fetch did not wait, it would ask for the wrong book and immediately ask
        // again — two reads where there should be one.
        await renderThoughts('/thoughts');

        const topicReads = requests.filter(r => r.method === 'GET' && /\/topics/.test(r.url));
        expect(topicReads).toHaveLength(1);
        expect(topicReads[0].url).toContain('book=40');
    });

    test('changing book clears the pinned set, with no confirmation', async () => {
        const topic = addTopic({ name: 'Faith', bookId: 40 });
        store.pins = [{ itemType: 'topic', itemId: topic.id }];

        await renderThoughts('/thoughts?book=40');

        fireEvent.click(await screen.findByRole('button', { name: /Matthew Topics/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Mark' }));

        await waitFor(() => expect(
            requests.some(r => r.method === 'DELETE' && r.url.endsWith('/pins/all'))
        ).toBe(true));
        // No dialog stood between the press and the clear — pins are temporary by
        // design, and the reader clears them constantly by hand already.
        expect(screen.queryByRole('dialog', { name: /sure/i })).not.toBeInTheDocument();

        // The set is actually empty afterwards — on the server the fake stands
        // in for, not only that a DELETE happened to go out — which is what
        // this test's name claims.
        await waitFor(() => expect(store.pins).toHaveLength(0));
        expect(screen.getByRole('heading', { name: 'Pinned (0)' })).toBeInTheDocument();
    });

    test('a failed clear still changes the book, and says what happened', async () => {
        addTopic({ name: 'Faith', bookId: 40 });
        await renderThoughts('/thoughts?book=40');

        const answer = global.fetch.getMockImplementation();
        global.fetch = jest.fn((url, options = {}) => (
            // A 500, not a rejected fetch: the server is reachable and simply
            // fails the write, which is the more realistic shape of "pins are
            // down" than a network-level failure would be, and it exercises
            // fetchJson's non-ok path rather than its connection-error path.
            (options.method === 'DELETE' && url.endsWith('/pins/all'))
                ? jsonResponse({ error: 'pins are down' }, 500)
                : answer(url, options)
        ));

        fireEvent.click(await screen.findByRole('button', { name: /Matthew Topics/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Mark' }));

        // The reader asked for the book change; a pin left behind is visible and
        // recoverable, and refusing the navigation over it would be the louder
        // wrong answer.
        expect(await screen.findByRole('button', { name: /Mark Topics/ })).toBeInTheDocument();
        // fetchJson deliberately substitutes a displayable message for a non-ok
        // response rather than passing along whatever the server actually said
        // (see its header comment and MESSAGE_BY_STATUS in config/api.js), so
        // this asserts on that user-facing copy rather than on the raw server
        // error above — the raw cause is never meant to reach the UI.
        expect(await screen.findByRole('alert')).toHaveTextContent(/server ran into a problem/i);
    });

    test('a topic created here belongs to the book in scope', async () => {
        await renderThoughts('/thoughts?book=41');

        fireEvent.click(await screen.findByRole('button', { name: '+ Topic' }));
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Discipleship' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create topic' }));

        await waitFor(() => expect(
            requests.some(r => r.method === 'POST' && r.url.endsWith('/topics') && r.body.bookId === 41)
        ).toBe(true));
    });

    // The server requires bookId on POST /ideas exactly as it does on
    // POST /topics (see Thoughts.js's createAndPin), and the two creates
    // share that one line — but a passing topic test does not prove the idea
    // path also names its book, since the two forms post to different
    // endpoints. This mirrors the topic test above for the idea form.
    test('an idea created here belongs to the book in scope', async () => {
        await renderThoughts('/thoughts?book=41');

        fireEvent.click(await screen.findByRole('button', { name: '+ Idea' }));
        fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Grace and law' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create idea' }));

        await waitFor(() => expect(
            requests.some(r => r.method === 'POST' && r.url.endsWith('/ideas') && r.body.bookId === 41)
        ).toBe(true));
    });
});
