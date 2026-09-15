import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
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
const Probe = ({ ideaId }) => {
    const { bookId, isResolving } = useBookScope(ideaId);
    const location = useLocation();

    return (
        <>
            <span data-testid="book">{isResolving ? 'resolving' : String(bookId)}</span>
            <span data-testid="search">{location.search}</span>
        </>
    );
};

const renderScope = (entry, ideaId = null) => render(
    <MemoryRouter initialEntries={[entry]}>
        <Probe ideaId={ideaId} />
    </MemoryRouter>
);

beforeEach(() => {
    requests = [];
    answers = { location: { primary: null, compare: null, noteId: null }, idea: null };
    global.fetch = jest.fn(handleRequest);
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
    // Written into the URL so a reload, and Reset View, stay in Mark.
    expect(screen.getByTestId('search')).toHaveTextContent('book=41');
});

test('3. a bare /thoughts falls back to where Analyze was left', async () => {
    answers.location = { primary: { bookId: 40, chapter: 5 }, compare: null, noteId: null };
    renderScope('/thoughts');

    await waitFor(() => expect(screen.getByTestId('book')).toHaveTextContent('40'));
    expect(screen.getByTestId('search')).toHaveTextContent('book=40');
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

test('the scope is resolving until it is settled, so nothing fetches early', async () => {
    answers.location = { primary: { bookId: 40, chapter: 5 }, compare: null, noteId: null };
    renderScope('/thoughts');

    expect(screen.getByTestId('book')).toHaveTextContent('resolving');
    await waitFor(() => expect(screen.getByTestId('book')).toHaveTextContent('40'));
});
