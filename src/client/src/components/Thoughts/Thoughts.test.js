import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Thoughts from './Thoughts';
import { CREATE_FORMS } from './CreateModal';
import {
    CLEAR_CONFIRM_LABEL,
    CLEAR_LABEL,
    CLEAR_QUESTION,
    EMPTY_MESSAGE,
    UNSCOPED_MESSAGE,
} from './PinnedPanel';

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
// is listed by its CURRENT name — the fake does the same join, for either tier.
const hydratePin = (pin) => {
    const item = pin.itemType === 'topic'
        ? store.topics.find(topic => topic.id === pin.itemId)
        : store.ideas.find(idea => idea.id === pin.itemId);

    return { ...pin, title: (item || {}).name || (item || {}).title || '' };
};

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

    // PUT /api/ideas/:id/topics, refusing a cross-book pair exactly as the
    // server does — the rule lives in hasTopicOutsideIdeaBook and is answered
    // 422 before anything is written. Stateful like the rest of this fake, so
    // a link that IS allowed is visible on the next read.
    const ideaTopics = /\/ideas\/(\d+)\/topics$/.exec(url);
    if (ideaTopics && method === 'PUT') {
        const idea = store.ideas.find(row => row.id === Number(ideaTopics[1]));
        if (!idea) return jsonResponse({ error: 'Idea not found' }, 404);

        const picked = body.topicIds.map(id => store.topics.find(topic => topic.id === id));
        if (picked.some(topic => !topic)) {
            return jsonResponse({ error: 'topicIds names a topic that does not exist' }, 400);
        }

        if (picked.some(topic => topic.bookId !== idea.bookId)) {
            return jsonResponse({
                error: 'A topic and an idea can only be linked when they are in the same book.',
            }, 422);
        }

        const linked = { ...idea, topics: picked.map(({ id, name, slug }) => ({ id, name, slug })) };
        store.ideas = store.ideas.map(row => (row.id === idea.id ? linked : row));
        return jsonResponse({ idea: linked });
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

    // Changing book used to clear the pinned set. It no longer does: the panel
    // is filtered to the book on screen, which is what keeps a cross-book pair
    // out of a Link, and the only clear the API has reaches every book the
    // reader owns — including books they never opened on this page.
    test('changing book leaves the pinned set alone, in this book and every other', async () => {
        // Arrange - one pin in Matthew, which is where the page opens.
        const topic = addTopic({ name: 'Faith', bookId: 40 });
        store.pins = [{ itemType: 'topic', itemId: topic.id }];

        await renderThoughts('/thoughts?book=40');
        expect(within(panel()).getByText('Faith')).toBeInTheDocument();

        // Act - away to Mark, where the pin is out of scope.
        fireEvent.click(await screen.findByRole('button', { name: /Matthew Topics/ }));
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Mark' }));
        });

        // Assert - hidden, not deleted, and nothing was asked of the server.
        expect(await screen.findByRole('heading', { name: 'Pinned (0)' })).toBeInTheDocument();
        expect(within(panel()).queryByText('Faith')).not.toBeInTheDocument();
        expect(requests.some(r => r.method === 'DELETE' && r.url.includes('/pins'))).toBe(false);
        expect(store.pins).toHaveLength(1);

        // Act - and back again, the return trip the filter's promise rests on.
        fireEvent.click(await screen.findByRole('button', { name: /Mark Topics/ }));
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Matthew' }));
        });

        // Assert
        expect(await screen.findByRole('heading', { name: 'Pinned (1)' })).toBeInTheDocument();
        expect(within(panel()).getByText('Faith')).toBeInTheDocument();
    });

    // ─── The panel holds this book's pins, and only this book's ────────────
    //
    // Pins are per-user and carry no book, so a topic pinned while reading
    // Matthew is still on the server when the reader next ENTERS Thoughts in
    // Mark, and nothing on this page deletes it. Left in the panel it is selectable beside a Mark idea, and Link
    // would file that idea under a topic Mark's field does not draw — the idea
    // would then hang off a topic on no canvas at all, with no way to undo it
    // from this page.
    test('a pin from another book is not in the panel when the page opens in this one', async () => {
        // Arrange — pinned while reading Matthew; the reader is now in Mark.
        const matthewTopic = addTopic({ name: 'Faith', bookId: 40 });
        addIdea({ title: 'Mustard seed', bookId: 41 });
        store.pins = [{ itemType: 'topic', itemId: matthewTopic.id }];

        // Act
        await renderThoughts('/thoughts?book=41');

        // Assert
        expect(screen.getByRole('heading', { name: 'Pinned (0)' })).toBeInTheDocument();
        expect(within(panel()).queryByText('Faith')).not.toBeInTheDocument();
    });

    // The other half of the rule above: the filter scopes the panel rather
    // than emptying it, and a pin is still there when the reader comes back
    // to the book it was placed in — nothing was deleted behind their back.
    test('a pin from this book is in the panel, and still there on return', async () => {
        const matthewTopic = addTopic({ name: 'Faith', bookId: 40 });
        store.pins = [{ itemType: 'topic', itemId: matthewTopic.id }];

        await renderThoughts('/thoughts?book=40');

        expect(screen.getByRole('heading', { name: 'Pinned (1)' })).toBeInTheDocument();
        expect(within(panel()).getByText('Faith')).toBeInTheDocument();
        expect(store.pins).toHaveLength(1);
    });

    // Clear is the one control in the panel that is NOT scoped to the book on
    // screen: DELETE /api/pins/all is the only clear the API has, and widening
    // /api/pins is a non-goal. The reach is deliberate, so what has to be true
    // is that the words admit it before the reader answers — "Pinned (1)" over
    // a button that silently unpins three would be the page misleading them.
    test('Clear reaches every book, and says so before it does', async () => {
        // Arrange — one pin in each of two books, the page showing Mark.
        const matthewTopic = addTopic({ name: 'Faith', bookId: 40 });
        const markTopic = addTopic({ name: 'Discipleship', bookId: 41 });
        store.pins = [
            { itemType: 'topic', itemId: matthewTopic.id },
            { itemType: 'topic', itemId: markTopic.id },
        ];

        await renderThoughts('/thoughts?book=41');
        expect(screen.getByRole('heading', { name: 'Pinned (1)' })).toBeInTheDocument();

        // Act — the question names the scope the count above it cannot.
        await clickButton(CLEAR_LABEL);
        expect(screen.getByText(CLEAR_QUESTION)).toBeInTheDocument();
        await clickButton(CLEAR_CONFIRM_LABEL);

        // Assert — both went, which is what the words just promised.
        await waitFor(() => expect(store.pins).toHaveLength(0));
    });

    // Pins hidden by the book filter are still pins, and Clear is the only
    // thing on this page that can reach them. Disabled on the shown count
    // alone, a reader in a book they have pinned nothing in could not clear
    // the other book's pins from here at all.
    test('Clear is pressable when every pin is in another book', async () => {
        const matthewTopic = addTopic({ name: 'Faith', bookId: 40 });
        store.pins = [{ itemType: 'topic', itemId: matthewTopic.id }];

        await renderThoughts('/thoughts?book=41');

        expect(screen.getByRole('heading', { name: 'Pinned (0)' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: CLEAR_LABEL })).toBeEnabled();
    });

    // The panel's list is `pins` read through the corpus, so before the corpus
    // arrives it knows nothing about what it holds. A bare /thoughts guarantees
    // that window — the scope is seeded from the saved location, and /topics
    // and /ideas are not asked for until it resolves, long after /pins has
    // answered — and "Nothing pinned yet" said into it is simply false.
    test('the panel does not claim to be empty before the corpus has loaded', async () => {
        const topic = addTopic({ name: 'Faith', bookId: 40 });
        store.pins = [{ itemType: 'topic', itemId: topic.id }];

        let releaseLocation;
        const locationGate = new Promise(resolve => { releaseLocation = resolve; });

        global.fetch = jest.fn((url, options = {}) => {
            const isLocationRead = url.endsWith('/user/location') && (options.method || 'GET') === 'GET';
            return isLocationRead
                ? locationGate.then(() => handleRequest(url, options))
                : handleRequest(url, options);
        });

        await act(async () => {
            render(
                <MemoryRouter initialEntries={['/thoughts']}>
                    <Thoughts />
                </MemoryRouter>
            );
        });

        // /pins has answered; the corpus has not been asked for yet.
        expect(within(panel()).queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();

        await act(async () => {
            releaseLocation();
            await locationGate;
        });

        // …and once it lands, the pin the panel was quiet about is there.
        expect(within(panel()).getByText('Faith')).toBeInTheDocument();
    });

    // A corpus that never arrives is the opposite case to the one above, and
    // waiting is the wrong answer to it: nothing further is coming, so a panel
    // left on "Loading pins…" would stay there, and filtering against lists
    // that are now empty would hide every topic and idea the reader pinned —
    // taking away the page's only editing surface exactly when a reload is the
    // only way back.
    test('a failed corpus load shows the pins whole, and says they are not book-scoped', async () => {
        // Arrange — a pin the reader can see, and a topics read that 500s.
        const topic = addTopic({ name: 'Faith', bookId: 40 });
        store.pins = [{ itemType: 'topic', itemId: topic.id }];

        global.fetch = jest.fn((url, options = {}) => (
            (/\/topics(\?|$)/.test(url) && (options.method || 'GET') === 'GET')
                ? jsonResponse({ error: 'topics are down' }, 500)
                : handleRequest(url, options)
        ));

        // Act
        await renderThoughts('/thoughts?book=40');

        // Assert — the pin is in hand, the panel is not still claiming to be
        // working on it, and the widened scope is stated rather than implied.
        expect(within(panel()).queryByText(/Loading pins/)).not.toBeInTheDocument();
        expect(within(panel()).getByText('Faith')).toBeInTheDocument();
        expect(within(panel()).getByText(UNSCOPED_MESSAGE)).toBeInTheDocument();
    });

    // The notice above names the BOOK as the thing that failed, so it may only
    // appear when the book is what failed. A pins read that 500s is the other
    // failure this page can have, and it has its own banner — saying the book
    // could not be loaded over a book that loaded perfectly well would send the
    // reader looking for a problem that is not there.
    test('a failed pins load is not blamed on the book', async () => {
        // Arrange — the corpus answers normally; /pins does not.
        addTopic({ name: 'Faith', bookId: 40 });

        global.fetch = jest.fn((url, options = {}) => (
            (url.endsWith('/pins') && (options.method || 'GET') === 'GET')
                ? jsonResponse({ error: 'pins are down' }, 500)
                : handleRequest(url, options)
        ));

        // Act
        await renderThoughts('/thoughts?book=40');

        // Assert — the failure is reported, and not as the book's.
        expect(await screen.findByRole('alert')).toHaveTextContent(/server ran into a problem/i);
        expect(within(panel()).queryByText(UNSCOPED_MESSAGE)).not.toBeInTheDocument();
    });

    // The one window in which the panel can offer a cross-book pair: with no
    // corpus it cannot tell which book anything is in, so it shows every pin
    // and Link is pressable over two books. The rule is the server's — it
    // refuses the write — and what this page owes the reader is the reason,
    // not a silent failure or a generic "that request was not valid".
    test('a cross-book link is refused, and the panel says why', async () => {
        // Arrange — a Matthew topic and a Mark idea, both pinned, with the
        // corpus down so both are listed together.
        const matthewTopic = addTopic({ name: 'Faith', bookId: 40 });
        const markIdea = addIdea({ title: 'Mustard seed', bookId: 41 });
        store.pins = [
            { itemType: 'topic', itemId: matthewTopic.id },
            { itemType: 'idea', itemId: markIdea.id },
        ];

        global.fetch = jest.fn((url, options = {}) => (
            (/\/topics(\?|$)/.test(url) && (options.method || 'GET') === 'GET')
                ? jsonResponse({ error: 'topics are down' }, 500)
                : handleRequest(url, options)
        ));

        await renderThoughts('/thoughts?book=41');

        // Act — select both tiers and press the panel's Link.
        fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Select Faith' }));
        fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Select Mustard seed' }));
        await clickButton('Link');

        // Assert — the refusal reaches the reader in words that name the rule,
        // and nothing was written.
        await waitFor(() => expect(
            screen.getAllByRole('alert').some(alert => /same book/i.test(alert.textContent))
        ).toBe(true));
        expect(store.ideas.find(idea => idea.id === markIdea.id).topics).toHaveLength(0);
    });

    // The mirror: the same panel, the same button, a pair the rule allows.
    // Without this the test above would pass just as well against a Link that
    // refused everything.
    test('a same-book link still goes through', async () => {
        const markTopic = addTopic({ name: 'Discipleship', bookId: 41 });
        const markIdea = addIdea({ title: 'Mustard seed', bookId: 41 });
        store.pins = [
            { itemType: 'topic', itemId: markTopic.id },
            { itemType: 'idea', itemId: markIdea.id },
        ];

        await renderThoughts('/thoughts?book=41');

        fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Select Discipleship' }));
        fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Select Mustard seed' }));
        await clickButton('Link');

        await waitFor(() => expect(
            store.ideas.find(idea => idea.id === markIdea.id).topics
        ).toHaveLength(1));
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

    // A bare /thoughts has no `?book=` and no `?idea=`, so useBookScope must
    // read the saved location before bookId is known — see the "nothing is
    // fetched before the scope is settled" test above. That gap is exactly
    // the window a reader could otherwise press + Topic in and post a create
    // with no bookId, which the real server 400s on. This holds the page in
    // that window on purpose, with a promise this test controls rather than a
    // timer, so the assertions land deterministically inside it rather than
    // racing it.
    //
    // This is the one place both create controls are checked together on
    // purpose: TopBar draws both off the single `isResolving` Thoughts.js
    // holds (see the prop it passes down), so this is one fact proven at two
    // buttons, not two facts that happen to agree today.
    test('the create controls wait for the book in scope, then unlock', async () => {
        let releaseLocation;
        const locationGate = new Promise(resolve => { releaseLocation = resolve; });

        global.fetch = jest.fn((url, options = {}) => {
            const isLocationRead = url.endsWith('/user/location') && (options.method || 'GET') === 'GET';
            return isLocationRead
                ? locationGate.then(() => handleRequest(url, options))
                : handleRequest(url, options);
        });

        await act(async () => {
            render(
                <MemoryRouter initialEntries={['/thoughts']}>
                    <Thoughts />
                </MemoryRouter>
            );
        });

        // Still resolving: neither control may invite a press that cannot
        // succeed, the same way the rest of the page is already saying
        // "Loading your thoughts…" in this window.
        expect(screen.getByRole('button', { name: '+ Topic' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '+ Idea' })).toBeDisabled();

        // Let the seed resolve.
        await act(async () => {
            releaseLocation();
            await locationGate;
        });

        // The scope is known now, and the controls say so.
        expect(await screen.findByRole('button', { name: '+ Topic' })).toBeEnabled();
        expect(screen.getByRole('button', { name: '+ Idea' })).toBeEnabled();
    });
});
