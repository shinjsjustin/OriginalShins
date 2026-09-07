import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
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

const TOPICS = [
    { id: 1, name: 'Faith' },
    { id: 2, name: 'Law' },
];

const IDEAS = [
    { id: 11, title: 'Covenant renewal', topics: [{ id: 1, name: 'Faith' }] },
    { id: 12, title: 'Sabbath', topics: [{ id: 2, name: 'Law' }] },
];

const renderPicker = (props = {}) => {
    const onImport = jest.fn();
    const onClose = jest.fn();

    render(
        <MemoryRouter>
            <ImportPicker
                label="Import into this note"
                topics={TOPICS}
                ideas={IDEAS}
                selectableKinds={['idea', 'topic']}
                onImport={onImport}
                onClose={onClose}
                {...props}
            />
        </MemoryRouter>
    );

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
    test('is a dialog named by its label', () => {
        renderPicker();

        expect(screen.getByRole('dialog', { name: 'Import into this note' })).toBeInTheDocument();
    });

    test('Import is disabled until something is picked', () => {
        renderPicker();

        expect(importButton()).toBeDisabled();

        fireEvent.click(cardOf('Covenant renewal'));

        expect(importButton()).toBeEnabled();
    });

    test('says what is picked, and which kind it is', () => {
        // "Faith" is a topic and "Covenant renewal" is an idea, and the kind
        // decides which endpoint is written — so the bar names it rather than
        // leaving the reader to read it off a card's colour.
        renderPicker();

        fireEvent.click(cardOf('Covenant renewal'));

        expect(screen.getByRole('status')).toHaveTextContent('idea');
        expect(screen.getByRole('status')).toHaveTextContent('Covenant renewal');
    });

    test('prompts rather than going blank when nothing is picked', () => {
        renderPicker();

        expect(screen.getByRole('status')).toHaveTextContent(/pick/i);
    });

    test('the empty prompt names both kinds when both are selectable', () => {
        renderPicker({ selectableKinds: ['idea', 'topic'] });

        expect(screen.getByRole('status')).toHaveTextContent('Pick a topic or an idea to import.');
    });

    test('the empty prompt does not invite a topic when only ideas are selectable', () => {
        // The chapter importer's case: PUT /api/chapter-ideas takes ideaIds
        // and a chapter has no topic membership to write, so the bar must not
        // tell the reader to pick something the dialog will silently refuse.
        renderPicker({ selectableKinds: ['idea'] });

        expect(screen.getByRole('status')).toHaveTextContent('Pick an idea to import.');
    });

    test('imports the picked idea, and does not close itself', () => {
        // The caller closes it. Only the caller knows whether the write was
        // attempted, so only the caller can decide the overlay is finished.
        const { onImport, onClose } = renderPicker();

        fireEvent.click(cardOf('Sabbath'));
        fireEvent.click(importButton());

        expect(onImport).toHaveBeenCalledWith({ kind: 'idea', id: 12 });
        expect(onClose).not.toHaveBeenCalled();
    });

    test('imports the picked topic', () => {
        const { onImport } = renderPicker();

        fireEvent.click(cardOf('Faith'));
        fireEvent.click(importButton());

        expect(onImport).toHaveBeenCalledWith({ kind: 'topic', id: 1 });
    });

    test('picking a topic after an idea leaves one pick, not two', () => {
        const { onImport } = renderPicker();

        fireEvent.click(cardOf('Covenant renewal'));
        fireEvent.click(cardOf('Faith'));

        expect(cardBoxOf('Covenant renewal')).not.toHaveClass('is-picked');
        expect(cardBoxOf('Faith')).toHaveClass('is-picked');

        fireEvent.click(importButton());
        expect(onImport).toHaveBeenCalledTimes(1);
        expect(onImport).toHaveBeenCalledWith({ kind: 'topic', id: 1 });
    });

    test('a topic is not pickable when only ideas are on offer', () => {
        // The chapter importer's case: PUT /api/chapter-ideas takes ideaIds
        // and a chapter has no topic membership to write.
        const { onImport } = renderPicker({ selectableKinds: ['idea'] });

        fireEvent.click(cardOf('Faith'));

        expect(importButton()).toBeDisabled();
        expect(cardBoxOf('Faith')).not.toHaveClass('is-picked');

        // ...and the click still did its other job.
        expect(cardBoxOf('Faith').closest('.thoughts-cluster')).toHaveClass('is-active');
        expect(onImport).not.toHaveBeenCalled();
    });

    test('Cancel closes without importing', () => {
        const { onImport, onClose } = renderPicker();

        fireEvent.click(cardOf('Faith'));
        fireEvent.click(cancelButton());

        expect(onClose).toHaveBeenCalled();
        expect(onImport).not.toHaveBeenCalled();
    });

    test('Escape closes without importing', () => {
        const { onImport, onClose } = renderPicker();

        fireEvent.click(cardOf('Faith'));
        fireEvent.keyDown(document, { key: 'Escape' });

        expect(onClose).toHaveBeenCalled();
        expect(onImport).not.toHaveBeenCalled();
    });

    test('a note in a fan is never pickable', () => {
        // Topics carry notes as well as ideas — see buildClusters. A note is
        // not importable into anything, so its card must stay inert.
        //
        // The card is clicked by its BOX rather than by a button, because in
        // this dialog a note has no button to click: TopicIdeaField makes a
        // note's face a control only when that note can bloom into passages,
        // and the picker hands it no `passagesByTopicId` for any note to bloom
        // from. So inertness here is two things, and both are asserted — the
        // face is not a control, and clicking it forms no pick.
        renderPicker({
            topics: [{ id: 1, name: 'Faith', notes: [{ id: 99, title: 'A note', body: '' }] }],
        });

        expect(cardOf('A note')).toBeNull();

        fireEvent.click(cardBoxOf('A note'));

        expect(importButton()).toBeDisabled();
        expect(cardBoxOf('A note')).not.toHaveClass('is-picked');
    });

    test('the confirm bar is inside the dialog, not floating over the page', () => {
        renderPicker();

        const dialog = screen.getByRole('dialog', { name: 'Import into this note' });
        expect(within(dialog).getByRole('button', { name: 'Import' })).toBeInTheDocument();
    });
});
