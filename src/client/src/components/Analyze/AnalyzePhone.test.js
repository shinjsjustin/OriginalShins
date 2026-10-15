import React from 'react';
import { act, render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Analyze from './Analyze';

const books = [
    { id: 1, name: 'Genesis', abbrev: 'Gen', testament: 'OT', chapterCount: 50, canonicalOrder: 1,
      chapters: [{ number: 1, verseCount: 31 }] },
    { id: 40, name: 'Matthew', abbrev: 'Matt', testament: 'NT', chapterCount: 28, canonicalOrder: 40,
      chapters: [{ number: 1, verseCount: 25 }] },
];

const findBook = id => books.find(book => book.id === id);
const chapterStart = (bookId, chapter) => bookId * 1000 + chapter * 10;

let notes;
let references;

const referencesFor = (bookId, chapter) => references
    .filter(r => r.startIndex <= chapterStart(bookId, chapter) + 1
        && r.endIndex >= chapterStart(bookId, chapter))
    .map(r => ({ ...r, noteTitle: notes.find(n => n.id === r.noteId).title }));

const hydrate = note => ({
    ...note,
    references: references.filter(r => r.noteId === note.id),
    ideas: [],
    topics: [],
});

const respond = (body, status = 200) => Promise.resolve({
    ok: true, status, json: () => Promise.resolve(body),
});

const addStoredReference = (noteId, ref) => {
    const stored = {
        id: references.length + 1,
        noteId,
        ...ref,
        startIndex: chapterStart(ref.bookId, ref.chapter) + ref.startVerse - 1,
        endIndex: chapterStart(ref.bookId, ref.chapter) + ref.endVerse - 1,
    };
    references = [...references, stored];
};

const addNote = (title, reference) => {
    const note = { id: notes.length + 1, title, body: '', sortOrder: notes.length,
        createdAt: '2026-08-18T20:16:00.000Z', updatedAt: '2026-08-18T20:16:00.000Z' };
    notes = [...notes, note];
    if (reference) addStoredReference(note.id, reference);
    return note;
};

const handleRequest = (url, options = {}) => {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;

    if (url.endsWith('/books')) return respond({ books });
    if (url.endsWith('/user/location')) {
        return respond({ location: { primary: null, compare: null, noteId: null } });
    }

    const chapter = /\/chapter\/(\d+)\/(\d+)$/.exec(url);
    if (chapter) {
        const bookId = Number(chapter[1]);
        const number = Number(chapter[2]);
        const book = findBook(bookId);
        const start = chapterStart(bookId, number);
        return respond({
            book: { id: book.id, name: book.name, abbrev: book.abbrev,
                    testament: book.testament, chapterCount: book.chapterCount },
            chapter: { number, verseCount: 2, startIndex: start, endIndex: start + 1 },
            verses: [1, 2].map(verse => ({
                id: start + verse - 1, verse, verseIndex: start + verse - 1,
                text: `${book.name} ${number}:${verse} text`,
            })),
            references: referencesFor(bookId, number),
        });
    }

    const notesQuery = /\/notes\?bookId=(\d+)&chapter=(\d+)$/.exec(url);
    if (notesQuery && method === 'GET') {
        const anchored = referencesFor(Number(notesQuery[1]), Number(notesQuery[2]));
        const ids = [...new Set(anchored.map(r => r.noteId))];
        return respond({
            notes: ids.map(id => hydrate(notes.find(n => n.id === id))),
            unreferenced: notes.filter(n => !references.some(r => r.noteId === n.id)).map(hydrate),
        });
    }

    if (url.endsWith('/notes') && method === 'POST') {
        return respond({ note: hydrate(addNote(body.title || 'Untitled note', body.reference)) }, 201);
    }

    const patch = /\/notes\/(\d+)$/.exec(url);
    if (patch && method === 'PATCH') {
        const id = Number(patch[1]);
        notes = notes.map(n => (n.id === id ? { ...n, ...body } : n));
        return respond({ note: hydrate(notes.find(n => n.id === id)) });
    }

    if (/\/ideas(\?book=\d+)?$/.test(url)) return respond({ ideas: [] });
    if (/\/chapter-ideas\?/.test(url)) return respond({ ideas: [] });

    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
};

const mockPhone = () => {
    window.matchMedia = jest.fn(query => ({
        matches: true,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    }));
};

const renderPhone = async (entry = '/analyze') => {
    await act(async () => {
        render(
            <MemoryRouter initialEntries={[entry]}>
                <Analyze />
            </MemoryRouter>
        );
    });
    await waitFor(() => {
        expect(document.querySelectorAll('.analyze-verse').length).toBeGreaterThan(0);
    });
};

const click = async element => {
    await act(async () => {
        fireEvent.click(element);
    });
};

const visible = name => screen.queryByRole('region', { name });

beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    notes = [];
    references = [];
    mockPhone();
    global.fetch = jest.fn(handleRequest);
});

afterEach(async () => {
    await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
    });
    delete window.matchMedia;
    localStorage.clear();
});

describe('Analyze on a phone', () => {
    test('shows only the Passage panel first, with the switcher offering the others', async () => {
        await renderPhone();

        expect(visible('Passage')).toBeInTheDocument();
        expect(visible('Compare')).toBeNull();
        expect(visible('Notes')).toBeNull();

        const switcher = screen.getByRole('navigation', { name: 'Panels' });
        expect(within(switcher).getByRole('button', { name: 'Passage' })).toHaveAttribute('aria-pressed', 'true');
        expect(within(switcher).getByRole('button', { name: 'Compare' })).toBeInTheDocument();
        expect(within(switcher).getByRole('button', { name: 'Notes' })).toBeInTheDocument();
    });

    test('switching panels swaps which one is visible', async () => {
        await renderPhone();
        const switcher = screen.getByRole('navigation', { name: 'Panels' });

        await click(within(switcher).getByRole('button', { name: 'Compare' }));

        expect(visible('Compare')).toBeInTheDocument();
        expect(visible('Passage')).toBeNull();
    });

    test('renders no collapse tabs and no spines', async () => {
        await renderPhone();

        expect(screen.queryByRole('button', { name: /^Hide / })).toBeNull();
        expect(document.querySelector('.analyze-spine')).toBeNull();
    });

    test('tapping a rail marker shows Notes with that note open', async () => {
        addNote('Light and dark', { bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 });
        await renderPhone('/analyze?l=1.1&r=40.1');

        await click(await screen.findByRole('button', { name: 'Go to note: Light and dark' }));

        expect(visible('Passage')).toBeNull();
        const notesPanel = await screen.findByRole('region', { name: 'Notes' });
        expect(within(notesPanel).getByRole('button', { name: '← All notes' })).toBeInTheDocument();
        expect(notesPanel).toHaveTextContent('Light and dark');
    });

    test('creating a note from tapped verses lands on Notes with the editor open', async () => {
        await renderPhone('/analyze?l=1.1&r=40.1');

        await click(document.querySelector('.analyze-panel--primary [data-verse-index="1010"]'));
        await click(screen.getByRole('button', { name: 'Add note' }));

        const notesPanel = await screen.findByRole('region', { name: 'Notes' });
        expect(visible('Passage')).toBeNull();
        expect(await within(notesPanel).findByRole('button', { name: '← All notes' })).toBeInTheDocument();
        expect(notes).toHaveLength(1);

        await click(within(notesPanel).getByRole('button', { name: 'Edit' }));
        fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Phone note' } });
        await click(within(notesPanel).getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(notes[0].title).toBe('Phone note'));
        expect(visible('Notes')).toBeInTheDocument();
    });
});
