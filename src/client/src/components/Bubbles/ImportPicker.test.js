import React from 'react';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ImportPicker from './ImportPicker';

// ─── What the picker has to get right ───────────────────────────────────────
//
// The field below it is already tested, and so is the overlay around it. What
// is new here is the step between them: a pick that is held rather than acted
// on, and a button that acts on it once.
//
// Three things matter. Import must refuse to fire with nothing picked, or the
// confirm step teaches the reader it does nothing. The pick must be exclusive
// ACROSS the two tiers — picking a topic after an idea must leave one pick, not
// two — because the endpoint written depends on which kind it is. And a kind
// the caller did not offer must not become pickable by any route, since the
// chapter importer has nowhere to store a topic.
//
// The picker now loads its own corpus, scoped to a book — see useImportCorpus
// — so this file stands in for that read the same way Analyze.test.js and
// Thoughts.test.js stand in for theirs: a small stateful fake over
// global.fetch, keyed on the book the picker asks for.

const BOOK_ID = 40;
const BOOKS = [{ id: BOOK_ID, name: 'Matthew', canonicalOrder: 40 }];

const TOPICS = [
    { id: 1, name: 'Faith' },
    { id: 2, name: 'Law' },
];

const IDEAS = [
    { id: 11, title: 'Covenant renewal', topics: [{ id: 1, name: 'Faith' }] },
    { id: 12, title: 'Sabbath', topics: [{ id: 2, name: 'Law' }] },
];

// What the fetch fake serves for this book. Reset before each test and
// overridable per test — see renderPicker's `topics`/`ideas`/`failTopics`
// overrides.
let topicsFixture;
let ideasFixture;
let topicsFail;

const jsonResponse = (body) => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
});

const serverError = () => Promise.resolve({
    ok: false,
    status: 500,
    json: () => Promise.resolve({}),
});

const handleRequest = (url) => {
    if (url.includes('/topics')) return topicsFail ? serverError() : jsonResponse({ topics: topicsFixture });
    if (url.includes('/ideas')) return jsonResponse({ ideas: ideasFixture });
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
};

beforeEach(() => {
    topicsFixture = TOPICS;
    ideasFixture = IDEAS;
    topicsFail = false;
    global.fetch = jest.fn(handleRequest);
});

// `topics`/`ideas` configure the fetch fake's response for this render;
// `failTopics` makes the topics read 500 instead. Every other override is a
// prop on ImportPicker itself. Async because the corpus arrives over the fake
// fetch — see Analyze.test.js's `mount` for why an async act is what lets
// that first response land before the test proceeds.
const renderPicker = async ({ topics, ideas, failTopics, ...props } = {}) => {
    if (topics) topicsFixture = topics;
    if (ideas) ideasFixture = ideas;
    if (failTopics) topicsFail = true;

    const onImport = jest.fn();
    const onClose = jest.fn();

    await act(async () => {
        render(
            <MemoryRouter>
                <ImportPicker
                    label="Import into this note"
                    books={BOOKS}
                    bookId={BOOK_ID}
                    selectableKinds={['idea', 'topic']}
                    onImport={onImport}
                    onClose={onClose}
                    {...props}
                />
            </MemoryRouter>
        );
    });

    return { onImport, onClose };
};

const importButton = () => screen.getByRole('button', { name: 'Import' });
const cancelButton = () => screen.getByRole('button', { name: 'Cancel' });

/** A card in the field, found by the title it prints rather than its full name. */
const cardOf = (name) => screen.getByText(name, { selector: '.thoughts-bubble-title' })
    .closest('button');

const cardBoxOf = (name) => screen.getByText(name, { selector: '.thoughts-bubble-title' })
    .closest('.thoughts-bubble');

describe('ImportPicker', () => {
    test('is a dialog named by its label', async () => {
        await renderPicker();

        expect(screen.getByRole('dialog', { name: 'Import into this note' })).toBeInTheDocument();
    });

    test('Import is disabled until something is picked', async () => {
        await renderPicker();

        expect(importButton()).toBeDisabled();

        fireEvent.click(cardOf('Covenant renewal'));

        expect(importButton()).toBeEnabled();
    });

    test('says what is picked, and which kind it is', async () => {
        // "Faith" is a topic and "Covenant renewal" is an idea, and the kind
        // decides which endpoint is written — so the bar names it rather than
        // leaving the reader to read it off a card's colour.
        await renderPicker();

        fireEvent.click(cardOf('Covenant renewal'));

        expect(screen.getByRole('status')).toHaveTextContent('idea');
        expect(screen.getByRole('status')).toHaveTextContent('Covenant renewal');
    });

    test('prompts rather than going blank when nothing is picked', async () => {
        await renderPicker();

        expect(screen.getByRole('status')).toHaveTextContent(/pick/i);
    });

    test('the empty prompt names both kinds when both are selectable', async () => {
        await renderPicker({ selectableKinds: ['idea', 'topic'] });

        expect(screen.getByRole('status')).toHaveTextContent('Pick a topic or an idea to import.');
    });

    test('the empty prompt does not invite a topic when only ideas are selectable', async () => {
        // The chapter importer's case: PUT /api/chapter-ideas takes ideaIds
        // and a chapter has no topic membership to write, so the bar must not
        // tell the reader to pick something the dialog will silently refuse.
        await renderPicker({ selectableKinds: ['idea'] });

        expect(screen.getByRole('status')).toHaveTextContent('Pick an idea to import.');
    });

    test('imports the picked idea, and does not close itself', async () => {
        // The caller closes it. Only the caller knows whether the write was
        // attempted, so only the caller can decide the overlay is finished.
        const { onImport, onClose } = await renderPicker();

        fireEvent.click(cardOf('Sabbath'));
        fireEvent.click(importButton());

        expect(onImport).toHaveBeenCalledWith({ kind: 'idea', id: 12 });
        expect(onClose).not.toHaveBeenCalled();
    });

    test('imports the picked topic', async () => {
        const { onImport } = await renderPicker();

        fireEvent.click(cardOf('Faith'));
        fireEvent.click(importButton());

        expect(onImport).toHaveBeenCalledWith({ kind: 'topic', id: 1 });
    });

    test('picking a topic after an idea leaves one pick, not two', async () => {
        const { onImport } = await renderPicker();

        fireEvent.click(cardOf('Covenant renewal'));
        fireEvent.click(cardOf('Faith'));

        expect(cardBoxOf('Covenant renewal')).not.toHaveClass('is-picked');
        expect(cardBoxOf('Faith')).toHaveClass('is-picked');

        fireEvent.click(importButton());
        expect(onImport).toHaveBeenCalledTimes(1);
        expect(onImport).toHaveBeenCalledWith({ kind: 'topic', id: 1 });
    });

    test('a topic is not pickable when only ideas are on offer', async () => {
        // The chapter importer's case: PUT /api/chapter-ideas takes ideaIds
        // and a chapter has no topic membership to write.
        const { onImport } = await renderPicker({ selectableKinds: ['idea'] });

        fireEvent.click(cardOf('Faith'));

        expect(importButton()).toBeDisabled();
        expect(cardBoxOf('Faith')).not.toHaveClass('is-picked');

        // ...and the click still did its other job.
        expect(cardBoxOf('Faith').closest('.thoughts-cluster')).toHaveClass('is-active');
        expect(onImport).not.toHaveBeenCalled();
    });

    test('Cancel closes without importing', async () => {
        const { onImport, onClose } = await renderPicker();

        fireEvent.click(cardOf('Faith'));
        fireEvent.click(cancelButton());

        expect(onClose).toHaveBeenCalled();
        expect(onImport).not.toHaveBeenCalled();
    });

    test('Escape closes without importing', async () => {
        const { onImport, onClose } = await renderPicker();

        fireEvent.click(cardOf('Faith'));
        fireEvent.keyDown(document, { key: 'Escape' });

        expect(onClose).toHaveBeenCalled();
        expect(onImport).not.toHaveBeenCalled();
    });

    test('a note in a fan is never pickable', async () => {
        // Topics carry notes as well as ideas — see buildClusters. A note is
        // not importable into anything, so its card must stay inert.
        //
        // The card is clicked by its BOX rather than by a button, because in
        // this dialog a note has no button to click: TopicIdeaField makes a
        // note's face a control only when that note can bloom into passages,
        // and the picker hands it no `passagesByTopicId` for any note to bloom
        // from. So inertness here is two things, and both are asserted — the
        // face is not a control, and clicking it forms no pick.
        await renderPicker({
            topics: [{ id: 1, name: 'Faith', notes: [{ id: 99, title: 'A note', body: '' }] }],
        });

        expect(cardOf('A note')).toBeNull();

        fireEvent.click(cardBoxOf('A note'));

        expect(importButton()).toBeDisabled();
        expect(cardBoxOf('A note')).not.toHaveClass('is-picked');
    });

    test('the confirm bar is inside the dialog, not floating over the page', async () => {
        await renderPicker();

        const dialog = screen.getByRole('dialog', { name: 'Import into this note' });
        expect(within(dialog).getByRole('button', { name: 'Import' })).toBeInTheDocument();
    });

    test('a failed corpus read is reported, not shown as an empty book', async () => {
        // An empty field and a failed one read identically to TopicIdeaField —
        // both are just nothing on the canvas. A reader whose read failed must
        // be told, or they will conclude the book is empty and go make a
        // duplicate topic. See useImportCorpus's error.
        await renderPicker({ failTopics: true });

        expect(screen.getByRole('alert')).toBeInTheDocument();
        // Not the empty-book prompt, and no cards — the field itself never
        // drew, rather than drawing and finding nothing to show.
        expect(screen.queryByText('Sabbath', { selector: '.thoughts-bubble-title' })).toBeNull();
        expect(importButton()).toBeDisabled();
    });
});
