import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
    store = { topics: [], ideas: [], notes: [], passages: [], pins: [], nextTopicId: 1 };
};

const jsonResponse = (body, status = 200) => Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
});

const addTopic = ({ name, slug, description }) => {
    const topic = {
        id: store.nextTopicId,
        name,
        slug: slug || name,
        description: description || '',
        ideaCount: 0,
    };

    store.nextTopicId += 1;
    store.topics = [...store.topics, topic];
    return topic;
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

    if (url.endsWith('/topics') && method === 'GET') {
        return jsonResponse({ topics: store.topics });
    }

    if (url.endsWith('/topics') && method === 'POST') {
        return jsonResponse({ topic: addTopic(body) }, 201);
    }

    if (url.endsWith('/ideas') && method === 'GET') {
        return jsonResponse({ ideas: store.ideas });
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
        store.ideas = [{ id: 5, title: 'Covenant renewal', body: '', topics: [] }];
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
