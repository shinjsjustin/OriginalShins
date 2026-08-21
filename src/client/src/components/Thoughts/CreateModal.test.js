import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import CreateModal, { CREATE_FORMS } from './CreateModal';

// ─── What the modal has to get right ────────────────────────────────────────
//
// It carries the fields the two Library forms carried, and one of those fields
// has behaviour: a topic's slug follows the name as you type until the reader
// touches it, after which it is theirs. That rule was worth a comment in the
// old form because a slug can end up in a URL, and it is the only reason this
// component is more than a list of inputs.
//
// The rest is the dismissal contract every modal on this site keeps — Escape,
// the backdrop, a close button — plus the one thing that is specific to
// creating: a submit that failed leaves the modal open with the typing still
// in it, because the page's banner is what explains the failure and closing
// over it would throw the words away.

const setup = ({ kind = 'topic', ...overrides } = {}) => {
    const handlers = {
        onCreate: jest.fn().mockResolvedValue({ id: 1 }),
        onClose: jest.fn(),
        ...overrides,
    };

    render(<CreateModal kind={kind} {...handlers} />);
    return handlers;
};

const type = (label, value) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

const submit = async (name) => {
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name }));
    });
};

describe('the topic form', () => {
    test('carries name, slug and description', () => {
        setup({ kind: 'topic' });

        expect(screen.getByLabelText('Name')).toBeInTheDocument();
        expect(screen.getByLabelText('Slug')).toBeInTheDocument();
        expect(screen.getByLabelText('Description')).toBeInTheDocument();
    });

    test('follows the name with a slug until the slug is edited', () => {
        setup({ kind: 'topic' });

        type('Name', 'Faith & Works');
        expect(screen.getByLabelText('Slug')).toHaveValue('faith-works');

        type('Slug', 'faith');
        type('Name', 'Faith & Works Revisited');
        expect(screen.getByLabelText('Slug')).toHaveValue('faith');
    });

    test('sends the three fields as the old form did', async () => {
        const { onCreate } = setup({ kind: 'topic' });

        type('Name', 'Providence');
        type('Description', 'How God governs.');
        await submit(CREATE_FORMS.topic.submitLabel);

        expect(onCreate).toHaveBeenCalledWith({
            name: 'Providence',
            slug: 'providence',
            description: 'How God governs.',
        });
    });
});

describe('the idea form', () => {
    test('carries a title and a markdown body, and no slug', () => {
        setup({ kind: 'idea' });

        expect(screen.getByLabelText('Title')).toBeInTheDocument();
        expect(screen.getByLabelText('Body (markdown)')).toBeInTheDocument();
        expect(screen.queryByLabelText('Slug')).not.toBeInTheDocument();
    });

    test('sends title and body', async () => {
        const { onCreate } = setup({ kind: 'idea' });

        type('Title', 'Covenant renewal');
        type('Body (markdown)', 'Joshua 24.');
        await submit(CREATE_FORMS.idea.submitLabel);

        expect(onCreate).toHaveBeenCalledWith({
            title: 'Covenant renewal',
            body: 'Joshua 24.',
        });
    });
});

describe('closing', () => {
    test('closes once the item is created', async () => {
        const { onClose } = setup({ kind: 'topic' });

        type('Name', 'Providence');
        await submit(CREATE_FORMS.topic.submitLabel);

        expect(onClose).toHaveBeenCalled();
    });

    test('stays open with the typing when the create fails', async () => {
        const { onClose } = setup({ kind: 'topic', onCreate: jest.fn().mockResolvedValue(null) });

        type('Name', 'Providence');
        await submit(CREATE_FORMS.topic.submitLabel);

        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByLabelText('Name')).toHaveValue('Providence');
    });

    test('closes on Escape, on the backdrop and on the close button', () => {
        const { onClose } = setup({ kind: 'topic' });
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('presentation'));
        expect(onClose).toHaveBeenCalledTimes(2);

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledTimes(3);
    });

    test('a click inside the dialog is not a click on the backdrop', () => {
        const { onClose } = setup({ kind: 'topic' });

        fireEvent.click(screen.getByRole('dialog'));

        expect(onClose).not.toHaveBeenCalled();
    });
});
