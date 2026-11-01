import React from 'react';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import Analyze from './Analyze';

const books = [
    { id: 1, name: 'Genesis', abbrev: 'Gen', testament: 'OT', chapterCount: 50, canonicalOrder: 1,
      chapters: [{ number: 1, verseCount: 31 }] },
    { id: 40, name: 'Matthew', abbrev: 'Matt', testament: 'NT', chapterCount: 28, canonicalOrder: 40,
      chapters: [{ number: 1, verseCount: 25 }] },
];

const respond = body => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

const handleRequest = (url) => {
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
            references: [],
        });
    }
    if (/\/notes\?/.test(url)) return respond({ notes: [], unreferenced: [] });
    if (/\/ideas(\?book=\d+)?$/.test(url)) return respond({ ideas: [] });
    if (/\/chapter-ideas\?/.test(url)) return respond({ ideas: [] });
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
};

const Probe = () => {
    const location = useLocation();
    const type = useNavigationType();
    return <output data-testid="probe" data-type={type}>{location.search}</output>;
};

const search = () => new URLSearchParams(screen.getByTestId('probe').textContent);
const navType = () => screen.getByTestId('probe').getAttribute('data-type');

const setMatchMedia = matches => {
    window.matchMedia = jest.fn(query => ({
        matches, media: query, addEventListener: jest.fn(), removeEventListener: jest.fn(),
    }));
};

const renderAt = async (entry, { phone = true } = {}) => {
    setMatchMedia(phone);
    await act(async () => {
        render(
            <MemoryRouter initialEntries={[entry]}>
                <Analyze />
                <Probe />
            </MemoryRouter>
        );
    });
    await waitFor(() => {
        expect(document.querySelectorAll('.analyze-verse, .analyze-reader-verse').length).toBeGreaterThan(0);
    });
};

const click = async element => {
    await act(async () => {
        fireEvent.click(element);
    });
};

const swipeNext = async () => {
    const body = document.querySelector('.analyze-reader-body');
    await act(async () => {
        fireEvent.touchStart(body, { changedTouches: [{ clientX: 500, clientY: 300 }] });
        fireEvent.touchEnd(body, { changedTouches: [{ clientX: 300, clientY: 305 }] });
    });
};

beforeEach(() => {
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

describe('Analyze reader mode', () => {
    test('the Passage header offers Full screen on a phone', async () => {
        await renderAt('/analyze?l=1.1&r=40.1');
        expect(screen.getByRole('button', { name: 'Full screen' })).toBeInTheDocument();
    });

    test('desktop has no Full screen button', async () => {
        await renderAt('/analyze?l=1.1&r=40.1', { phone: false });
        expect(screen.queryByRole('button', { name: 'Full screen' })).toBeNull();
    });

    test('Full screen shows the reader, hides the chrome, and keeps panels mounted', async () => {
        await renderAt('/analyze?l=1.1&r=40.1');
        await click(screen.getByRole('button', { name: 'Full screen' }));

        expect(screen.getByRole('region', { name: 'Reader' })).toBeInTheDocument();
        expect(search().get('read')).toBe('1');
        expect(screen.queryByRole('navigation', { name: 'Panels' })).toBeNull();
        expect(document.querySelector('.navbar, .navbar-container, .profile-icon')).toBeNull();
        const main = document.querySelector('main.analyze-panels');
        expect(main).toHaveAttribute('hidden');
        expect(main.querySelector('section[aria-label="Passage"]')).not.toBeNull();
        expect(main.querySelector('section[aria-label="Notes"]')).not.toBeNull();
    });

    test('a swipe moves ?l= to the next chapter with a replace', async () => {
        await renderAt('/analyze?l=1.1&r=40.1&read=1');
        await swipeNext();

        await waitFor(() => expect(search().get('l')).toBe('1.2'));
        expect(navType()).toBe('REPLACE');
        expect(search().get('read')).toBe('1');
    });

    test('Exit reader returns to Analyze on the chapter reached, without ?read', async () => {
        await renderAt('/analyze?l=1.1&r=40.1&read=1');
        await swipeNext();
        await waitFor(() => expect(search().get('l')).toBe('1.2'));

        await act(async () => {
            const body = document.querySelector('.analyze-reader-body');
            const middle = { changedTouches: [{ clientX: window.innerWidth / 2, clientY: 300 }] };
            fireEvent.touchStart(body, middle);
            fireEvent.touchEnd(body, middle);
        });
        await click(screen.getByRole('button', { name: 'Exit reader' }));

        expect(search().has('read')).toBe(false);
        expect(search().get('l')).toBe('1.2');
        expect(navType()).toBe('REPLACE');
        expect(screen.queryByRole('region', { name: 'Reader' })).toBeNull();
    });

    test('arriving with ?read=1 opens the reader on that chapter', async () => {
        await renderAt('/analyze?l=1.2&read=1');
        const reader = screen.getByRole('region', { name: 'Reader' });
        expect(reader).toHaveTextContent('Genesis 2');
    });
});
