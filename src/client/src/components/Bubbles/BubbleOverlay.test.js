import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BubbleOverlay from './BubbleOverlay';

// ─── What the shell has to get right ────────────────────────────────────────
//
// The overlay draws nothing of its own, so there is no appearance to test. What
// it owns is the two things a dialog is: a way out, and where the keyboard is.
//
// The way out has three doors and one trap. Escape and a click on the backdrop
// both close; a click on the content must NOT, and that one is the assertion
// worth keeping — the backdrop is an ancestor of everything inside it, so
// without the stopPropagation every click on a bubble would close the dialog
// on its way up. It is the failure that would make the field unusable while
// looking completely fine in a screenshot.
//
// The keyboard half is that focus is inside the overlay while it is open and
// back where it started when it closes. A dialog that leaves focus on the page
// behind is one Tab walks straight out of.

const renderOverlay = (props = {}) => {
    const onClose = jest.fn();

    render(
        <BubbleOverlay label="Pick an idea" onClose={onClose} {...props}>
            <button type="button">A bubble</button>
        </BubbleOverlay>
    );

    return onClose;
};

describe('BubbleOverlay', () => {
    test('names itself as a modal dialog', () => {
        renderOverlay();

        const dialog = screen.getByRole('dialog', { name: 'Pick an idea' });

        expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    test('draws its children', () => {
        renderOverlay();

        expect(screen.getByRole('button', { name: 'A bubble' })).toBeInTheDocument();
    });

    test('Escape closes it', () => {
        const onClose = renderOverlay();

        fireEvent.keyDown(document, { key: 'Escape' });

        expect(onClose).toHaveBeenCalled();
    });

    test('a click on the backdrop closes it', () => {
        const onClose = renderOverlay();

        fireEvent.click(screen.getByRole('presentation'));

        expect(onClose).toHaveBeenCalled();
    });

    test('a click inside does not close it', () => {
        const onClose = renderOverlay();

        fireEvent.click(screen.getByRole('button', { name: 'A bubble' }));
        fireEvent.click(screen.getByRole('dialog'));

        expect(onClose).not.toHaveBeenCalled();
    });

    test('moves focus into the overlay when it opens', () => {
        renderOverlay();

        expect(screen.getByRole('dialog')).toHaveFocus();
    });
});

// Opening and closing for real, because "focus goes back" is a fact about the
// unmount and a test that only ever mounts cannot see it.
const Harness = () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button type="button" onClick={() => setIsOpen(true)}>Open</button>
            {isOpen && (
                <BubbleOverlay label="Pick an idea" onClose={() => setIsOpen(false)}>
                    <button type="button">A bubble</button>
                </BubbleOverlay>
            )}
        </>
    );
};

describe('closing the overlay', () => {
    test('returns focus to whatever opened it', () => {
        render(<Harness />);

        const opener = screen.getByRole('button', { name: 'Open' });
        opener.focus();
        fireEvent.click(opener);

        expect(screen.getByRole('dialog')).toHaveFocus();

        fireEvent.keyDown(document, { key: 'Escape' });

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(opener).toHaveFocus();
    });
});
