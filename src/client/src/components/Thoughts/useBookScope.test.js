import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import useBookScope, { GENESIS_BOOK_ID } from './useBookScope';

let requests;

const jsonResponse = (body) => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
});

// The two endpoints the scope can be seeded from, and nothing else. A test
// that needs a different answer overrides `answers` before rendering.
let answers;

const handleRequest = (url) => {
    requests.push(url);

    if (url.endsWith('/user/location')) return jsonResponse({ location: answers.location });

    const idea = /\/ideas\/(\d+)$/.exec(url);
    if (idea) return jsonResponse({ idea: answers.idea });

    throw new Error(`unexpected request: ${url}`);
};

// A probe rather than renderHook, so the hook is exercised inside a real
// router — the thing it actually writes to is the query string.
//
// `showBookTargets` renders one button per id a test wants to call `showBook`
// with, named by that id so a test can reach for exactly the one it needs.
// `back` exercises the router's own history rather than a mock of it, since
// what showBook must get right is what it does to a *real* history stack.
const Probe = ({ ideaId, showBookTargets = [] }) => {
    const { bookId, isResolving, showBook } = useBookScope(ideaId);
    const location = useLocation();
    const navigate = useNavigate();

    return (
        <>
            <span data-testid="book">{isResolving ? 'resolving' : String(bookId)}</span>
            <span data-testid="search">{location.search}</span>
            <span data-testid="path">{location.pathname}</span>
            {showBookTargets.map(target => (
                <button key={target} data-testid={`show-${target}`} onClick={() => showBook(target)}>
                    {`show ${target}`}
                </button>
            ))}
            <button data-testid="back" onClick={() => navigate(-1)}>back</button>
        </>
    );
};

const renderScope = (entry, ideaId = null, showBookTargets = []) => render(
    <MemoryRouter initialEntries={[entry]}>
        <Probe ideaId={ideaId} showBookTargets={showBookTargets} />
    </MemoryRouter>
);

beforeEach(() => {
    requests = [];
    answers = { location: { primary: null, compare: null, noteId: null }, idea: null };
    global.fetch = jest.fn(handleRequest);
});

// Every test gets a clean `console.error` regardless of how it exited — a
// spy left standing past an assertion failure is a trap for whatever runs
// next, in this file or a report of this file's own output.
afterEach(() => {
    jest.restoreAllMocks();
});

test('1. the URL wins, and costs no request', async () => {
    renderScope('/thoughts?book=41');

    await waitFor(() => expect(screen.getByTestId('book')).toHaveTextContent('41'));
    expect(requests).toEqual([]);
});

test('2. an idea with no book in the URL contributes its own', async () => {
    answers.idea = { id: 7, bookId: 41, title: 'Sower' };
    renderScope('/thoughts?idea=7', 7);

    await waitFor(() => expect(screen.getByTestId('book')).toHaveTextContent('41'));
    // Written into the URL so a reload, and Reset View, stay in Mark. That
    // write is a second effect, not the same commit that resolved `bookId` —
    // wait for it too rather than assuming it has already landed the instant
    // 'book' settles.
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('book=41'));
});

test('3. a bare /thoughts falls back to where Analyze was left', async () => {
    answers.location = { primary: { bookId: 40, chapter: 5 }, compare: null, noteId: null };
    renderScope('/thoughts');

    await waitFor(() => expect(screen.getByTestId('book')).toHaveTextContent('40'));
    // Same second-effect race as test 2 above: wait for the URL write rather
    // than assuming it is already done.
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('book=40'));
});

test('4. with no saved place at all, Genesis', async () => {
    renderScope('/thoughts');

    await waitFor(() => expect(screen.getByTestId('book')).toHaveTextContent(String(GENESIS_BOOK_ID)));
});

test('a location that cannot be read is Genesis, not an error', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('network down')));
    renderScope('/thoughts');

    await waitFor(() => expect(screen.getByTestId('book')).toHaveTextContent(String(GENESIS_BOOK_ID)));
});

test('a nonsense ?book= falls through to the saved location rather than erroring', async () => {
    answers.location = { primary: { bookId: 40, chapter: 5 }, compare: null, noteId: null };
    renderScope('/thoughts?book=999');

    await waitFor(() => expect(screen.getByTestId('book')).toHaveTextContent('40'));
});

test('a dead idea id falls back to the saved location rather than Genesis', async () => {
    answers.location = { primary: { bookId: 40, chapter: 5 }, compare: null, noteId: null };

    // Only the idea branch rejects here; the location endpoint still answers
    // normally, which is the whole point of the test.
    global.fetch = jest.fn((url) => {
        requests.push(url);

        if (/\/ideas\/\d+$/.test(url)) return Promise.reject(new Error('not found'));
        if (url.endsWith('/user/location')) return jsonResponse({ location: answers.location });

        throw new Error(`unexpected request: ${url}`);
    });

    renderScope('/thoughts?idea=7', 7);

    await waitFor(() => expect(screen.getByTestId('book')).toHaveTextContent('40'));
});

test('the scope is resolving until it is settled, so nothing fetches early', async () => {
    answers.location = { primary: { bookId: 40, chapter: 5 }, compare: null, noteId: null };
    renderScope('/thoughts');

    expect(screen.getByTestId('book')).toHaveTextContent('resolving');
    await waitFor(() => expect(screen.getByTestId('book')).toHaveTextContent('40'));
});

test('showBook replaces the current entry rather than pushing a new one', async () => {
    render(
        <MemoryRouter initialEntries={['/elsewhere?marker=1', '/thoughts?book=40']} initialIndex={1}>
            <Probe showBookTargets={[41]} />
        </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByTestId('book')).toHaveTextContent('40'));

    fireEvent.click(screen.getByTestId('show-41'));
    await waitFor(() => expect(screen.getByTestId('book')).toHaveTextContent('41'));

    fireEvent.click(screen.getByTestId('back'));

    // A pushed entry would land back on ?book=40, still inside Thoughts. A
    // replaced one leaves no trace of the visit to 40, so back lands wherever
    // Thoughts was entered from.
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('marker=1'));
});

test('showBook clears the idea from the URL when the book changes', async () => {
    renderScope('/thoughts?book=40&idea=5', null, [41]);

    await waitFor(() => expect(screen.getByTestId('book')).toHaveTextContent('40'));
    expect(screen.getByTestId('search')).toHaveTextContent('idea=5');

    fireEvent.click(screen.getByTestId('show-41'));

    await waitFor(() => expect(screen.getByTestId('book')).toHaveTextContent('41'));
    expect(screen.getByTestId('search')).not.toHaveTextContent('idea=5');
});

test('showBook ignores an id parseBookId rejects', async () => {
    renderScope('/thoughts?book=40', null, [999]);

    await waitFor(() => expect(screen.getByTestId('book')).toHaveTextContent('40'));
    const searchBefore = screen.getByTestId('search').textContent;

    fireEvent.click(screen.getByTestId('show-999'));

    expect(screen.getByTestId('book')).toHaveTextContent('40');
    expect(screen.getByTestId('search')).toHaveTextContent(searchBefore);
});

test('unmounting while the seed fetch is in flight aborts it instead of warning', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    // A fetch that only ever settles if its own signal is aborted — the shape
    // of a request that is still in flight when the component goes away.
    global.fetch = jest.fn((url, options = {}) => new Promise((resolve, reject) => {
        const { signal } = options;
        if (!signal) return;
        signal.addEventListener('abort', () => {
            const abortError = new Error('The operation was aborted.');
            abortError.name = 'AbortError';
            reject(abortError);
        });
    }));

    const { unmount } = renderScope('/thoughts');

    expect(screen.getByTestId('book')).toHaveTextContent('resolving');

    unmount();

    // Let the aborted fetch's rejection actually settle before asserting on
    // it — asserting immediately would prove nothing.
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(consoleError).not.toHaveBeenCalled();
    // Restoring is afterEach's job now — see above — so a failed assertion
    // here still leaves console.error clean for whatever runs next.
});
