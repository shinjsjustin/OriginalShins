import React from 'react';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SearchPage from './SearchPage';

// ─── A standing-in search API ───────────────────────────────────────────────
//
// It matches the way src/lib/search.js does rather than returning canned rows:
// the same word has to reach a note body, an idea title, a topic description
// and a verse, and each group has to rank a title hit above a body hit. A fixed
// payload would let the page pass while the query it sent was wrong — and the
// query is half of what this page does.

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

let store;

const resetStore = () => {
    store = {
        notes: [
            { id: 1, title: 'Psalm 23 reading', body: 'The shepherd image runs through it', firstReference: { bookId: 19, chapter: 23 } },
            { id: 2, title: 'Shepherd in John', body: 'no match in the body', firstReference: null },
            { id: 3, title: 'Unrelated', body: 'nothing to see', firstReference: null },
        ],
        ideas: [
            { id: 7, title: 'Shepherd imagery', body: 'body without the word', topics: [{ id: 4, name: 'Care', slug: 'care' }] },
            { id: 8, title: 'Unfiled thought', body: 'a shepherd appears here', topics: [] },
        ],
        topics: [
            { id: 4, name: 'Care', slug: 'care', description: 'Where the shepherd metaphor works' },
        ],
        verses: [
            { bookId: 19, bookName: 'Psalms', chapter: 23, verse: 1, verseIndex: 14237, text: 'Yahweh is my shepherd: I shall lack nothing.' },
            { bookId: 43, bookName: 'John', chapter: 10, verse: 11, verseIndex: 26492, text: 'I am the good shepherd.' },
        ],
    };
};

const matches = (text, term) => String(text).toLowerCase().includes(term.toLowerCase());

// The server's ranking rule: a title hit sorts above a body-only hit.
const rankedByTitleFirst = (rows, term, titleKey, bodyKey) => rows
    .filter(row => matches(row[titleKey], term) || matches(row[bodyKey], term))
    .map((row, index) => ({ row, rank: matches(row[titleKey], term) ? 0 : 1, index }))
    .sort((a, b) => (a.rank - b.rank) || (a.index - b.index))
    .map(entry => entry.row);

const search = (term) => ({
    query: term,
    notes: rankedByTitleFirst(store.notes, term, 'title', 'body')
        .map(note => ({ id: note.id, title: note.title, snippet: note.body, firstReference: note.firstReference })),
    ideas: rankedByTitleFirst(store.ideas, term, 'title', 'body')
        .map(idea => ({ id: idea.id, title: idea.title, snippet: idea.body, topics: idea.topics })),
    topics: rankedByTitleFirst(store.topics, term, 'name', 'description')
        .map(topic => ({ id: topic.id, name: topic.name, slug: topic.slug, snippet: topic.description })),
    // Scripture is whole-word matching against a FULLTEXT index, so the mock
    // matches on words rather than on substrings the way the LIKE groups do.
    scripture: store.verses
        .filter(verse => verse.text.toLowerCase().split(/\W+/).includes(term.toLowerCase()))
        .map(verse => ({
            bookId: verse.bookId,
            bookName: verse.bookName,
            chapter: verse.chapter,
            verse: verse.verse,
            verseIndex: verse.verseIndex,
            snippet: verse.text,
        })),
});

const jsonResponse = (body, status = 200) => Promise.resolve({
    ok: true,
    status,
    json: () => Promise.resolve(body),
});

const failure = (status) => Promise.resolve({ ok: false, status, json: () => Promise.resolve({}) });

let requests;
let respond;

const handleRequest = (url) => {
    const query = new URL(url, 'http://localhost').searchParams.get('q');
    requests.push({ url, query });
    return respond(query);
};

beforeEach(() => {
    jest.useFakeTimers();
    localStorage.setItem('token', 'test-token');
    resetStore();
    requests = [];
    // The server refuses a query it considers too short; the page is expected
    // never to send one, and this is what proves it if it does.
    respond = (query) => (query && query.length >= MIN_QUERY_LENGTH
        ? jsonResponse(search(query))
        : failure(400));
    global.fetch = jest.fn(handleRequest);
});

afterEach(async () => {
    // Let anything the last assertion did not wait on settle inside act(), so a
    // stray "not wrapped in act" warning cannot bury a real one.
    await act(async () => {});
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.resetAllMocks();
    localStorage.clear();
});

// ─── Driving the page ───────────────────────────────────────────────────────

const mount = async () => {
    let result;
    await act(async () => {
        result = render(<MemoryRouter><SearchPage /></MemoryRouter>);
    });
    return result;
};

const input = () => screen.getByLabelText(/search notes, ideas, topics and scripture/i);

// Types without letting the debounce fire — one keystroke of a burst.
const typeOnly = async (value) => {
    await act(async () => {
        fireEvent.change(input(), { target: { value } });
    });
};

// Types, then lets the debounce elapse and the request settle.
const type = async (value) => {
    await typeOnly(value);
    await act(async () => {
        jest.advanceTimersByTime(DEBOUNCE_MS);
    });
    await act(async () => {});
};

const group = (heading) => screen.getByRole('heading', { name: new RegExp(`^${heading}`) })
    .closest('.search-group');

const linksIn = (heading) => Array.from(group(heading).querySelectorAll('a'))
    .map(anchor => ({ text: anchor.textContent, href: anchor.getAttribute('href') }));

const status = () => screen.getByRole('status').textContent;

describe('searching', () => {
    test('a word in a note body, an idea title, a topic description and a verse returns all four groups', async () => {
        // Arrange
        await mount();

        // Act
        await type('shepherd');

        // Assert — the acceptance case, one word reaching every tier.
        expect(group('Notes')).toBeInTheDocument();
        expect(group('Ideas')).toBeInTheDocument();
        expect(group('Topics')).toBeInTheDocument();
        expect(group('Scripture')).toBeInTheDocument();
    });

    test('each result links where its kind belongs', async () => {
        // Arrange
        await mount();

        // Act
        await type('shepherd');

        // Assert — a note opens its editor at its first anchor…
        expect(linksIn('Notes')).toContainEqual(
            expect.objectContaining({ href: '/analyze?l=19.23&note=1' })
        );
        // …an idea opens on the Thoughts canvas and a topic lands on the field…
        expect(linksIn('Ideas')).toContainEqual(
            expect.objectContaining({ href: '/thoughts?idea=7' })
        );
        expect(linksIn('Topics')).toContainEqual(
            expect.objectContaining({ href: '/thoughts' })
        );
        // …and a verse puts the left panel on its chapter.
        expect(linksIn('Scripture')).toContainEqual(
            expect.objectContaining({ href: '/analyze?l=19.23' })
        );
    });

    test('an unfiled idea links the same way as a filed one', async () => {
        // Arrange
        await mount();

        // Act
        await type('shepherd');

        // Assert — the idea view is reached by id, so being filed under nothing
        // is not a different destination.
        expect(linksIn('Ideas')).toContainEqual(
            expect.objectContaining({ href: '/thoughts?idea=8' })
        );
    });

    test('prints the groups in tier order, the reader’s own writing first', async () => {
        // Arrange
        await mount();

        // Act
        await type('shepherd');

        // Assert
        const headings = screen.getAllByRole('heading', { level: 2 }).map(node => node.textContent);
        expect(headings.map(heading => heading.replace(/\d+$/, ''))).toEqual([
            'Notes', 'Ideas', 'Topics', 'Scripture',
        ]);
    });

    test('shows the title match above the body match the server ranked below it', async () => {
        // Arrange
        await mount();

        // Act
        await type('shepherd');

        // Assert — the page prints the server's order and does not sort again.
        const titles = within(group('Notes')).getAllByRole('link')
            .map(link => link.querySelector('.search-result-title').textContent);
        expect(titles).toEqual(['Shepherd in John', 'Psalm 23 reading']);
    });

    test('leaves out a group nothing matched', async () => {
        // Arrange
        await mount();

        // Act — a word in one note and nowhere else.
        await type('Unrelated');

        // Assert
        expect(screen.getByRole('heading', { name: /^Notes/ })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: /^Scripture/ })).not.toBeInTheDocument();
    });
});

describe('the states that are not results', () => {
    test('debounces to one request for a typed word', async () => {
        // Arrange
        await mount();

        // Act — five keystrokes inside the debounce window.
        await typeOnly('s');
        await typeOnly('sh');
        await typeOnly('she');
        await typeOnly('shep');
        await typeOnly('shepherd');
        await act(async () => { jest.advanceTimersByTime(DEBOUNCE_MS); });
        await act(async () => {});

        // Assert — the network saw the word, not its prefixes.
        expect(requests.map(request => request.query)).toEqual(['shepherd']);
    });

    test('sends nothing for a query below the minimum length', async () => {
        // Arrange
        await mount();

        // Act
        await type('s');

        // Assert — refused here rather than by a 400 the reader would have to
        // wait for.
        expect(requests).toHaveLength(0);
        expect(status()).toMatch(/at least 2 characters/i);
    });

    test('shows a loading state while the request is in flight', async () => {
        // Arrange — a request that does not settle until we let it.
        await mount();
        let release;
        respond = () => new Promise(resolve => { release = () => resolve(jsonResponse(search('shepherd'))); });

        // Act
        await typeOnly('shepherd');
        await act(async () => { jest.advanceTimersByTime(DEBOUNCE_MS); });

        // Assert
        expect(status()).toMatch(/searching/i);

        // Act — and it clears once the answer arrives.
        await act(async () => { release(); });
        expect(status()).not.toMatch(/searching/i);
    });

    test('says so explicitly when nothing matches', async () => {
        // Arrange
        await mount();

        // Act
        await type('zebra');

        // Assert — the word searched for, not the word in the box, and no
        // empty headings above it.
        expect(screen.getByText(/nothing matches “zebra”/i)).toBeInTheDocument();
        expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    });

    test('surfaces a failed search instead of showing an empty page', async () => {
        // Arrange
        await mount();
        respond = () => failure(500);

        // Act
        await type('shepherd');

        // Assert
        expect(screen.getByRole('alert')).toHaveTextContent(/server ran into a problem/i);
    });

    test('clears the results when the box is emptied', async () => {
        // Arrange
        await mount();
        await type('shepherd');

        // Act
        await type('');

        // Assert
        expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
        expect(screen.queryByText(/nothing matches/i)).not.toBeInTheDocument();
    });
});
