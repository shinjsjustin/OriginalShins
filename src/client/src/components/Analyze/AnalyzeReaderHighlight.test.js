import React from 'react';
import { act, render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Analyze from './Analyze';

const books = [
    { id: 1, name: 'Genesis', abbrev: 'Gen', testament: 'OT', chapterCount: 50, canonicalOrder: 1,
      chapters: [{ number: 1, verseCount: 2 }] },
    { id: 40, name: 'Matthew', abbrev: 'Matt', testament: 'NT', chapterCount: 28, canonicalOrder: 40,
      chapters: [{ number: 1, verseCount: 2 }] },
];

// Genesis 1 holds verse indexes 1010 and 1011.
const FIRST_INDEX = 1010;

const respond = body => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

let store;
let requests;

const resetStore = () => {
    store = { notes: [], nextNoteId: 1, nextReferenceId: 1 };
    requests = [];
};

const addNote = (note, reference) => {
    const created = {
        id: store.nextNoteId, title: note.title || '', body: note.body || '',
        references: [{
            id: store.nextReferenceId, noteId: store.nextNoteId, ...reference,
            startIndex: FIRST_INDEX + reference.startVerse - 1,
            endIndex: FIRST_INDEX + reference.endVerse - 1,
        }],
        ideas: [], topics: [],
    };
    store.nextNoteId += 1;
    store.nextReferenceId += 1;
    store.notes = [...store.notes, created];
    return created;
};

const handleRequest = (url, options = {}) => {
    const method = options.method || 'GET';
    requests.push({ url, method, body: options.body ? JSON.parse(options.body) : undefined });

    if (url.endsWith('/books')) return respond({ books });
    if (url.endsWith('/user/location')) {
        return respond({ location: { primary: null, compare: null, noteId: null } });
    }
    const chapter = /\/chapter\/(\d+)\/(\d+)$/.exec(url);
    if (chapter) {
        const book = books.find(b => b.id === Number(chapter[1]));
        const number = Number(chapter[2]);
        const start = book.id * 1000 + number * 10;
        return respond({
            book: { id: book.id, name: book.name, abbrev: book.abbrev,
                    testament: book.testament, chapterCount: book.chapterCount },
            chapter: { number, verseCount: 2, startIndex: start, endIndex: start + 1 },
            verses: [1, 2].map(verse => ({
                id: start + verse - 1, verse, verseIndex: start + verse - 1,
                text: `${book.name} ${number}:${verse} text`,
            })),
            references: store.notes
                .filter(n => n.references.some(r => r.bookId === book.id && r.chapter === number))
                .flatMap(n => n.references),
        });
    }
    if (/\/notes\?bookId=1&chapter=1$/.test(url)) {
        return respond({ notes: store.notes, unreferenced: [] });
    }
    if (/\/notes\?/.test(url)) return respond({ notes: [], unreferenced: [] });
    if (url.endsWith('/notes') && method === 'POST') {
        const body = JSON.parse(options.body);
        return respond({ note: addNote(body, body.reference) });
    }
    const note = /\/notes\/(\d+)$/.exec(url);
    if (note && method === 'DELETE') {
        store.notes = store.notes.filter(n => n.id !== Number(note[1]));
        return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve(null) });
    }
    if (/\/ideas(\?book=\d+)?$/.test(url)) return respond({ ideas: [] });
    if (/\/chapter-ideas\?/.test(url)) return respond({ ideas: [] });
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
};

const Probe = () => <output data-testid="probe">{useLocation().search}</output>;
const search = () => new URLSearchParams(screen.getByTestId('probe').textContent);

const writes = (method, pattern) => requests.filter(r => r.method === method && pattern.test(r.url));

const renderReader = async () => {
    window.matchMedia = jest.fn(query => ({
        matches: true, media: query, addEventListener: jest.fn(), removeEventListener: jest.fn(),
    }));
    await act(async () => {
        render(
            <MemoryRouter initialEntries={['/analyze?l=1.1&read=1']}>
                <Analyze />
                <Probe />
            </MemoryRouter>
        );
    });
    await waitFor(() => expect(document.querySelectorAll('.analyze-reader-verse').length).toBe(2));
};

const click = async element => {
    await act(async () => {
        fireEvent.click(element);
    });
};

const selectFirstVerse = async () => {
    await click(document.querySelector('.analyze-reader-verse .analyze-reader-verse-number'));
    await screen.findByRole('dialog');
};

const readerVerse = () => document.querySelectorAll('.analyze-reader-verse')[0];
const panelVerse = () => document.querySelector('section[aria-label="Passage"] .analyze-verse');
const isTinted = element => /analyze-verse--tint/.test(element.className);

beforeEach(() => {
    resetStore();
    localStorage.setItem('token', 'test-token');
    global.fetch = jest.fn(handleRequest);
});

afterEach(async () => {
    await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
    });
    delete window.matchMedia;
    localStorage.clear();
});

describe('Analyze reader writes', () => {
    test('Highlight sends one POST /notes with the selected reference and tints the verse in the reader', async () => {
        await renderReader();
        await selectFirstVerse();
        await click(screen.getByRole('button', { name: 'Highlight' }));

        await waitFor(() => expect(readerVerse().className).toMatch(/analyze-reader-verse--tint|analyze-verse--tint/));
        const posts = writes('POST', /\/notes$/);
        expect(posts).toHaveLength(1);
        expect(posts[0].body.reference).toEqual({ bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 });
        expect(screen.getByRole('region', { name: 'Reader' })).toBeInTheDocument();
    });

    test('after Highlight and Exit reader the primary panel shows the verse tinted without a reload', async () => {
        await renderReader();
        await selectFirstVerse();
        await click(screen.getByRole('button', { name: 'Highlight' }));
        await waitFor(() => expect(readerVerse().className).toMatch(/tint/));

        await act(async () => {
            const body = document.querySelector('.analyze-reader-body');
            const middle = { changedTouches: [{ clientX: window.innerWidth / 2, clientY: 300 }] };
            fireEvent.touchStart(body, middle);
            fireEvent.touchEnd(body, middle);
        });
        await click(screen.getByRole('button', { name: 'Exit reader' }));

        expect(search().has('read')).toBe(false);
        await waitFor(() => expect(isTinted(panelVerse())).toBe(true));
    });

    test('Remove highlight deletes the blank note and the tint goes', async () => {
        addNote({}, { bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 });
        await renderReader();
        await waitFor(() => expect(readerVerse().className).toMatch(/tint/));
        await selectFirstVerse();
        await click(screen.getByRole('button', { name: 'Remove highlight' }));

        await waitFor(() => expect(readerVerse().className).not.toMatch(/tint/));
        expect(writes('DELETE', /\/notes\/1$/)).toHaveLength(1);
    });

    test('Remove highlight on a written note sends no DELETE', async () => {
        addNote({ title: 'Mine', body: 'words' }, { bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 });
        await renderReader();
        await waitFor(() => expect(readerVerse().className).toMatch(/tint/));
        await selectFirstVerse();

        expect(screen.getByRole('button', { name: 'Remove highlight' })).toBeDisabled();
        expect(requests.filter(r => r.method === 'DELETE')).toHaveLength(0);
        expect(readerVerse().className).toMatch(/tint/);
    });

    test('Add note creates the note, leaves the reader and opens it in the editor', async () => {
        await renderReader();
        await selectFirstVerse();
        await click(screen.getByRole('button', { name: 'Add note' }));

        await waitFor(() => expect(search().has('read')).toBe(false));
        expect(writes('POST', /\/notes$/)).toHaveLength(1);
        const notesPanel = document.querySelector('section[aria-label="Notes"]');
        await waitFor(() => expect(within(notesPanel).getByRole('button', { name: /all notes/i })).toBeInTheDocument());
    });

    test('Open in Analyze leaves the reader and opens the written note', async () => {
        addNote({ title: 'Mine', body: 'words' }, { bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 });
        await renderReader();
        await waitFor(() => expect(readerVerse().className).toMatch(/tint/));
        await selectFirstVerse();
        await click(screen.getByRole('button', { name: 'Open in Analyze' }));

        await waitFor(() => expect(search().has('read')).toBe(false));
        const notesPanel = document.querySelector('section[aria-label="Notes"]');
        await waitFor(() => expect(within(notesPanel).getByRole('button', { name: /all notes/i })).toBeInTheDocument());
        expect(notesPanel).toHaveTextContent('Mine');
        expect(requests.filter(r => r.method === 'DELETE')).toHaveLength(0);
    });
});
