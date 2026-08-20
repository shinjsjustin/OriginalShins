import React from 'react';
import { act, render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, useLocation } from 'react-router-dom';
import Analyze from './Analyze';

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
        nextNoteId: 1,
        nextReferenceId: 1,
        nextIdeaId: 1,
    };
};

const addIdea = (title) => {
    const idea = { id: store.nextIdeaId, title, body: '', sortOrder: store.ideas.length, noteCount: 0, topics: [] };
    store.nextIdeaId += 1;
    store.ideas = [...store.ideas, idea];
    return idea;
};

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

const renderAnalyze = (initialEntry = '/analyze') => mount(
    <MemoryRouter initialEntries={[initialEntry]}>
        <Analyze />
        <LocationProbe />
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

// The two buttons a selection puts in a panel's top-right corner.
const addNoteButton = (panelName) =>
    within(panel(panelName)).queryByRole('button', { name: 'Add note' });

const clearButton = (panelName) =>
    within(panel(panelName)).queryByRole('button', { name: 'Clear selection' });

const versesSelected = (panelName) =>
    panel(panelName).querySelectorAll('.analyze-verse--selected').length;

const versesTinted = (panelName) =>
    panel(panelName).querySelectorAll('.analyze-verse--tint-1, .analyze-verse--tint-2').length;

const markersIn = (panelName) =>
    panel(panelName).querySelectorAll('.analyze-gutter-marker');

const noteRows = () => panel('Notes').querySelectorAll('.analyze-note');

const ideaRows = () => panel('Notes').querySelectorAll('.analyze-idea');

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

    test('ideas are listed whatever chapter the panels are pointed at', async () => {
        addIdea('The wilderness');

        await renderAnalyze();
        await waitForPanels();

        await waitFor(() => expect(ideaRows().length).toBe(1));

        await clickAndSettle(within(panel('Passage')).getByRole('button', { name: 'Next chapter' }));
        await waitFor(() => expect(titleOf('Passage')).toBe('Genesis 2'));

        expect(ideaRows().length).toBe(1);
        expect(panel('Notes')).toHaveTextContent('The wilderness');
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
    test('puts two buttons in the panel corner once a verse is clicked', async () => {
        await renderAnalyze();
        await waitForPanels();

        expect(addNoteButton('Passage')).toBeNull();
        expect(clearButton('Passage')).toBeNull();

        await selectVerses('Passage', 1010);

        expect(addNoteButton('Passage')).toBeInTheDocument();
        expect(clearButton('Passage')).toBeInTheDocument();
        expect(versesSelected('Passage')).toBe(1);
    });

    test('adds each clicked verse to the selection and counts them', async () => {
        await renderAnalyze();
        await waitForPanels();

        await selectVerses('Passage', 1010, 1011);

        expect(versesSelected('Passage')).toBe(2);
        expect(panel('Passage')).toHaveTextContent('2 verses');
    });

    test('clicking a selected verse again takes it back out', async () => {
        await renderAnalyze();
        await waitForPanels();

        await selectVerses('Passage', 1010, 1011);
        await clickVerse('Passage', 1011);

        expect(versesSelected('Passage')).toBe(1);
        expect(panel('Passage')).toHaveTextContent('1 verse');

        // Unclicking the last one ends the selection outright.
        await clickVerse('Passage', 1010);
        expect(addNoteButton('Passage')).toBeNull();
    });

    test('"Clear selection" drops every mark without writing anything', async () => {
        await renderAnalyze();
        await waitForPanels();

        await selectVerses('Passage', 1010, 1011);
        await clickAndSettle(clearButton('Passage'));

        expect(versesSelected('Passage')).toBe(0);
        expect(addNoteButton('Passage')).toBeNull();
        expect(requestsMatching(r => r.method === 'POST')).toHaveLength(0);
    });

    test('a click in the other panel starts a new selection rather than extending', async () => {
        // A note's anchors all live in one chapter, so a selection that spanned
        // two panels could never be saved as it stands.
        await renderAnalyze();
        await waitForPanels();

        await selectVerses('Passage', 1010);
        await selectVerses('Compare', 40010);

        expect(versesSelected('Passage')).toBe(0);
        expect(versesSelected('Compare')).toBe(1);
        expect(addNoteButton('Passage')).toBeNull();
        expect(addNoteButton('Compare')).toBeInTheDocument();
    });

    test('the selection is dropped when the panel moves to another chapter', async () => {
        await renderAnalyze();
        await waitForPanels();

        await selectVerses('Passage', 1010);

        await clickAndSettle(within(panel('Passage')).getByRole('button', { name: 'Next chapter' }));
        await waitFor(() => expect(titleOf('Passage')).toBe('Genesis 2'));

        expect(versesSelected('Passage')).toBe(0);
        expect(addNoteButton('Passage')).toBeNull();
    });
});

describe('Adding a note from selected verses', () => {
    test('POSTs the verse range the clicks resolved to', async () => {
        // Arrange
        await renderAnalyze();
        await waitForPanels();
        await selectVerses('Passage', 1010, 1011);

        // Act
        await clickAndSettle(addNoteButton('Passage'));

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
        await clickAndSettle(addNoteButton('Passage'));

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
        await clickAndSettle(addNoteButton('Passage'));
        await clickAndSettle(within(panel('Notes')).getByRole('button', { name: '← All notes' }));

        await selectVerses('Passage', 1010);
        await clickAndSettle(addNoteButton('Passage'));

        await waitFor(() => {
            expect(panel('Passage').querySelectorAll('.analyze-verse--tint-2')).toHaveLength(1);
        });
        // One rail segment per note, stacked on the one verse.
        expect(markersIn('Passage')).toHaveLength(2);
    });

    test('works from the compare panel too', async () => {
        await renderAnalyze();
        await waitForPanels();

        await selectVerses('Compare', 40010);
        await clickAndSettle(addNoteButton('Compare'));

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

    test('anchors the open note to the current selection', async () => {
        // Arrange — a standalone note, and a selection made after opening it.
        addNote({ title: 'Floating thought' });

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        expect(within(panel('Notes')).getByRole('button', { name: 'Add reference from selection' }))
            .toBeDisabled();

        // Act
        await selectVerses('Passage', 1011);
        await clickAndSettle(
            within(panel('Notes')).getByRole('button', { name: 'Add Genesis 1:2' })
        );

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

        await selectVerses('Passage', 1020);
        await clickAndSettle(within(panel('Notes')).getByRole('button', { name: 'Add Genesis 2:1' }));

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

// ─── Linking a note to ideas ────────────────────────────────────────────────
//
// The multi-select is the reason PUT /notes/:id/ideas replaces the whole set
// rather than adding one link at a time, so what these tests watch is the body
// of that request: it must always be the complete membership the checkboxes
// show, including the empty one.
describe('Linking a note to ideas', () => {
    const openFirstNote = async () => {
        await waitFor(() => expect(noteRows().length).toBeGreaterThan(0));
        await clickAndSettle(noteRows()[0]);
    };

    const ideaCheckbox = (name) => within(panel('Notes')).getByRole('checkbox', { name });

    const ideaLinkRequests = () => requestsMatching(r => r.method === 'PUT' && r.url.endsWith('/ideas'));

    test('offers every idea, with the note\'s current ones already checked', async () => {
        // Arrange
        const abiding = addIdea('Abiding');
        addIdea('Pruning');
        const note = addNote({ title: 'The vine', reference: { bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 } });
        replaceNoteIdeas(note.id, [abiding.id]);

        // Act
        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Assert
        expect(ideaCheckbox('Abiding')).toBeChecked();
        expect(ideaCheckbox('Pruning')).not.toBeChecked();
    });

    test('checking an idea PUTs the complete set, not just the one clicked', async () => {
        // Arrange
        const abiding = addIdea('Abiding');
        const pruning = addIdea('Pruning');
        const note = addNote({ title: 'The vine' });
        replaceNoteIdeas(note.id, [abiding.id]);

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Act
        await clickAndSettle(ideaCheckbox('Pruning'));

        // Assert — both ids, in the order the widget holds them.
        expect(ideaLinkRequests()).toHaveLength(1);
        expect(ideaLinkRequests()[0].body).toEqual({ ideaIds: [abiding.id, pruning.id] });
        await waitFor(() => expect(ideaCheckbox('Pruning')).toBeChecked());
        expect(ideaCheckbox('Abiding')).toBeChecked();
    });

    test('unchecking the last idea sends an empty set and leaves the note behind', async () => {
        // Arrange
        const abiding = addIdea('Abiding');
        const note = addNote({ title: 'The vine' });
        replaceNoteIdeas(note.id, [abiding.id]);

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Act
        await clickAndSettle(ideaCheckbox('Abiding'));

        // Assert — an orphan note is a legal state, so this is a normal save.
        expect(ideaLinkRequests()[0].body).toEqual({ ideaIds: [] });
        await waitFor(() => expect(ideaCheckbox('Abiding')).not.toBeChecked());
        expect(within(panel('Notes')).getByRole('heading', { level: 3 })).toHaveTextContent('The vine');
    });

    test('the link survives a round trip to the server, not just the click', async () => {
        // Arrange
        const abiding = addIdea('Abiding');
        addNote({ title: 'The vine' });

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Act — link it, close the editor, and open it again from the list.
        await clickAndSettle(ideaCheckbox('Abiding'));
        await clickAndSettle(within(panel('Notes')).getByRole('button', { name: '← All notes' }));
        await openFirstNote();

        // Assert — the checkbox is checked because the server said so.
        expect(store.noteIdeas).toEqual([{ noteId: 1, ideaId: abiding.id, sortOrder: 0 }]);
        expect(ideaCheckbox('Abiding')).toBeChecked();
    });

    test('says so when there are no ideas to file the note under', async () => {
        // Arrange — no ideas at all, which is the state a new user is in.
        addNote({ title: 'The vine' });

        // Act
        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Assert
        expect(panel('Notes')).toHaveTextContent('No ideas yet');
        expect(within(panel('Notes')).queryAllByRole('checkbox')).toHaveLength(0);
    });
});
