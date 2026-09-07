import React from 'react';
import { act, render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import Analyze from './Analyze';
// The real wrapper production code sends every write through, so a test that
// calls it hits the same request-building path a component would — no
// hand-rolled fetch call to drift out of step with the real one.
import { fetchJson } from '../../config/api';

// A miniature canon standing in for /api/books. Ids and canonical order match
// the real ones for the books used here.
const books = [
    { id: 1, name: 'Genesis', abbrev: 'Gen', testament: 'OT', chapterCount: 50, canonicalOrder: 1,
      chapters: [{ number: 1, verseCount: 31 }, { number: 2, verseCount: 25 }] },
    { id: 2, name: 'Exodus', abbrev: 'Exod', testament: 'OT', chapterCount: 40, canonicalOrder: 2,
      chapters: [{ number: 1, verseCount: 22 }] },
    { id: 40, name: 'Matthew', abbrev: 'Matt', testament: 'NT', chapterCount: 28, canonicalOrder: 40,
      chapters: [{ number: 1, verseCount: 25 }, { number: 2, verseCount: 23 }] },
];

const findBook = (id) => books.find(book => book.id === id);

// Two verses per chapter is enough to assert row markup. verse_index is faked
// as a stable function of the reference — gapless within a chapter, and far
// enough apart between chapters that ranges never accidentally overlap, which
// is the property the real importer guarantees.
const VERSES_PER_CHAPTER = 2;
const chapterStartIndex = (bookId, chapter) => bookId * 1000 + chapter * 10;
const verseIndexOf = (bookId, chapter, verse) => chapterStartIndex(bookId, chapter) + verse - 1;

const versesOf = (bookId, chapter) => {
    const book = findBook(bookId);
    return Array.from({ length: VERSES_PER_CHAPTER }, (unused, offset) => {
        const verse = offset + 1;
        return {
            id: verseIndexOf(bookId, chapter, verse),
            verse,
            verseIndex: verseIndexOf(bookId, chapter, verse),
            text: `${book.name} ${chapter}:${verse} text`,
        };
    });
};

// ─── A standing-in notes API ────────────────────────────────────────────────
//
// Stateful rather than a fixed fixture, because the flows under test are round
// trips: create a note, then assert the highlight the *server* reports on the
// next chapter fetch. A canned response would let a client-side guess pass.

let store;

const resetStore = () => {
    store = {
        notes: [],
        references: [],
        // The ideas tier and its link table. Ideas are seeded by tests that
        // need them; the link set is only ever replaced whole, exactly as the
        // server replaces it.
        ideas: [],
        noteIdeas: [],
        // The note tier's DIRECT edge to topics — note_topics, not the topics
        // a note reaches through an idea. Replaced whole, exactly as the
        // server replaces it.
        noteTopics: [],
        // The topics the importer's field of bubbles is built from, and the
        // per-chapter shortlist it writes into. Both are seeded by the tests
        // that need them; an idea under no topic still reaches the field
        // through its "unfiled" bubble.
        topics: [],
        chapterIdeas: [],
        nextNoteId: 1,
        nextReferenceId: 1,
        nextIdeaId: 1,
        nextTopicId: 1,
        // Where this reader was last, as GET /api/user/location answers it.
        // Null in every test that does not care, which is how the endpoint
        // answers for an account that has not been anywhere yet.
        location: { primary: null, compare: null, noteId: null },
    };
};

const addIdea = (title) => {
    const idea = { id: store.nextIdeaId, title, body: '', sortOrder: store.ideas.length, noteCount: 0, topics: [] };
    store.nextIdeaId += 1;
    store.ideas = [...store.ideas, idea];
    return idea;
};

const addTopic = (name) => {
    const topic = { id: store.nextTopicId, name, sortOrder: store.topics.length, ideaCount: 0 };
    store.nextTopicId += 1;
    store.topics = [...store.topics, topic];
    return topic;
};

// Files an idea under a topic, the way PUT /api/ideas/:id/topics would. GET
// /api/ideas carries each idea's topics, which is what the field clusters on.
const fileIdeaUnder = (ideaId, topic) => {
    store.ideas = store.ideas.map(idea => (
        idea.id === ideaId
            ? { ...idea, topics: [...idea.topics, { id: topic.id, name: topic.name }] }
            : idea
    ));
};

const chapterIdeaIds = (bookId, chapter) => store.chapterIdeas
    .filter(row => row.bookId === bookId && row.chapter === chapter)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(row => row.ideaId);

// The chapter's ENTIRE imported set, replaced in one write — the only shape
// PUT /api/chapter-ideas has. Position becomes sort_order, as on the server.
const replaceChapterIdeas = (bookId, chapter, ideaIds) => {
    store.chapterIdeas = [
        ...store.chapterIdeas.filter(row => !(row.bookId === bookId && row.chapter === chapter)),
        ...ideaIds.map((ideaId, index) => ({ bookId, chapter, ideaId, sortOrder: index })),
    ];
};

// Hydrated exactly as GET /api/ideas hydrates its list, which is what lets the
// panel render a row from either endpoint with one component.
const chapterIdeasPayload = (bookId, chapter) => ({
    ideas: chapterIdeaIds(bookId, chapter).map(id => store.ideas.find(idea => idea.id === id)),
});

// The full-set replace: every link for this note goes, then the given set is
// written back in the order it arrived. Position becomes sort_order, as on the
// server.
const replaceNoteIdeas = (noteId, ideaIds) => {
    store.noteIdeas = [
        ...store.noteIdeas.filter(link => link.noteId !== noteId),
        ...ideaIds.map((ideaId, index) => ({ noteId, ideaId, sortOrder: index })),
    ];
};

const ideasOf = (noteId) => store.noteIdeas
    .filter(link => link.noteId === noteId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(link => {
        const idea = store.ideas.find(item => item.id === link.ideaId);
        return { noteId, id: idea.id, title: idea.title, sortOrder: link.sortOrder };
    });

// The full-set replace for the note's direct topics, the mirror of
// replaceNoteIdeas. A separate membership: writing one leaves the other alone.
const replaceNoteTopics = (noteId, topicIds) => {
    store.noteTopics = [
        ...store.noteTopics.filter(link => link.noteId !== noteId),
        ...topicIds.map((topicId, index) => ({ noteId, topicId, sortOrder: index })),
    ];
};

const topicsOf = (noteId) => store.noteTopics
    .filter(link => link.noteId === noteId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(link => {
        const topic = store.topics.find(item => item.id === link.topicId);
        return { noteId, id: topic.id, name: topic.name, sortOrder: link.sortOrder };
    });

// The server computes index bounds from the verse table; the fake computes them
// from the same formula. A client-supplied index is ignored here too.
const resolveRange = ({ bookId, chapter, startVerse, endVerse }) => ({
    bookId,
    chapter,
    startVerse,
    endVerse,
    startIndex: verseIndexOf(bookId, chapter, startVerse),
    endIndex: verseIndexOf(bookId, chapter, endVerse),
});

const addReference = (noteId, reference) => {
    const stored = {
        id: store.nextReferenceId,
        noteId,
        ...resolveRange(reference),
        sortOrder: store.references.filter(item => item.noteId === noteId).length,
    };
    store.nextReferenceId += 1;
    store.references = [...store.references, stored];
    return stored;
};

const addNote = ({ title, body, reference } = {}) => {
    const note = {
        id: store.nextNoteId,
        title: title === undefined ? 'Untitled note' : title,
        body: body === undefined ? '' : body,
        sortOrder: store.notes.length,
        createdAt: '2026-08-18T20:16:00.000Z',
        updatedAt: '2026-08-18T20:16:00.000Z',
    };
    store.nextNoteId += 1;
    store.notes = [...store.notes, note];

    if (reference) {
        addReference(note.id, reference);
    }
    return note;
};

const referencesOf = (noteId) => store.references.filter(reference => reference.noteId === noteId);

const hydrate = (note) => ({
    ...note,
    references: referencesOf(note.id),
    ideas: ideasOf(note.id),
    topics: topicsOf(note.id),
});

// The plan's overlap rule, which is the whole point of the denormalized bounds.
const referencesOverlapping = (bookId, chapter) => {
    const start = chapterStartIndex(bookId, chapter);
    const end = start + VERSES_PER_CHAPTER - 1;
    return store.references
        .filter(reference => reference.startIndex <= end && reference.endIndex >= start)
        .sort((a, b) => a.startIndex - b.startIndex)
        .map(reference => ({
            ...reference,
            noteTitle: store.notes.find(note => note.id === reference.noteId).title,
        }));
};

const chapterPayload = (bookId, chapter) => {
    const book = findBook(bookId);
    const startIndex = chapterStartIndex(bookId, chapter);
    return {
        book: { id: book.id, name: book.name, abbrev: book.abbrev,
                testament: book.testament, chapterCount: book.chapterCount },
        chapter: { number: chapter, verseCount: VERSES_PER_CHAPTER,
                   startIndex, endIndex: startIndex + VERSES_PER_CHAPTER - 1 },
        verses: versesOf(bookId, chapter),
        references: referencesOverlapping(bookId, chapter),
    };
};

const notesPayload = (bookId, chapter) => {
    // Passage order: the ids in the order their anchors appear in the text.
    const noteIds = [...new Set(referencesOverlapping(bookId, chapter).map(r => r.noteId))];

    return {
        notes: noteIds.map(id => hydrate(store.notes.find(note => note.id === id))),
        unreferenced: store.notes
            .filter(note => referencesOf(note.id).length === 0)
            .map(hydrate),
    };
};

const jsonResponse = (body, status = 200) => Promise.resolve({
    ok: true,
    status,
    json: () => Promise.resolve(body),
});

const noContent = () => Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve(null) });
const notFound = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });

// Records every request so the tests can assert on the exact body a click sent.
let requests;

const handleRequest = (url, options = {}) => {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;
    requests.push({ url, method, body });

    if (url.endsWith('/books')) {
        return jsonResponse({ books });
    }

    // The saved location. Stateful like the rest of this fake, so a test can
    // assert on what leaving the page wrote as well as on what arriving read.
    if (url.endsWith('/user/location')) {
        if (method === 'PUT') {
            store.location = body;
        }
        return jsonResponse({ location: store.location });
    }

    const chapter = /\/chapter\/(\d+)\/(\d+)$/.exec(url);
    if (chapter) {
        return jsonResponse(chapterPayload(Number(chapter[1]), Number(chapter[2])));
    }

    const notesQuery = /\/notes\?bookId=(\d+)&chapter=(\d+)$/.exec(url);
    if (notesQuery && method === 'GET') {
        return jsonResponse(notesPayload(Number(notesQuery[1]), Number(notesQuery[2])));
    }

    if (url.endsWith('/notes') && method === 'POST') {
        return jsonResponse({ note: hydrate(addNote(body)) }, 201);
    }

    if (url.endsWith('/ideas') && method === 'GET') {
        return jsonResponse({ ideas: store.ideas });
    }

    if (url.endsWith('/topics') && method === 'GET') {
        return jsonResponse({ topics: store.topics });
    }

    const chapterIdeasQuery = /\/chapter-ideas\?bookId=(\d+)&chapter=(\d+)$/.exec(url);
    if (chapterIdeasQuery && method === 'GET') {
        return jsonResponse(chapterIdeasPayload(Number(chapterIdeasQuery[1]), Number(chapterIdeasQuery[2])));
    }

    if (url.endsWith('/chapter-ideas') && method === 'PUT') {
        replaceChapterIdeas(body.bookId, body.chapter, body.ideaIds);
        return jsonResponse(chapterIdeasPayload(body.bookId, body.chapter));
    }

    if (url.endsWith('/ideas') && method === 'POST') {
        // The server's fallback: an absent title becomes the default.
        const idea = addIdea(body.title === undefined ? 'Untitled idea' : body.title);
        store.ideas = store.ideas.map(item => (
            item.id === idea.id ? { ...item, body: body.body || '' } : item
        ));
        return jsonResponse({ idea: store.ideas.find(item => item.id === idea.id) }, 201);
    }

    const noteIdeas = /\/notes\/(\d+)\/ideas$/.exec(url);
    if (noteIdeas && method === 'PUT') {
        const noteId = Number(noteIdeas[1]);
        if (!store.notes.some(item => item.id === noteId)) {
            return notFound();
        }
        replaceNoteIdeas(noteId, body.ideaIds);
        return jsonResponse({ note: hydrate(store.notes.find(item => item.id === noteId)) });
    }

    const noteTopics = /\/notes\/(\d+)\/topics$/.exec(url);
    if (noteTopics && method === 'PUT') {
        const noteId = Number(noteTopics[1]);
        if (!store.notes.some(item => item.id === noteId)) {
            return notFound();
        }
        replaceNoteTopics(noteId, body.topicIds);
        return jsonResponse({ note: hydrate(store.notes.find(item => item.id === noteId)) });
    }

    const noteReferences = /\/notes\/(\d+)\/references$/.exec(url);
    if (noteReferences && method === 'POST') {
        const noteId = Number(noteReferences[1]);
        const reference = addReference(noteId, body);
        const note = store.notes.find(item => item.id === noteId);
        return jsonResponse({ note: hydrate(note), reference }, 201);
    }

    const note = /\/notes\/(\d+)$/.exec(url);
    if (note && method === 'PATCH') {
        const id = Number(note[1]);
        store.notes = store.notes.map(item => (
            item.id === id ? { ...item, ...body, updatedAt: '2026-08-18T21:00:00.000Z' } : item
        ));
        return jsonResponse({ note: hydrate(store.notes.find(item => item.id === id)) });
    }

    if (note && method === 'DELETE') {
        const id = Number(note[1]);
        store.notes = store.notes.filter(item => item.id !== id);
        store.references = store.references.filter(item => item.noteId !== id);
        return noContent();
    }

    const reference = /\/references\/(\d+)$/.exec(url);
    if (reference && method === 'DELETE') {
        store.references = store.references.filter(item => item.id !== Number(reference[1]));
        return noContent();
    }

    return notFound();
};

beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    resetStore();
    requests = [];
    global.fetch = jest.fn(handleRequest);
});

afterEach(async () => {
    // Panels keep fetching after the last assertion — a chapter request the test
    // did not wait on still lands. Letting those settle inside act() keeps the
    // output free of "not wrapped in act" warnings that would otherwise bury a
    // real one.
    await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
    });

    jest.resetAllMocks();
    localStorage.clear();
    window.getSelection().removeAllRanges();
});

// Surfaces the live query string so URL assertions read the router, not a mock.
const LocationProbe = () => {
    const location = useLocation();
    return <div data-testid="search">{location.search}</div>;
};

// Mounts inside an async act so the catalog and first chapter requests — which
// resolve on the microtask queue immediately after render — are flushed while
// React is still expecting updates.
const mount = async (element) => {
    let result;
    await act(async () => {
        result = render(element);
    });
    return result;
};

// Stands in for the Navbar's Analyze button, which navigates to a bare
// /analyze whatever page the reader is on — including this one.
const NavbarProbe = () => {
    const navigate = useNavigate();
    return <button onClick={() => navigate('/analyze')}>Go to Analyze</button>;
};

const renderAnalyze = (initialEntry = '/analyze') => mount(
    <MemoryRouter initialEntries={[initialEntry]}>
        <Analyze />
        <LocationProbe />
        <NavbarProbe />
    </MemoryRouter>
);

// The back-button test needs the real history stack that MemoryRouter, being
// in-memory, does not touch.
const renderAnalyzeWithHistory = (initialEntry = '/analyze') => {
    window.history.pushState({}, '', initialEntry);
    return mount(
        <BrowserRouter>
            <Analyze />
            <LocationProbe />
        </BrowserRouter>
    );
};

const panel = (name) => screen.getByRole('region', { name });

// Waits for both scripture panels to have painted their chapter text.
const waitForPanels = async () => {
    await waitFor(() => {
        expect(panel('Passage').querySelectorAll('.analyze-verse').length).toBeGreaterThan(0);
        expect(panel('Compare').querySelectorAll('.analyze-verse').length).toBeGreaterThan(0);
    });
};

const titleOf = (name) => within(panel(name)).getByRole('heading', { level: 2 }).textContent;

// Clicks something and lets every resulting request settle before asserting.
const clickAndSettle = async (element) => {
    await act(async () => {
        fireEvent.click(element);
    });
};

// Clicks one verse row. The row carries data-verse-index and reads it back off
// itself, which is what turns a click into part of a reference.
const clickVerse = async (panelName, verseIndex) => {
    const row = panel(panelName).querySelector(`[data-verse-index="${verseIndex}"]`);
    await act(async () => {
        fireEvent.click(row);
    });
};

// Selects verses by clicking each one in turn — the same thing a reader does.
const selectVerses = async (panelName, ...verseIndexes) => {
    for (const verseIndex of verseIndexes) {
        await clickVerse(panelName, verseIndex);
    }
};

// The selection tray above the panel row. It belongs to the page and not to a
// panel: a selection can span chapters that no panel is showing, so there is
// one tray however many places are in it, and none at all when nothing is
// selected.
const tray = () => screen.queryByRole('region', { name: 'Selection' });

// The places the tray names, in the order it lists them.
const trayPlaces = () => Array.from(
    tray() ? tray().querySelectorAll('.analyze-selection-place-label') : []
).map(node => node.textContent);

const addNoteButton = () =>
    (tray() ? within(tray()).getByRole('button', { name: 'Add note' }) : null);

const clearAllButton = () => within(tray()).getByRole('button', { name: 'Clear all' });

// Arming the tray for the open note, and the actions that appear once it is.
// "Add note" is gone for the duration: while the tray is armed the primary
// button commits the open note's next anchors, not a new note.
const addPassageButton = () =>
    within(panel('Notes')).getByRole('button', { name: 'Add passage' });

const addToNoteButton = () => within(tray()).getByRole('button', { name: 'Add to note' });

const cancelAddButton = () => within(tray()).getByRole('button', { name: 'Cancel' });

const removePlaceButton = (label) =>
    within(tray()).getByRole('button', { name: `Remove ${label} from selection` });

// Moves one panel to another book through its footer picker — the reader's own
// route across a book boundary.
const goToBook = async (panelName, bookName) => {
    await clickAndSettle(within(panel(panelName)).getByRole('button', { name: 'Choose a book' }));
    const dialog = screen.getByRole('dialog', { name: 'Choose a book' });
    await clickAndSettle(within(dialog).getByRole('button', { name: bookName }));
    await waitFor(() => expect(titleOf(panelName)).toBe(`${bookName} 1`));
};

const versesSelected = (panelName) =>
    panel(panelName).querySelectorAll('.analyze-verse--selected').length;

const versesTinted = (panelName) =>
    panel(panelName).querySelectorAll('.analyze-verse--tint-1, .analyze-verse--tint-2').length;

const markersIn = (panelName) =>
    panel(panelName).querySelectorAll('.analyze-gutter-marker');

const noteRows = () => panel('Notes').querySelectorAll('.analyze-note');

const ideaRows = () => panel('Notes').querySelectorAll('.analyze-idea');

// ─── The importer ───────────────────────────────────────────────────────────

const openImporter = async () =>
    clickAndSettle(within(panel('Notes')).getByRole('button', { name: 'Import idea' }));

const importerOverlay = () => screen.queryByRole('dialog');

// One bubble in the overlay's field, found by the title it prints. Every fan is
// mounted whatever is hovered — see TopicIdeaField — so an idea's card is
// reachable without having to hover its topic first.
//
// By title rather than by accessible name, because a topic card's name is its
// title AND the count underneath it ("Covenant 1 idea"), and this is a helper
// for naming the thing on the card rather than for asserting how it reads out.
const bubble = (name) => within(importerOverlay())
    .getByText(name, { selector: '.thoughts-bubble-title' })
    .closest('button');

// The confirm step. The overlay holds the pick and writes nothing until this
// is pressed — see ImportPicker.
const confirmImport = () => clickAndSettle(
    within(importerOverlay()).getByRole('button', { name: 'Import' })
);

// The panel's per-chapter shortlist, by the titles it lists.
const chapterIdeaTitles = () => Array.from(ideaRows()).map(
    row => row.querySelector('.analyze-entry-title').textContent
);

const removeFromChapter = (title) => within(panel('Notes')).getByRole('button', {
    name: `Remove ${title} from this chapter — the idea itself is kept`,
});

const requestsMatching = (predicate) => requests.filter(predicate);

describe('Analyze page', () => {
    test('defaults to Genesis 1 in the centre and Matthew 1 in the compare panel', async () => {
        await renderAnalyze();
        await waitForPanels();

        expect(titleOf('Passage')).toBe('Genesis 1');
        expect(titleOf('Compare')).toBe('Matthew 1');
    });

    test('normalizes a bare URL to the default positions so it can be shared', async () => {
        await renderAnalyze();
        await waitFor(() => {
            expect(screen.getByTestId('search').textContent).toBe('?l=1.1&r=40.1');
        });
    });

    test('restores both panel positions from the URL', async () => {
        await renderAnalyze('/analyze?l=40.2&r=1.2');
        await waitForPanels();

        expect(titleOf('Passage')).toBe('Matthew 2');
        expect(titleOf('Compare')).toBe('Genesis 2');
    });

    test('falls back to the defaults when a URL position is out of range', async () => {
        await renderAnalyze('/analyze?l=40.99&r=nonsense');
        await waitForPanels();

        expect(titleOf('Passage')).toBe('Genesis 1');
        expect(titleOf('Compare')).toBe('Matthew 1');
    });

    test('renders one row per verse, each carrying data-verse-index', async () => {
        await renderAnalyze();
        await waitForPanels();

        const rows = panel('Passage').querySelectorAll('.analyze-verse');
        expect(rows.length).toBe(2);
        expect(rows[0].getAttribute('data-verse-index')).toBe('1010');
        expect(rows[1].getAttribute('data-verse-index')).toBe('1011');
    });

    test('the forward arrow moves only its own panel, and the URL follows', async () => {
        await renderAnalyze();
        await waitForPanels();

        fireEvent.click(within(panel('Passage')).getByRole('button', { name: 'Next chapter' }));

        await waitFor(() => expect(titleOf('Passage')).toBe('Genesis 2'));
        expect(titleOf('Compare')).toBe('Matthew 1');
        expect(screen.getByTestId('search').textContent).toBe('?l=1.2&r=40.1');
    });

    test('the arrows cross book boundaries in canonical order', async () => {
        await renderAnalyze('/analyze?l=1.50&r=40.1');
        await waitForPanels();

        fireEvent.click(within(panel('Passage')).getByRole('button', { name: 'Next chapter' }));
        await waitFor(() => expect(titleOf('Passage')).toBe('Exodus 1'));

        fireEvent.click(within(panel('Passage')).getByRole('button', { name: 'Previous chapter' }));
        await waitFor(() => expect(titleOf('Passage')).toBe('Genesis 50'));
    });

    test('the back button restores the previous positions', async () => {
        await renderAnalyzeWithHistory();
        await waitForPanels();

        fireEvent.click(within(panel('Compare')).getByRole('button', { name: 'Next chapter' }));
        await waitFor(() => expect(titleOf('Compare')).toBe('Matthew 2'));

        fireEvent.click(within(panel('Compare')).getByRole('button', { name: 'Next chapter' }));
        await waitFor(() => expect(screen.getByTestId('search').textContent).toBe('?l=1.1&r=40.3'));

        window.history.back();
        await waitFor(() => expect(screen.getByTestId('search').textContent).toBe('?l=1.1&r=40.2'));
    });

    test('the book modal grid lists all books and moves the panel that opened it', async () => {
        await renderAnalyze();
        await waitForPanels();

        fireEvent.click(within(panel('Compare')).getByRole('button', { name: 'Choose a book' }));

        const dialog = screen.getByRole('dialog', { name: 'Choose a book' });
        expect(within(dialog).getAllByRole('button').length).toBe(books.length + 1); // + close
        expect(within(dialog).getByText('Old Testament')).toBeInTheDocument();
        expect(within(dialog).getByText('New Testament')).toBeInTheDocument();

        fireEvent.click(within(dialog).getByRole('button', { name: 'Exodus' }));

        await waitFor(() => expect(titleOf('Compare')).toBe('Exodus 1'));
        expect(titleOf('Passage')).toBe('Genesis 1');
        expect(screen.getByTestId('search').textContent).toBe('?l=1.1&r=2.1');
    });

    test('the chapter modal grid offers every chapter of the current book', async () => {
        await renderAnalyze();
        await waitForPanels();

        fireEvent.click(within(panel('Passage')).getByRole('button', { name: 'Choose a chapter' }));

        const dialog = screen.getByRole('dialog', { name: 'Choose a chapter in Genesis' });
        const cells = dialog.querySelectorAll('.analyze-grid-cell');
        expect(cells.length).toBe(50);

        fireEvent.click(within(dialog).getByRole('button', { name: '2' }));
        await waitFor(() => expect(titleOf('Passage')).toBe('Genesis 2'));
    });

    test('the notes panel label tracks the primary panel and hides its arrows', async () => {
        await renderAnalyze();
        await waitForPanels();

        expect(titleOf('Notes')).toBe('Genesis 1');
        expect(within(panel('Notes')).queryByRole('button', { name: 'Next chapter' })).toBeNull();
        expect(within(panel('Notes')).queryByRole('button', { name: 'Previous chapter' })).toBeNull();

        fireEvent.click(within(panel('Passage')).getByRole('button', { name: 'Next chapter' }));
        await waitFor(() => expect(titleOf('Notes')).toBe('Genesis 2'));

        // ...and never follows the compare panel.
        fireEvent.click(within(panel('Compare')).getByRole('button', { name: 'Next chapter' }));
        await waitFor(() => expect(titleOf('Compare')).toBe('Matthew 2'));
        expect(titleOf('Notes')).toBe('Genesis 2');
    });

    test('the notes panel footer navigates the primary panel', async () => {
        await renderAnalyze();
        await waitForPanels();

        fireEvent.click(within(panel('Notes')).getByRole('button', { name: 'Choose a chapter' }));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '2' }));

        await waitFor(() => expect(titleOf('Passage')).toBe('Genesis 2'));
        expect(titleOf('Compare')).toBe('Matthew 1');
    });

    test('shows an error instead of an empty page when the catalog request fails', async () => {
        global.fetch = jest.fn(() => Promise.resolve({
            ok: false, status: 503, json: () => Promise.resolve({}),
        }));

        await renderAnalyze();
        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent('Scripture data is not available yet.');
        });
    });
});

// ─── Pushing a side panel aside ─────────────────────────────────────────────
//
// The centre panel is the one that cannot be closed: it is the passage under
// study, and everything else on the page answers to it.
describe('Collapsing the side panels', () => {
    test('the compare panel folds into a spine and comes back', async () => {
        await renderAnalyze();
        await waitForPanels();

        await clickAndSettle(within(panel('Compare')).getByRole('button', { name: 'Hide Compare' }));

        expect(screen.queryByRole('region', { name: 'Compare' })).toBeNull();

        // The spine still says where the panel will return to.
        const spine = screen.getByRole('button', { name: 'Show Compare' });
        expect(spine).toHaveTextContent('Matthew 1');

        await clickAndSettle(spine);

        await waitFor(() => expect(titleOf('Compare')).toBe('Matthew 1'));
    });

    test('the notes panel folds away too', async () => {
        await renderAnalyze();
        await waitForPanels();

        await clickAndSettle(
            within(panel('Notes')).getByRole('button', { name: 'Hide Notes & ideas' })
        );

        expect(screen.queryByRole('region', { name: 'Notes' })).toBeNull();

        await clickAndSettle(screen.getByRole('button', { name: 'Show Notes' }));
        await waitFor(() => expect(titleOf('Notes')).toBe('Genesis 1'));
    });

    test('the primary panel has no tab that would close it', async () => {
        await renderAnalyze();
        await waitForPanels();

        expect(within(panel('Passage')).queryByRole('button', { name: 'Hide Passage' })).toBeNull();
    });

    test('both sides can be away at once, and the URL is untouched by it', async () => {
        await renderAnalyze();
        await waitForPanels();

        await clickAndSettle(within(panel('Compare')).getByRole('button', { name: 'Hide Compare' }));
        await clickAndSettle(
            within(panel('Notes')).getByRole('button', { name: 'Hide Notes & ideas' })
        );

        expect(titleOf('Passage')).toBe('Genesis 1');
        // Which panels are open is how one reader has arranged the room, not
        // part of the passage a shared link is about.
        expect(screen.getByTestId('search').textContent).toBe('?l=1.1&r=40.1');
    });
});

describe('Notes panel', () => {
    test('lists only the notes whose references overlap the primary chapter', async () => {
        // Arrange — one note on Genesis 1, one on Matthew 1 (the compare panel).
        addNote({ title: 'On Genesis', reference: { bookId: 1, chapter: 1, startVerse: 1, endVerse: 2 } });
        addNote({ title: 'On Matthew', reference: { bookId: 40, chapter: 1, startVerse: 1, endVerse: 1 } });

        // Act
        await renderAnalyze();
        await waitForPanels();

        // Assert — the notes panel follows the PRIMARY panel, not the compare one.
        await waitFor(() => expect(noteRows().length).toBe(1));
        expect(panel('Notes')).toHaveTextContent('On Genesis');
        expect(panel('Notes')).not.toHaveTextContent('On Matthew');
    });

    test('shows a note under its chapter with the reference spelled out', async () => {
        addNote({ title: 'On Genesis', reference: { bookId: 1, chapter: 1, startVerse: 1, endVerse: 2 } });

        await renderAnalyze();
        await waitForPanels();

        await waitFor(() => expect(noteRows().length).toBe(1));
        expect(panel('Notes')).toHaveTextContent('On this chapter');
        expect(panel('Notes')).toHaveTextContent('Genesis 1:1–2');
    });

    test('follows the primary panel when it navigates', async () => {
        addNote({ title: 'On Genesis 2', reference: { bookId: 1, chapter: 2, startVerse: 1, endVerse: 1 } });

        await renderAnalyze();
        await waitForPanels();

        expect(panel('Notes')).not.toHaveTextContent('On Genesis 2');

        await clickAndSettle(within(panel('Passage')).getByRole('button', { name: 'Next chapter' }));

        await waitFor(() => expect(panel('Notes')).toHaveTextContent('On Genesis 2'));
    });

    test('offers no way to create a note without verses to anchor it to', async () => {
        await renderAnalyze();
        await waitForPanels();

        // A note is made by clicking verses; the panel's only create action is
        // for the one kind of thing that has no anchor.
        expect(within(panel('Notes')).queryByRole('button', { name: '+ New note' })).toBeNull();
        expect(within(panel('Notes')).getByRole('button', { name: '+ New idea' })).toBeInTheDocument();
    });

    test('"+ New idea" opens a composer and POSTs a standalone idea', async () => {
        // Arrange
        await renderAnalyze();
        await waitForPanels();

        // Act
        await clickAndSettle(within(panel('Notes')).getByRole('button', { name: '+ New idea' }));

        fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Covenant' } });
        fireEvent.change(screen.getByLabelText('Body (markdown)'), { target: { value: 'A thread.' } });

        await clickAndSettle(within(panel('Notes')).getByRole('button', { name: 'Save idea' }));

        // Assert — an idea, not a note, and no reference anywhere near it.
        const created = requestsMatching(r => r.method === 'POST' && r.url.endsWith('/ideas'));
        expect(created).toHaveLength(1);
        expect(created[0].body).toEqual({ title: 'Covenant', body: 'A thread.' });
        expect(requestsMatching(r => r.method === 'POST' && r.url.endsWith('/notes'))).toHaveLength(0);

        // ...and it appears in the panel, having produced no highlight.
        await waitFor(() => expect(ideaRows().length).toBe(1));
        expect(panel('Notes')).toHaveTextContent('Covenant');
        expect(versesTinted('Passage')).toBe(0);
    });

    test('a blank title is left out so the server can supply its default', async () => {
        await renderAnalyze();
        await waitForPanels();

        await clickAndSettle(within(panel('Notes')).getByRole('button', { name: '+ New idea' }));
        await clickAndSettle(within(panel('Notes')).getByRole('button', { name: 'Save idea' }));

        const created = requestsMatching(r => r.method === 'POST' && r.url.endsWith('/ideas'));
        expect(created[0].body.title).toBeUndefined();
        await waitFor(() => expect(panel('Notes')).toHaveTextContent('Untitled idea'));
    });

    test('cancelling the composer writes nothing', async () => {
        await renderAnalyze();
        await waitForPanels();

        await clickAndSettle(within(panel('Notes')).getByRole('button', { name: '+ New idea' }));
        await clickAndSettle(within(panel('Notes')).getByRole('button', { name: 'Cancel' }));

        expect(requestsMatching(r => r.method === 'POST')).toHaveLength(0);
        expect(within(panel('Notes')).getByRole('button', { name: '+ New idea' })).toBeInTheDocument();
    });

    test('an idea the reader owns is not listed until this chapter holds it', async () => {
        // The panel used to list the whole corpus whatever the panels were
        // pointed at, which is what stopped being useful once ideas could be
        // curated per chapter. The full list is still one press away.
        addIdea('The wilderness');

        await renderAnalyze();
        await waitForPanels();

        await waitFor(() => expect(within(panel('Notes'))
            .getByRole('button', { name: 'Import idea' })).toBeInTheDocument());

        expect(ideaRows().length).toBe(0);
        expect(panel('Notes')).not.toHaveTextContent('Ideas in this chapter');

        await openImporter();
        expect(bubble('The wilderness')).toBeInTheDocument();
    });

    test('a note with references either side of a chapter boundary appears in both', async () => {
        // Arrange — one note anchored in Genesis 1 and again in Genesis 2.
        const note = addNote({ title: 'Across the boundary',
                               reference: { bookId: 1, chapter: 1, startVerse: 2, endVerse: 2 } });
        addReference(note.id, { bookId: 1, chapter: 2, startVerse: 1, endVerse: 1 });

        await renderAnalyze();
        await waitForPanels();

        // Assert — visible in Genesis 1...
        await waitFor(() => expect(panel('Notes')).toHaveTextContent('Across the boundary'));
        expect(versesTinted('Passage')).toBe(1);

        // ...and still visible after stepping into Genesis 2.
        await clickAndSettle(within(panel('Passage')).getByRole('button', { name: 'Next chapter' }));

        await waitFor(() => expect(titleOf('Passage')).toBe('Genesis 2'));
        expect(panel('Notes')).toHaveTextContent('Across the boundary');
        expect(versesTinted('Passage')).toBe(1);
    });
});

describe('Selecting verses by clicking them', () => {
    test('puts a tray above the panels once a verse is clicked', async () => {
        await renderAnalyze();
        await waitForPanels();

        expect(tray()).toBeNull();

        await selectVerses('Passage', 1010);

        expect(tray()).toBeInTheDocument();
        expect(trayPlaces()).toEqual(['Genesis 1:1']);
        expect(versesSelected('Passage')).toBe(1);
    });

    test('names a chapter once however many runs are selected in it', async () => {
        await renderAnalyze('/analyze?l=1.1&r=40.1');
        await waitForPanels();

        await selectVerses('Passage', 1010, 1011);

        expect(versesSelected('Passage')).toBe(2);
        expect(trayPlaces()).toEqual(['Genesis 1:1–2']);
    });

    test('clicking a selected verse again takes it back out', async () => {
        await renderAnalyze();
        await waitForPanels();

        await selectVerses('Passage', 1010, 1011);
        await clickVerse('Passage', 1011);

        expect(versesSelected('Passage')).toBe(1);
        expect(trayPlaces()).toEqual(['Genesis 1:1']);

        // Unclicking the last one ends the selection outright, and the tray
        // goes with it rather than sitting there empty.
        await clickVerse('Passage', 1010);
        expect(tray()).toBeNull();
    });

    test('"Clear all" drops every mark without writing anything', async () => {
        await renderAnalyze();
        await waitForPanels();

        await selectVerses('Passage', 1010, 1011);
        await selectVerses('Compare', 40010);
        await clickAndSettle(clearAllButton());

        expect(versesSelected('Passage')).toBe(0);
        expect(versesSelected('Compare')).toBe(0);
        expect(tray()).toBeNull();
        expect(requestsMatching(r => r.method === 'POST')).toHaveLength(0);
    });

    test('a click in the other panel adds to the selection rather than replacing it', async () => {
        // A note can be anchored to passages from several chapters at once, so
        // the basket spans the panels: what was clicked in one is still there
        // after clicking in the other, and the tray names both places.
        await renderAnalyze();
        await waitForPanels();

        await selectVerses('Passage', 1010);
        await selectVerses('Compare', 40010);

        expect(versesSelected('Passage')).toBe(1);
        expect(versesSelected('Compare')).toBe(1);
        expect(trayPlaces()).toEqual(['Genesis 1:1', 'Matthew 1:1']);
    });

    test('the same chapter open in both panels is selected in both', async () => {
        // The basket is keyed on the book and chapter, not on the panel, so
        // one click lights the verse up wherever that chapter is showing.
        await renderAnalyze('/analyze?l=1.1&r=1.1');
        await waitForPanels();

        await selectVerses('Passage', 1010);

        expect(versesSelected('Passage')).toBe(1);
        expect(versesSelected('Compare')).toBe(1);
        // One place, not one per panel.
        expect(trayPlaces()).toEqual(['Genesis 1:1']);
    });

    test('a chapter keeps its selection while the panel is away from it', async () => {
        await renderAnalyze();
        await waitForPanels();

        await selectVerses('Passage', 1010);

        await clickAndSettle(within(panel('Passage')).getByRole('button', { name: 'Next chapter' }));
        await waitFor(() => expect(titleOf('Passage')).toBe('Genesis 2'));

        // Nothing to paint here, but the tray still names where the marks are.
        expect(versesSelected('Passage')).toBe(0);
        expect(trayPlaces()).toEqual(['Genesis 1:1']);

        await clickAndSettle(within(panel('Passage')).getByRole('button', { name: 'Previous chapter' }));
        await waitFor(() => expect(titleOf('Passage')).toBe('Genesis 1'));

        expect(versesSelected('Passage')).toBe(1);
    });

    test('the tray drops one place and leaves the other standing', async () => {
        await renderAnalyze();
        await waitForPanels();

        await selectVerses('Passage', 1010, 1011);
        await selectVerses('Compare', 40010);
        expect(trayPlaces()).toEqual(['Genesis 1:1–2', 'Matthew 1:1']);

        await clickAndSettle(removePlaceButton('Genesis 1:1–2'));

        expect(trayPlaces()).toEqual(['Matthew 1:1']);
        expect(versesSelected('Passage')).toBe(0);
        expect(versesSelected('Compare')).toBe(1);
        expect(requestsMatching(r => r.method === 'POST')).toHaveLength(0);
    });
});

describe('Adding a note from selected verses', () => {
    test('POSTs the verse range the clicks resolved to', async () => {
        // Arrange
        await renderAnalyze();
        await waitForPanels();
        await selectVerses('Passage', 1010, 1011);

        // Act
        await clickAndSettle(addNoteButton());

        // Assert — verse numbers derived from data-verse-index, and no index
        // bounds sent: those are the server's to compute.
        const created = requestsMatching(r => r.method === 'POST' && r.url.endsWith('/notes'));
        expect(created).toHaveLength(1);
        expect(created[0].body.reference).toEqual({
            bookId: 1, chapter: 1, startVerse: 1, endVerse: 2,
        });
    });

    test('highlights the selected verses immediately and clears the selection', async () => {
        // Arrange
        await renderAnalyze();
        await waitForPanels();
        expect(versesTinted('Passage')).toBe(0);

        // Act
        await selectVerses('Passage', 1010, 1011);
        await clickAndSettle(addNoteButton());

        // Assert — both verses marked, each with a rail segment, and the lapis
        // selection handed over to a gold mark.
        await waitFor(() => expect(versesTinted('Passage')).toBe(2));
        expect(markersIn('Passage')).toHaveLength(2);
        expect(versesSelected('Passage')).toBe(0);
    });

    test('deepens the tint where two notes cover the same verse', async () => {
        await renderAnalyze();
        await waitForPanels();

        await selectVerses('Passage', 1010);
        await clickAndSettle(addNoteButton());
        await clickAndSettle(within(panel('Notes')).getByRole('button', { name: '← All notes' }));

        await selectVerses('Passage', 1010);
        await clickAndSettle(addNoteButton());

        await waitFor(() => {
            expect(panel('Passage').querySelectorAll('.analyze-verse--tint-2')).toHaveLength(1);
        });
        // One rail segment per note, stacked on the one verse.
        expect(markersIn('Passage')).toHaveLength(2);
    });

    test('one note carries references to every chapter the selection spans', async () => {
        // The acceptance case for the basket: verses picked in Genesis, the
        // panel moved to another book, more verses picked there, and a single
        // Add note. What comes out is one note with anchors either side of the
        // boundary — not one note per chapter.
        await renderAnalyze();
        await waitForPanels();

        // Act
        await selectVerses('Passage', 1010, 1011);
        await goToBook('Passage', 'Exodus');
        await selectVerses('Passage', 2010);

        expect(trayPlaces()).toEqual(['Genesis 1:1–2', 'Exodus 1:1']);

        await clickAndSettle(addNoteButton());

        // Assert — one POST /notes, carrying the first chapter's run...
        const created = requestsMatching(r => r.method === 'POST' && r.url.endsWith('/notes'));
        expect(created).toHaveLength(1);
        expect(created[0].body.reference).toEqual({
            bookId: 1, chapter: 1, startVerse: 1, endVerse: 2,
        });

        // ...and the second chapter anchored onto that same note.
        const noteId = store.notes[0].id;
        const anchored = requestsMatching(r => r.method === 'POST' && r.url.includes('/references'));
        expect(anchored).toHaveLength(1);
        expect(anchored[0].url).toContain(`/notes/${noteId}/references`);
        expect(anchored[0].body).toEqual({
            bookId: 2, chapter: 1, startVerse: 1, endVerse: 1,
        });

        expect(store.notes).toHaveLength(1);
        expect(referencesOf(noteId)).toHaveLength(2);

        // The basket is emptied once, after the last anchor has landed.
        expect(tray()).toBeNull();

        // Exodus 1 is on screen and now carries the mark.
        await waitFor(() => expect(versesTinted('Passage')).toBe(1));
    });

    test('works from the compare panel too', async () => {
        await renderAnalyze();
        await waitForPanels();

        await selectVerses('Compare', 40010);
        await clickAndSettle(addNoteButton());

        const created = requestsMatching(r => r.method === 'POST' && r.url.endsWith('/notes'));
        expect(created[0].body.reference).toEqual({
            bookId: 40, chapter: 1, startVerse: 1, endVerse: 1,
        });
        await waitFor(() => expect(versesTinted('Compare')).toBe(1));
    });
});

describe('Hover linking between the panels', () => {
    const seedTwoNotes = () => {
        addNote({ title: 'First note', reference: { bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 } });
        addNote({ title: 'Second note', reference: { bookId: 1, chapter: 1, startVerse: 2, endVerse: 2 } });
    };

    test('hovering a gutter marker highlights its note in the notes panel', async () => {
        // Arrange
        seedTwoNotes();
        await renderAnalyze();
        await waitForPanels();
        await waitFor(() => expect(noteRows().length).toBe(2));

        // Act — the marker on verse 2 belongs to the second note.
        fireEvent.mouseEnter(markersIn('Passage')[1]);

        // Assert
        const highlighted = panel('Notes').querySelectorAll('.analyze-note--highlighted');
        expect(highlighted).toHaveLength(1);
        expect(highlighted[0]).toHaveTextContent('Second note');
    });

    test('stops highlighting once the marker is left', async () => {
        seedTwoNotes();
        await renderAnalyze();
        await waitForPanels();
        await waitFor(() => expect(noteRows().length).toBe(2));

        fireEvent.mouseEnter(markersIn('Passage')[0]);
        expect(panel('Notes').querySelectorAll('.analyze-note--highlighted')).toHaveLength(1);

        fireEvent.mouseLeave(markersIn('Passage')[0]);
        expect(panel('Notes').querySelectorAll('.analyze-note--highlighted')).toHaveLength(0);
    });

    test('hovering a note highlights its verses in the scripture panel', async () => {
        // Arrange
        seedTwoNotes();
        await renderAnalyze();
        await waitForPanels();
        await waitFor(() => expect(noteRows().length).toBe(2));

        // Act
        fireEvent.mouseEnter(noteRows()[0]);

        // Assert — only the verse that note references lights up.
        const linked = panel('Passage').querySelectorAll('.analyze-verse--linked');
        expect(linked).toHaveLength(1);
        expect(linked[0].getAttribute('data-verse-index')).toBe('1010');

        fireEvent.mouseLeave(noteRows()[0]);
        expect(panel('Passage').querySelectorAll('.analyze-verse--linked')).toHaveLength(0);
    });

    test('lights up every verse a multi-verse note covers', async () => {
        addNote({ title: 'Whole chapter', reference: { bookId: 1, chapter: 1, startVerse: 1, endVerse: 2 } });

        await renderAnalyze();
        await waitForPanels();
        await waitFor(() => expect(noteRows().length).toBe(1));

        fireEvent.mouseEnter(noteRows()[0]);

        expect(panel('Passage').querySelectorAll('.analyze-verse--linked')).toHaveLength(2);
    });

    test('clicking a gutter marker opens that note', async () => {
        seedTwoNotes();
        await renderAnalyze();
        await waitForPanels();
        await waitFor(() => expect(noteRows().length).toBe(2));

        await clickAndSettle(markersIn('Passage')[1]);

        expect(within(panel('Notes')).getByRole('heading', { level: 3 }))
            .toHaveTextContent('Second note');
    });
});

describe('Note editor', () => {
    const openFirstNote = async () => {
        await waitFor(() => expect(noteRows().length).toBeGreaterThan(0));
        await clickAndSettle(noteRows()[0]);
    };

    test('opens on the note named by ?note=, which is how the tree hands one over', async () => {
        // Arrange — two notes anchored in the same chapter, so which one opens
        // is decided by the param and not by which happens to be first.
        addNote({ title: 'First note', reference: { bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 } });
        const wanted = addNote({
            title: 'Second note',
            body: 'The one asked for.',
            reference: { bookId: 1, chapter: 1, startVerse: 2, endVerse: 2 },
        });

        // Act — the URL a Topic page note row links to.
        await renderAnalyze(`/analyze?l=1.1&r=40.1&note=${wanted.id}`);
        await waitForPanels();

        // Assert
        await waitFor(() => expect(panel('Notes').querySelector('.analyze-editor-rendered'))
            .toHaveTextContent('The one asked for.'));
    });

    test('opens an unreferenced note from ?note= whatever chapter the panels show', async () => {
        // Arrange — no anchor at all, so the tree links here without a position.
        const loose = addNote({ title: 'Loose note', body: 'Anchored nowhere.' });

        // Act
        await renderAnalyze(`/analyze?note=${loose.id}`);
        await waitForPanels();

        // Assert — it comes from the notes panel's unreferenced list, which is
        // the same in every chapter, so the default position still finds it.
        await waitFor(() => expect(panel('Notes').querySelector('.analyze-editor-rendered'))
            .toHaveTextContent('Anchored nowhere.'));
    });

    test('a closed editor stays closed while ?note= is still in the URL', async () => {
        // Arrange
        const wanted = addNote({
            title: 'Openable',
            reference: { bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 },
        });
        await renderAnalyze(`/analyze?l=1.1&r=40.1&note=${wanted.id}`);
        await waitForPanels();
        await waitFor(() => expect(panel('Notes').querySelector('.analyze-editor')).toBeInTheDocument());

        // Act
        await clickAndSettle(within(panel('Notes')).getByRole('button', { name: '← All notes' }));

        // Assert — the param is a one-shot instruction, not state: nothing
        // writes it back, and it must not reopen what the reader just closed.
        expect(panel('Notes').querySelector('.analyze-editor')).not.toBeInTheDocument();
    });

    test('renders the body as markdown in read mode', async () => {
        // Arrange
        addNote({
            title: 'Light and dark',
            body: '# Heading\n\nAnd God **said**.',
            reference: { bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 },
        });

        // Act
        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Assert — markdown became real elements, not literal hashes.
        const rendered = panel('Notes').querySelector('.analyze-editor-rendered');
        expect(rendered.querySelector('h1')).toHaveTextContent('Heading');
        expect(rendered.querySelector('strong')).toHaveTextContent('said');
        expect(rendered.textContent).not.toContain('#');
    });

    test('lists the note references and PATCHes an edit', async () => {
        // Arrange
        addNote({ title: 'Light and dark', body: 'Original.',
                  reference: { bookId: 1, chapter: 1, startVerse: 1, endVerse: 2 } });

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        expect(panel('Notes')).toHaveTextContent('Genesis 1:1–2');

        // Act
        await clickAndSettle(within(panel('Notes')).getByRole('button', { name: 'Edit' }));

        fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Revised title' } });
        fireEvent.change(screen.getByLabelText('Body (markdown)'), { target: { value: 'Revised body.' } });

        await clickAndSettle(within(panel('Notes')).getByRole('button', { name: 'Save' }));

        // Assert
        const patches = requestsMatching(r => r.method === 'PATCH');
        expect(patches).toHaveLength(1);
        expect(patches[0].body).toEqual({ title: 'Revised title', body: 'Revised body.' });
        await waitFor(() => expect(panel('Notes')).toHaveTextContent('Revised body.'));
    });

    test('removes a reference and the highlight goes with it', async () => {
        // Arrange
        addNote({ title: 'Light and dark',
                  reference: { bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 } });

        await renderAnalyze();
        await waitForPanels();
        await waitFor(() => expect(versesTinted('Passage')).toBe(1));
        await openFirstNote();

        // Act
        await clickAndSettle(
            within(panel('Notes')).getByRole('button', { name: 'Remove reference Genesis 1:1' })
        );

        // Assert — the note survives as a standalone one; the tint does not.
        expect(requestsMatching(r => r.method === 'DELETE' && r.url.includes('/references/'))).toHaveLength(1);
        await waitFor(() => expect(versesTinted('Passage')).toBe(0));
        expect(panel('Notes')).toHaveTextContent('Light and dark');
    });

    test('anchors the open note to passages picked after arming the tray', async () => {
        // Arrange — a standalone note, and passages picked after arming it.
        addNote({ title: 'Floating thought' });

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Act — the editor's button arms; the tray commits.
        await clickAndSettle(addPassageButton());
        await selectVerses('Passage', 1011);
        await clickAndSettle(addToNoteButton());

        // Assert
        const added = requestsMatching(r => r.method === 'POST' && r.url.includes('/references'));
        expect(added).toHaveLength(1);
        expect(added[0].body).toEqual({ bookId: 1, chapter: 1, startVerse: 2, endVerse: 2 });
        await waitFor(() => expect(versesTinted('Passage')).toBe(1));
    });

    test('stays open when the panel moves to a chapter the note does not touch', async () => {
        // Resolving the open note only out of the chapter's lists would close
        // the editor here — and anchoring a note across a chapter boundary
        // would be impossible, since the note vanishes exactly when the verses
        // to anchor it to come into view.
        addNote({ title: 'Anchored in Genesis 1',
                  reference: { bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 } });

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        await clickAndSettle(within(panel('Passage')).getByRole('button', { name: 'Next chapter' }));

        await waitFor(() => expect(titleOf('Passage')).toBe('Genesis 2'));
        expect(within(panel('Notes')).getByRole('heading', { level: 3 }))
            .toHaveTextContent('Anchored in Genesis 1');
    });

    test('anchors an open note to a chapter it did not previously touch', async () => {
        // Arrange — the acceptance case: one note, references either side of a
        // chapter boundary, added through the UI rather than seeded.
        addNote({ title: 'Across the boundary',
                  reference: { bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 } });

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Act — move to Genesis 2 and anchor the still-open note there.
        await clickAndSettle(within(panel('Passage')).getByRole('button', { name: 'Next chapter' }));
        await waitFor(() => expect(titleOf('Passage')).toBe('Genesis 2'));

        await clickAndSettle(addPassageButton());
        await selectVerses('Passage', 1020);
        await clickAndSettle(addToNoteButton());

        // Assert — highlighted in Genesis 2...
        await waitFor(() => expect(versesTinted('Passage')).toBe(1));
        expect(panel('Notes')).toHaveTextContent('Genesis 1:1');
        expect(panel('Notes')).toHaveTextContent('Genesis 2:1');

        // ...and still highlighted and listed back in Genesis 1.
        await clickAndSettle(within(panel('Notes')).getByRole('button', { name: '← All notes' }));
        await clickAndSettle(within(panel('Passage')).getByRole('button', { name: 'Previous chapter' }));

        await waitFor(() => expect(titleOf('Passage')).toBe('Genesis 1'));
        expect(panel('Notes')).toHaveTextContent('Across the boundary');
        expect(versesTinted('Passage')).toBe(1);
    });

    test('anchors an open note to two chapters at once from one armed run', async () => {
        // The armed tray survives navigation: the reader picks a verse here,
        // moves to a chapter the note has nothing in, picks another, and
        // commits both at once. Reaching across that boundary is what the
        // selection is for.
        addNote({ title: 'Across the boundary',
                  reference: { bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 } });

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();
        await clickAndSettle(addPassageButton());

        // Act — a verse here, then a verse in a chapter the note has nothing in.
        await selectVerses('Passage', 1011);
        await clickAndSettle(within(panel('Passage')).getByRole('button', { name: 'Next chapter' }));
        await waitFor(() => expect(titleOf('Passage')).toBe('Genesis 2'));
        await selectVerses('Passage', 1020);

        expect(trayPlaces()).toEqual(['Genesis 1:2', 'Genesis 2:1']);
        expect(addToNoteButton()).toBeEnabled();

        await clickAndSettle(addToNoteButton());

        // Assert — both anchors written, onto the one note.
        const added = requestsMatching(r => r.method === 'POST' && r.url.includes('/references'));
        expect(added).toHaveLength(2);
        expect(added.map(request => request.body)).toEqual([
            { bookId: 1, chapter: 1, startVerse: 2, endVerse: 2 },
            { bookId: 1, chapter: 2, startVerse: 1, endVerse: 1 },
        ]);
        expect(store.notes).toHaveLength(1);

        // Cleared once, after the last of them landed.
        expect(tray()).toBeNull();
        await waitFor(() => expect(versesTinted('Passage')).toBe(1));
    });

    test('deletes the note and returns to the list', async () => {
        addNote({ title: 'Light and dark',
                  reference: { bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 } });

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        await clickAndSettle(within(panel('Notes')).getByRole('button', { name: 'Delete note' }));

        await waitFor(() => expect(noteRows().length).toBe(0));
        expect(versesTinted('Passage')).toBe(0);
        expect(within(panel('Notes')).getByRole('button', { name: '+ New idea' })).toBeInTheDocument();
    });
});

describe('The notes API harness', () => {
    test('a note carries its direct topics, kept apart from its ideas', async () => {
        // Arrange — one note under both an idea and a topic directly. The two
        // are different tables, and a harness that conflated them would let a
        // component that conflates them pass.
        const faith = addTopic('Faith');
        const abiding = addIdea('Abiding');
        const note = addNote({ title: 'The vine' });
        replaceNoteIdeas(note.id, [abiding.id]);
        replaceNoteTopics(note.id, [faith.id]);

        // Act
        await renderAnalyze();
        await waitForPanels();

        // Assert — read the note back the way the panel does, through GET
        // /notes and hydrate, rather than the store this Arrange block just
        // wrote by hand. topics carry Faith under `name`; ideas carry Abiding
        // under `title` — a hydrate that swapped or merged the two fields
        // would fail one of these, where reading back store.noteTopics /
        // store.noteIdeas directly could not have caught it.
        const { unreferenced } = await fetchJson('/notes?bookId=1&chapter=1');
        const hydrated = unreferenced.find(item => item.id === note.id);
        expect(hydrated.topics).toEqual([
            { noteId: note.id, id: faith.id, name: 'Faith', sortOrder: 0 },
        ]);
        expect(hydrated.ideas).toEqual([
            { noteId: note.id, id: abiding.id, title: 'Abiding', sortOrder: 0 },
        ]);
    });

    // The test above seeds note_topics by calling the store helper directly,
    // so the PUT route itself — its regex, its method guard, its reading of
    // topicIds — never runs. This sends the request NoteFiling will send, the
    // same way useNotes' idea write already does, and checks the idea
    // membership survives it: that separation is the whole feature.
    test('PUT /notes/:id/topics writes the link table and leaves the note\'s ideas alone', async () => {
        // Arrange — a note already carrying an idea, so a topics write that
        // reached into noteIdeas would be caught immediately.
        const faith = addTopic('Faith');
        const grace = addTopic('Grace');
        const abiding = addIdea('Abiding');
        const note = addNote({ title: 'The vine' });
        replaceNoteIdeas(note.id, [abiding.id]);

        // Act
        const { note: hydrated } = await fetchJson(`/notes/${note.id}/topics`, {
            method: 'PUT',
            body: { topicIds: [faith.id, grace.id] },
        });

        // Assert — the response hydrates topicsOf's id/name/sortOrder shape...
        expect(hydrated.topics).toEqual([
            { noteId: note.id, id: faith.id, name: 'Faith', sortOrder: 0 },
            { noteId: note.id, id: grace.id, name: 'Grace', sortOrder: 1 },
        ]);
        // ...the store holds what the body carried under topicIds...
        expect(store.noteTopics).toEqual([
            { noteId: note.id, topicId: faith.id, sortOrder: 0 },
            { noteId: note.id, topicId: grace.id, sortOrder: 1 },
        ]);
        // ...and the idea link, a separate table, was never touched.
        expect(store.noteIdeas).toEqual([{ noteId: note.id, ideaId: abiding.id, sortOrder: 0 }]);
    });

    test('PUT /notes/:id/topics 404s for a note that does not exist', async () => {
        await expect(fetchJson('/notes/999/topics', {
            method: 'PUT',
            body: { topicIds: [] },
        })).rejects.toThrow('We could not find that.');
    });
});

describe('Adding passages to an open note', () => {
    const openFirstNote = async () => {
        await waitFor(() => expect(noteRows().length).toBeGreaterThan(0));
        await clickAndSettle(noteRows()[0]);
    };

    const armFor = async (title) => {
        addNote({ title });
        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();
        await clickAndSettle(addPassageButton());
    };

    test('arms the tray with a prompt before anything has been picked', async () => {
        // An armed mode with nothing selected must still be visible: otherwise
        // the reader is picking passages with nothing on screen to say so, and
        // nothing to press to back out.
        await armFor('Floating thought');

        expect(tray()).not.toBeNull();
        expect(tray()).toHaveTextContent('Click passages to add to this note');
        expect(trayPlaces()).toEqual([]);
        expect(addToNoteButton()).toBeDisabled();
        expect(cancelAddButton()).toBeInTheDocument();

        // The new-note action is gone for the duration — while the tray is
        // armed the selection belongs to the open note.
        expect(within(tray()).queryByRole('button', { name: 'Add note' })).toBeNull();
    });

    test('takes passages picked in the compare panel', async () => {
        // The basket already spans panels; arming must not narrow it to the
        // one the note's chapter is showing in.
        await armFor('Floating thought');

        await selectVerses('Compare', 40010);
        expect(trayPlaces()).toEqual(['Matthew 1:1']);

        await clickAndSettle(addToNoteButton());

        const added = requestsMatching(r => r.method === 'POST' && r.url.includes('/references'));
        expect(added).toHaveLength(1);
        expect(added[0].body).toEqual({ bookId: 40, chapter: 1, startVerse: 1, endVerse: 1 });
        await waitFor(() => expect(versesTinted('Compare')).toBe(1));
    });

    test('Cancel disarms the tray and leaves the selection standing', async () => {
        await armFor('Floating thought');
        await selectVerses('Passage', 1010);

        // Act
        await clickAndSettle(cancelAddButton());

        // Assert — nothing written, the verses still picked, and the tray back
        // to offering a new note.
        expect(requestsMatching(r => r.method === 'POST' && r.url.includes('/references')))
            .toHaveLength(0);
        expect(trayPlaces()).toEqual(['Genesis 1:1']);
        expect(versesSelected('Passage')).toBe(1);
        expect(addNoteButton()).toBeInTheDocument();
    });

    test('Clear all empties the basket without disarming', async () => {
        await armFor('Floating thought');
        await selectVerses('Passage', 1010);

        await clickAndSettle(clearAllButton());

        // Still armed, so the tray stays up on its prompt rather than vanishing.
        expect(trayPlaces()).toEqual([]);
        expect(versesSelected('Passage')).toBe(0);
        expect(tray()).toHaveTextContent('Click passages to add to this note');
        expect(cancelAddButton()).toBeInTheDocument();
    });

    test('closing the note disarms the tray', async () => {
        // The target is the open note. Close it and there is nothing left to
        // add to, so the tray goes back to offering a new note.
        await armFor('Floating thought');
        await selectVerses('Passage', 1010);

        await clickAndSettle(within(panel('Notes')).getByRole('button', { name: '← All notes' }));

        expect(addNoteButton()).toBeInTheDocument();
        expect(trayPlaces()).toEqual(['Genesis 1:1']);
    });

    test('opening a different note disarms the tray', async () => {
        // The arming names one note. Another note opened over it is not that
        // note, and the tray must not quietly re-aim at it.
        addNote({ title: 'First note' });
        addNote({ title: 'Second note' });

        await renderAnalyze();
        await waitForPanels();
        await waitFor(() => expect(noteRows().length).toBe(2));

        await clickAndSettle(noteRows()[0]);
        await clickAndSettle(addPassageButton());
        await selectVerses('Passage', 1010);
        expect(addToNoteButton()).toBeInTheDocument();

        await clickAndSettle(within(panel('Notes')).getByRole('button', { name: '← All notes' }));
        await clickAndSettle(noteRows()[1]);

        expect(addNoteButton()).toBeInTheDocument();
    });

    test('the tray disappears once the passages have landed', async () => {
        await armFor('Floating thought');
        await selectVerses('Passage', 1010);

        await clickAndSettle(addToNoteButton());

        // Committed, cleared and disarmed — an armed empty tray left behind
        // would read as a second run waiting to be made.
        await waitFor(() => expect(tray()).toBeNull());
        expect(panel('Notes')).toHaveTextContent('Genesis 1:1');
    });
});

// ─── Filing an open note ────────────────────────────────────────────────────
//
// The editor files a note through the same field of bubbles the chapter
// importer uses, and it can file under a TOPIC as well as an idea. The two are
// separate memberships written to separate endpoints, so the assertions that
// matter are the ones proving a write to one leaves the other alone.
describe('Filing a note under ideas and topics', () => {
    const openFirstNote = async () => {
        await waitFor(() => expect(noteRows().length).toBeGreaterThan(0));
        await clickAndSettle(noteRows()[0]);
    };

    const ideaLinkRequests = () =>
        requestsMatching(r => r.method === 'PUT' && /\/notes\/\d+\/ideas$/.test(r.url));

    const topicLinkRequests = () =>
        requestsMatching(r => r.method === 'PUT' && /\/notes\/\d+\/topics$/.test(r.url));

    // The rows the editor lists, by the titles they print.
    const filedTitles = () => Array.from(
        panel('Notes').querySelectorAll('.analyze-filing-title')
    ).map(row => row.textContent);

    const openFiler = () => clickAndSettle(
        within(panel('Notes')).getByRole('button', { name: 'Import' })
    );

    const unfile = (name) => clickAndSettle(
        within(panel('Notes')).getByRole('button', { name: `Unfile ${name} from this note` })
    );

    test('lists the ideas and the topics the note is filed under', async () => {
        // Arrange
        const faith = addTopic('Faith');
        const abiding = addIdea('Abiding');
        addIdea('Pruning');
        const note = addNote({ title: 'The vine',
                               reference: { bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 } });
        replaceNoteIdeas(note.id, [abiding.id]);
        replaceNoteTopics(note.id, [faith.id]);

        // Act
        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Assert — what it holds, and nothing it does not. "Pruning" exists
        // and is not listed, because this is the note's filing, not a picker.
        expect(filedTitles()).toEqual(['Abiding', 'Faith']);
        expect(panel('Notes')).not.toHaveTextContent('Pruning');
    });

    test('marks which rows are topics', async () => {
        // The × means different things on the two and goes to different
        // endpoints, so a flat list that hid the difference would be a list
        // whose buttons cannot be told apart.
        const faith = addTopic('Faith');
        const note = addNote({ title: 'The vine' });
        replaceNoteTopics(note.id, [faith.id]);

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        expect(within(panel('Notes')).getByText('topic')).toBeInTheDocument();
    });

    test('importing an idea PUTs the note\'s ideas plus that one', async () => {
        // Arrange
        const abiding = addIdea('Abiding');
        const pruning = addIdea('Pruning');
        const note = addNote({ title: 'The vine' });
        replaceNoteIdeas(note.id, [abiding.id]);

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Act
        await openFiler();
        await clickAndSettle(bubble('Pruning'));
        await confirmImport();

        // Assert — the complete set, in the order the note holds it.
        expect(ideaLinkRequests()).toHaveLength(1);
        expect(ideaLinkRequests()[0].body).toEqual({ ideaIds: [abiding.id, pruning.id] });
        expect(topicLinkRequests()).toHaveLength(0);
        await waitFor(() => expect(filedTitles()).toEqual(['Abiding', 'Pruning']));
    });

    test('importing a topic PUTs the note\'s topics and leaves its ideas alone', async () => {
        // Arrange
        const faith = addTopic('Faith');
        const abiding = addIdea('Abiding');
        const note = addNote({ title: 'The vine' });
        replaceNoteIdeas(note.id, [abiding.id]);

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Act
        await openFiler();
        await clickAndSettle(bubble('Faith'));
        await confirmImport();

        // Assert — the topic set was written, the idea set was not touched.
        expect(topicLinkRequests()).toHaveLength(1);
        expect(topicLinkRequests()[0].body).toEqual({ topicIds: [faith.id] });
        expect(ideaLinkRequests()).toHaveLength(0);
        expect(store.noteIdeas).toEqual([{ noteId: note.id, ideaId: abiding.id, sortOrder: 0 }]);
        await waitFor(() => expect(filedTitles()).toEqual(['Abiding', 'Faith']));
    });

    test('unfiling an idea sends the set without it and leaves the topics', async () => {
        // Arrange
        const faith = addTopic('Faith');
        const abiding = addIdea('Abiding');
        const note = addNote({ title: 'The vine' });
        replaceNoteIdeas(note.id, [abiding.id]);
        replaceNoteTopics(note.id, [faith.id]);

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Act
        await unfile('Abiding');

        // Assert — a note under no idea is a legal state, so this is a normal
        // save, and the topic membership is untouched.
        expect(ideaLinkRequests()[0].body).toEqual({ ideaIds: [] });
        expect(store.noteTopics).toEqual([{ noteId: note.id, topicId: faith.id, sortOrder: 0 }]);
        await waitFor(() => expect(filedTitles()).toEqual(['Faith']));
    });

    test('unfiling a topic sends the set without it and leaves the ideas', async () => {
        // Arrange
        const faith = addTopic('Faith');
        const abiding = addIdea('Abiding');
        const note = addNote({ title: 'The vine' });
        replaceNoteIdeas(note.id, [abiding.id]);
        replaceNoteTopics(note.id, [faith.id]);

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Act
        await unfile('Faith');

        // Assert
        expect(topicLinkRequests()[0].body).toEqual({ topicIds: [] });
        expect(store.noteIdeas).toEqual([{ noteId: note.id, ideaId: abiding.id, sortOrder: 0 }]);
        await waitFor(() => expect(filedTitles()).toEqual(['Abiding']));
    });

    test('a second unfile is blocked while an earlier write is still in flight, so a removal cannot be resurrected', async () => {
        // Arrange — two ideas, and a fetch whose ideas PUT hangs until this
        // test releases it by hand — standing in for the real race, where the
        // first PUT is simply slower than the click that starts the second.
        const abiding = addIdea('Abiding');
        const pruning = addIdea('Pruning');
        const note = addNote({ title: 'The vine' });
        replaceNoteIdeas(note.id, [abiding.id, pruning.id]);

        let releaseIdeasPut;
        const answer = global.fetch.getMockImplementation();
        global.fetch = jest.fn((url, options = {}) => {
            const method = options.method || 'GET';
            if (/\/notes\/\d+\/ideas$/.test(url) && method === 'PUT') {
                requests.push({ url, method, body: options.body ? JSON.parse(options.body) : undefined });
                return new Promise(resolve => { releaseIdeasPut = resolve; });
            }
            return answer(url, options);
        });

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Act — unfile Abiding. The PUT is sent and stays in flight.
        await unfile('Abiding');
        expect(ideaLinkRequests()).toHaveLength(1);

        // Assert — Pruning's × is disabled while that write is out, so a
        // click on it cannot start a second, racing whole-set write.
        const pruningUnfile = within(panel('Notes')).getByRole('button', {
            name: 'Unfile Pruning from this note',
        });
        expect(pruningUnfile).toBeDisabled();

        await act(async () => {
            fireEvent.click(pruningUnfile);
        });
        expect(ideaLinkRequests()).toHaveLength(1);

        // Cleanup — release the held write so nothing is left in flight.
        await act(async () => {
            releaseIdeasPut(await jsonResponse({ note: hydrate(store.notes.find(item => item.id === note.id)) }));
            await new Promise(resolve => setTimeout(resolve, 0));
        });
    });

    test('the link survives a round trip to the server, not just the click', async () => {
        // Arrange
        const abiding = addIdea('Abiding');
        addNote({ title: 'The vine' });

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Act — file it, close the editor, open it again from the list.
        await openFiler();
        await clickAndSettle(bubble('Abiding'));
        await confirmImport();
        await clickAndSettle(within(panel('Notes')).getByRole('button', { name: '← All notes' }));
        await openFirstNote();

        // Assert — it is listed because the server said so.
        expect(store.noteIdeas).toEqual([{ noteId: 1, ideaId: abiding.id, sortOrder: 0 }]);
        expect(filedTitles()).toEqual(['Abiding']);
    });

    test('importing something the note already holds writes nothing', async () => {
        // Arrange
        const abiding = addIdea('Abiding');
        const note = addNote({ title: 'The vine' });
        replaceNoteIdeas(note.id, [abiding.id]);

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Act
        await openFiler();
        await clickAndSettle(bubble('Abiding'));
        await confirmImport();

        // Assert — a PUT storing what is already stored is a round trip spent
        // redrawing the same list.
        expect(ideaLinkRequests()).toHaveLength(0);
        expect(filedTitles()).toEqual(['Abiding']);
    });

    test('says so when the note is filed under nothing, and still offers Import', async () => {
        // Arrange
        addNote({ title: 'The vine' });

        // Act
        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Assert
        expect(filedTitles()).toEqual([]);
        expect(panel('Notes')).toHaveTextContent('Not filed under anything yet');
        expect(within(panel('Notes')).getByRole('button', { name: 'Import' })).toBeInTheDocument();
    });
});

// ─── The chapter's shortlist ────────────────────────────────────────────────
//
// Ideas are curated per chapter now: the panel lists what this chapter holds
// rather than everything the reader has ever written, and the whole corpus is
// reached through the importer's overlay instead.
describe('Importing an idea into the chapter', () => {
    const chapterIdeaRequests = () =>
        requestsMatching(r => r.method === 'PUT' && r.url.endsWith('/chapter-ideas'));

    test('the overlay offers every idea, filed and unfiled alike', async () => {
        // Arrange — one idea under a topic, one under nothing at all. The
        // unfiled one is reachable through the field's "unfiled" bubble, and a
        // reader whose ideas are all unfiled must still be able to import one.
        const covenant = addTopic('Covenant');
        const abiding = addIdea('Abiding');
        fileIdeaUnder(abiding.id, covenant);
        addIdea('Loose thread');

        // Act
        await renderAnalyze();
        await waitForPanels();
        await openImporter();

        // Assert
        expect(bubble('Covenant')).toBeInTheDocument();
        expect(bubble('Abiding')).toBeInTheDocument();
        expect(bubble('Loose thread')).toBeInTheDocument();
        expect(bubble('Unfiled ideas')).toBeInTheDocument();
    });

    test('picking an idea and confirming imports it into the chapter', async () => {
        // Arrange
        const abiding = addIdea('Abiding');

        await renderAnalyze();
        await waitForPanels();
        await openImporter();

        // Act — the pick alone must write nothing.
        await clickAndSettle(bubble('Abiding'));
        expect(chapterIdeaRequests()).toHaveLength(0);

        await confirmImport();

        // Assert — the whole set, against the chapter the primary panel shows.
        expect(chapterIdeaRequests()).toHaveLength(1);
        expect(chapterIdeaRequests()[0].body).toEqual({ bookId: 1, chapter: 1, ideaIds: [abiding.id] });

        expect(importerOverlay()).toBeNull();
        await waitFor(() => expect(panel('Notes')).toHaveTextContent('Ideas in this chapter'));
        expect(chapterIdeaTitles()).toEqual(['Abiding']);
    });

    test('cancelling the importer writes nothing', async () => {
        // Arrange
        addIdea('Abiding');

        await renderAnalyze();
        await waitForPanels();
        await openImporter();

        // Act
        await clickAndSettle(bubble('Abiding'));
        await clickAndSettle(within(importerOverlay()).getByRole('button', { name: 'Cancel' }));

        // Assert
        expect(chapterIdeaRequests()).toHaveLength(0);
        expect(importerOverlay()).toBeNull();
        expect(store.chapterIdeas).toEqual([]);
    });

    test('moving the primary panel shows that chapter\'s shortlist instead', async () => {
        // Arrange — one idea imported either side of a chapter boundary.
        const abiding = addIdea('Abiding');
        const pruning = addIdea('Pruning');
        replaceChapterIdeas(1, 1, [abiding.id]);
        replaceChapterIdeas(1, 2, [pruning.id]);

        await renderAnalyze();
        await waitForPanels();
        await waitFor(() => expect(chapterIdeaTitles()).toEqual(['Abiding']));

        // Act — the notes panel follows the centre panel, and so does this.
        await clickAndSettle(within(panel('Passage')).getByRole('button', { name: 'Next chapter' }));

        // Assert
        await waitFor(() => expect(titleOf('Passage')).toBe('Genesis 2'));
        await waitFor(() => expect(chapterIdeaTitles()).toEqual(['Pruning']));
    });

    test('an idea a note here is filed under is in the chapter without being imported', async () => {
        // Arrange — nothing imported; the idea arrives through the note.
        const abiding = addIdea('Abiding');
        const note = addNote({ title: 'The vine',
                               reference: { bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 } });
        replaceNoteIdeas(note.id, [abiding.id]);

        // Act
        await renderAnalyze();
        await waitForPanels();

        // Assert — listed, and with no × on it: there is no import to remove,
        // and the way out is to unfile the note.
        await waitFor(() => expect(chapterIdeaTitles()).toEqual(['Abiding']));
        expect(store.chapterIdeas).toEqual([]);
        expect(within(panel('Notes')).queryByRole('button', {
            name: /Remove Abiding from this chapter/,
        })).toBeNull();
    });

    test('removing an import leaves the idea itself, still offerable in the editor', async () => {
        // Arrange — an imported idea and a note that is not filed under it.
        const abiding = addIdea('Abiding');
        replaceChapterIdeas(1, 1, [abiding.id]);
        addNote({ title: 'The vine', reference: { bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 } });

        await renderAnalyze();
        await waitForPanels();
        await waitFor(() => expect(chapterIdeaTitles()).toEqual(['Abiding']));

        // Act — the same full-set PUT, with the idea taken out of the set.
        await clickAndSettle(removeFromChapter('Abiding'));

        // Assert — out of this chapter...
        expect(chapterIdeaRequests()[0].body).toEqual({ bookId: 1, chapter: 1, ideaIds: [] });
        await waitFor(() => expect(chapterIdeaTitles()).toEqual([]));
        expect(panel('Notes')).not.toHaveTextContent('Ideas in this chapter');

        // ...and nowhere else. The idea is untouched, no DELETE was sent, and
        // the note editor still offers it.
        expect(store.ideas.map(idea => idea.title)).toEqual(['Abiding']);
        expect(requestsMatching(r => r.method === 'DELETE')).toHaveLength(0);

        await clickAndSettle(noteRows()[0]);
        await clickAndSettle(within(panel('Notes')).getByRole('button', { name: 'Import' }));
        expect(bubble('Abiding')).toBeInTheDocument();
    });
});

// ─── Where the page reopens ─────────────────────────────────────────────────
//
// The page's state is its query string, which is what makes a link to a passage
// worth sending someone — and what left a bare /analyze at Genesis 1 however
// long the reader had spent in Romans. So the last place is saved per user and
// read back when, and only when, the URL names nowhere.
describe('The saved location', () => {
    const openFirstNote = async () => {
        await waitFor(() => expect(noteRows().length).toBeGreaterThan(0));
        await clickAndSettle(noteRows()[0]);
    };

    const somewhere = {
        primary: { bookId: 40, chapter: 2 },
        compare: { bookId: 1, chapter: 2 },
        noteId: null,
    };

    test('reopens a bare /analyze where the reader left off', async () => {
        // Arrange
        store.location = somewhere;

        // Act
        await renderAnalyze();
        await waitForPanels();

        // Assert — both passages, not just the primary one.
        expect(titleOf('Passage')).toBe('Matthew 2');
        expect(titleOf('Compare')).toBe('Genesis 2');
    });

    test('puts the restored place in the URL, so it is shareable in turn', async () => {
        store.location = somewhere;

        await renderAnalyze();
        await waitFor(() => {
            expect(screen.getByTestId('search').textContent).toBe('?l=40.2&r=1.2');
        });
    });

    test('reopens the editor on the note it was left open on', async () => {
        // Arrange — a note on Matthew 2, and a location naming it.
        const note = addNote({
            title: 'The flight to Egypt',
            body: 'Out of Egypt I called my son.',
            reference: { bookId: 40, chapter: 2, startVerse: 1, endVerse: 2 },
        });
        store.location = { ...somewhere, noteId: note.id };

        // Act
        await renderAnalyze();
        await waitForPanels();

        // Assert — the editor, not the list.
        await waitFor(() => expect(panel('Notes').querySelector('.analyze-editor-rendered'))
            .toHaveTextContent('Out of Egypt I called my son.'));
    });

    test('survives the double mount StrictMode does in development', async () => {
        // Arrange — index.js wraps the app in StrictMode, so in development
        // every effect here runs, is torn down and runs again, and the restore's
        // first request is aborted mid-flight by that teardown. The restore is
        // two effects passing a location between them through state, which is
        // exactly the shape a double mount can drop something in.
        store.location = somewhere;

        // Act
        await mount(
            <React.StrictMode>
                <MemoryRouter initialEntries={['/analyze']}>
                    <Analyze />
                    <LocationProbe />
                </MemoryRouter>
            </React.StrictMode>
        );
        await waitForPanels();

        // Assert — the panels are where they should be, and were never anywhere
        // else on the way. The second half holds here because the catalog is
        // still loading while the abort lands, so nothing renders either way;
        // it is asserted anyway because it is the property that matters and the
        // one that would go first if the two effects were rearranged.
        expect(titleOf('Passage')).toBe('Matthew 2');
        expect(titleOf('Compare')).toBe('Genesis 2');
        expect(requestsMatching(r => r.url.endsWith('/chapter/1/1'))).toHaveLength(0);
    });

    test('a link naming a passage overrules the saved place', async () => {
        // Arrange — a shared link is a deliberate instruction about where to
        // open, and the saved place is only the default for when there is none.
        store.location = somewhere;

        // Act
        await renderAnalyze('/analyze?l=1.1');
        await waitForPanels();

        // Assert
        expect(titleOf('Passage')).toBe('Genesis 1');
    });

    test('opens at the defaults for a reader who has not been anywhere yet', async () => {
        // Arrange — store.location is the empty location a new account gets.

        // Act
        await renderAnalyze();
        await waitForPanels();

        // Assert
        expect(titleOf('Passage')).toBe('Genesis 1');
        expect(titleOf('Compare')).toBe('Matthew 1');
    });

    test('opens at the defaults when the saved location cannot be read', async () => {
        // Arrange — the endpoint fails outright. A convenience lost is not a
        // page broken: the panels must still open.
        const answer = global.fetch.getMockImplementation();
        global.fetch = jest.fn((url, options) => (
            url.endsWith('/user/location')
                ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
                : answer(url, options)
        ));

        // Act
        await renderAnalyze();
        await waitForPanels();

        // Assert
        expect(titleOf('Passage')).toBe('Genesis 1');
    });

    test('saves where the reader stopped when the page is left', async () => {
        // Arrange
        const { unmount } = await renderAnalyze();
        await waitForPanels();

        // Act — move both panels, then leave, which is what clicking a Navbar
        // link does. Both panels, because each is saved on its own.
        await clickAndSettle(within(panel('Passage')).getByRole('button', { name: 'Next chapter' }));
        await clickAndSettle(within(panel('Compare')).getByRole('button', { name: 'Next chapter' }));
        unmount();

        // Assert
        expect(store.location).toEqual({
            primary: { bookId: 1, chapter: 2 },
            compare: { bookId: 40, chapter: 2 },
            noteId: null,
        });
    });

    test('saves nothing when the reader only arrives and leaves', async () => {
        // Arrange — arriving on a link is not choosing a place to come back to,
        // and the reader has moved nothing.
        const { unmount } = await renderAnalyze('/analyze?l=40.2&r=1.2');
        await waitForPanels();

        // Act
        unmount();

        // Assert
        expect(store.location).toEqual({ primary: null, compare: null, noteId: null });
        expect(requestsMatching(r => r.method === 'PUT' && r.url.endsWith('/user/location')))
            .toHaveLength(0);
    });

    test('saves a move as it happens, without waiting out a debounce', async () => {
        // Arrange
        await renderAnalyze();
        await waitForPanels();

        // Act — one step forward in the primary panel.
        await clickAndSettle(within(panel('Passage')).getByRole('button', { name: 'Next chapter' }));

        // Assert — no waitFor: the request goes with the move, so that no move
        // depends on the page surviving long enough to send it.
        expect(store.location.primary).toEqual({ bookId: 1, chapter: 2 });
    });

    test('saves a jump straight to another book as it happens', async () => {
        // Arrange
        await renderAnalyze();
        await waitForPanels();

        // Act — the book picker, rather than the arrows. Picking a book lands
        // on its chapter 1.
        await clickAndSettle(within(panel('Compare')).getByRole('button', { name: 'Choose a book' }));
        await clickAndSettle(screen.getByRole('button', { name: 'Exodus' }));

        // Assert
        expect(store.location.compare).toEqual({ bookId: 2, chapter: 1 });
    });

    test('saves the open note along with the passages', async () => {
        // Arrange
        const note = addNote({ title: 'In the beginning' });
        addReference(note.id, { bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 });

        const { unmount } = await renderAnalyze();
        await waitForPanels();

        // Act
        await openFirstNote();
        unmount();

        // Assert
        expect(store.location.noteId).toBe(note.id);
    });
});

describe('Returning to the analysis page from the analysis page', () => {
    test('keeps both passages when the Analyze link lands on a bare /analyze', async () => {
        // Arrange — the reader has moved both panels off their defaults.
        await renderAnalyze();
        await waitForPanels();
        await clickAndSettle(within(panel('Passage')).getByRole('button', { name: 'Next chapter' }));
        await clickAndSettle(within(panel('Compare')).getByRole('button', { name: 'Next chapter' }));

        // Act — the Navbar's Analyze button, pressed while already here. The
        // page does not remount, so nothing re-reads the saved location; the
        // URL simply loses the two params.
        await clickAndSettle(screen.getByRole('button', { name: 'Go to Analyze' }));
        await waitForPanels();

        // Assert — where the reader was, not where the page opens.
        expect(titleOf('Passage')).toBe('Genesis 2');
        expect(titleOf('Compare')).toBe('Matthew 2');
    });

    test('puts the params back, so the URL stays shareable', async () => {
        await renderAnalyze();
        await waitForPanels();
        await clickAndSettle(within(panel('Passage')).getByRole('button', { name: 'Next chapter' }));

        await clickAndSettle(screen.getByRole('button', { name: 'Go to Analyze' }));

        await waitFor(() => {
            expect(screen.getByTestId('search').textContent).toBe('?l=1.2&r=40.1');
        });
    });

    test('does not overwrite the saved location with the defaults', async () => {
        // Arrange — the reset this guards against was silent: the panels went
        // back to Genesis 1, and the save that followed made that the place the
        // reader came back to ever after.
        await renderAnalyze();
        await waitForPanels();
        await clickAndSettle(within(panel('Passage')).getByRole('button', { name: 'Next chapter' }));

        // Act
        await clickAndSettle(screen.getByRole('button', { name: 'Go to Analyze' }));
        await waitForPanels();

        // Assert
        expect(store.location.primary).toEqual({ bookId: 1, chapter: 2 });
    });
});
