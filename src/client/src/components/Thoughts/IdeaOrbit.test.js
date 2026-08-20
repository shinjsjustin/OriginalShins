import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import IdeaOrbit, {
    IDEA_CARD,
    NO_NOTES_MESSAGE,
    ORBIT_EXIT_MS,
    UNTITLED_NOTE_LABEL,
} from './IdeaOrbit';
import { NOTE_CARD, ORBIT_CENTRE_CLEARANCE } from './orbitLayout';

// ─── What the idea view has to get right ────────────────────────────────────
//
// Where the note cards land is orbitLayout's job and is tested as a function,
// so nothing below asserts a coordinate. What is checked here is the things the
// ring cannot tell you about itself.
//
// The first is that the centred idea's body is MARKDOWN, run through the app's
// one sanitised renderer. A card that printed `**said**` verbatim would look
// almost right, and a second renderer written for this view would be the exact
// duplication the spec forbids — so the assertions are on the elements marked
// up out of the source, not on its text.
//
// The second is the pin, on a note card, which is the tier the topics field
// never draws. The spec asks for the same toggle on every card, and "same"
// means it is absent until the card is hovered rather than merely invisible.
//
// The third is that this view outlives the idea it draws. Leaving is a change
// to a prop, and a component that rendered straight from that prop would
// vanish instead of closing — so the test takes the idea away and looks for
// the card still being there, then gone once its exit has had its time.

const IDEA = {
    id: 7,
    title: 'Covenant renewal',
    body: 'And God **said**.\n\n- light\n- darkness\n\n[the plan](https://example.test/plan)',
};

const noteOf = (id) => ({ id, title: `Note ${id}`, body: `Body of note ${id}` });

const renderOrbit = (props = {}) => render(
    <IdeaOrbit
        idea={IDEA}
        notes={[noteOf(1), noteOf(2)]}
        isPinned={() => false}
        onTogglePin={() => {}}
        {...props}
    />
);

// What a reader does to reveal a card's pin: put the cursor on the card. Aimed
// at a line of the card's own text, because that is what a reader aims at —
// React synthesises the card's mouseenter from it.
const hoverCardShowing = (text) => fireEvent.mouseOver(screen.getByText(text));

describe('the centred idea', () => {
    test('shows its title and its body as rendered markdown', () => {
        renderOrbit();

        expect(screen.getByText(IDEA.title)).toBeInTheDocument();
        expect(screen.getByText('said').tagName).toBe('STRONG');
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
        expect(screen.getByRole('link', { name: 'the plan' }))
            .toHaveAttribute('href', 'https://example.test/plan');
    });

    test('carries the pin every other card carries', () => {
        const onTogglePin = jest.fn();
        renderOrbit({ onTogglePin });

        hoverCardShowing(IDEA.title);
        fireEvent.click(screen.getByRole('button', { name: `Pin ${IDEA.title}` }));

        expect(onTogglePin).toHaveBeenCalledWith('idea', IDEA.id, IDEA.title);
    });

    test('says so when the idea has no notes yet', () => {
        renderOrbit({ notes: [] });

        expect(screen.getByText(NO_NOTES_MESSAGE)).toBeInTheDocument();
    });
});

describe('the ring', () => {
    test('draws a card per note, title over body', () => {
        renderOrbit();

        expect(screen.getByText('Note 1')).toBeInTheDocument();
        expect(screen.getByText('Body of note 1')).toBeInTheDocument();
        expect(screen.getByText('Note 2')).toBeInTheDocument();
    });

    // Which ring each card lands on is orbitLayout's arithmetic; what this view
    // owes the reader is that the overflow is drawn at all rather than dropped.
    test('draws every note past the split threshold too', () => {
        const notes = Array.from({ length: 14 }, (unused, index) => noteOf(index + 1));
        renderOrbit({ notes });

        expect(screen.getAllByText(/^Note \d+$/)).toHaveLength(14);
        expect(screen.getByText('Note 14')).toBeInTheDocument();
    });

    test('names an untitled note rather than pinning nothing', () => {
        const onTogglePin = jest.fn();
        const untitled = { id: 9, title: '', body: 'A note nobody titled' };
        renderOrbit({ notes: [untitled], onTogglePin });

        hoverCardShowing(untitled.body);
        fireEvent.click(screen.getByRole('button', { name: `Pin ${UNTITLED_NOTE_LABEL}` }));

        expect(onTogglePin).toHaveBeenCalledWith('note', 9, UNTITLED_NOTE_LABEL);
    });

    test('shows a note pin only once the card is hovered', () => {
        renderOrbit({ onTogglePin: jest.fn() });

        expect(screen.queryByRole('button', { name: 'Pin Note 1' })).not.toBeInTheDocument();

        hoverCardShowing('Note 1');

        expect(screen.getByRole('button', { name: 'Pin Note 1' })).toBeInTheDocument();
    });

    test('keeps a pinned note marked without a hover', () => {
        renderOrbit({ isPinned: (type, id) => type === 'note' && id === 1, onTogglePin: jest.fn() });

        expect(screen.getByRole('button', { name: 'Unpin Note 1' })).toBeInTheDocument();
    });
});

describe('leaving the view', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('holds the idea on screen while the reverse animation plays, then drops it', () => {
        const { container, rerender } = renderOrbit();

        rerender(<IdeaOrbit idea={null} notes={[]} />);

        // Still drawn, and marked as leaving. The mark is a class rather than
        // anything a reader can see or hear — the animation is the
        // stylesheet's, and this is the only handle on whether the view is
        // playing it or has simply frozen on its way out.
        // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
        expect(container.querySelector('.thoughts-orbit')).toHaveClass('is-closing');
        expect(screen.getByText(IDEA.title)).toBeInTheDocument();
        expect(screen.getByText('Note 1')).toBeInTheDocument();

        act(() => { jest.advanceTimersByTime(ORBIT_EXIT_MS); });

        expect(screen.queryByText(IDEA.title)).not.toBeInTheDocument();
    });

    test('draws nothing at all in the topics view', () => {
        render(<IdeaOrbit idea={null} notes={[]} />);

        expect(screen.queryByText(IDEA.title)).not.toBeInTheDocument();
        expect(screen.queryByText(NO_NOTES_MESSAGE)).not.toBeInTheDocument();
    });
});

// The centred card and the ring are two halves of one arrangement, and the
// number that joins them lives in orbitLayout. A card larger than the clearance
// that function keeps free would sit on top of the second ring — which is the
// ring the reader reached this view to see — so the relationship is asserted
// rather than left to whoever next adjusts either constant.
describe('the centre card and the clearance the ring keeps for it', () => {
    test('fits inside ORBIT_CENTRE_CLEARANCE, corners included', () => {
        const halfDiagonal = Math.sqrt(IDEA_CARD.width ** 2 + IDEA_CARD.height ** 2) / 2;

        expect(halfDiagonal).toBeLessThanOrEqual(ORBIT_CENTRE_CLEARANCE);
    });

    test('is still much the largest card on the canvas', () => {
        expect(IDEA_CARD.width * IDEA_CARD.height)
            .toBeGreaterThan(2 * NOTE_CARD.width * NOTE_CARD.height);
    });
});
