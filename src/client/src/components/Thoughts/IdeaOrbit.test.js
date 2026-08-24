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

const noteOf = (id, passages = []) => ({
    id,
    title: `Note ${id}`,
    body: `Body of note ${id}`,
    passages,
});

// One anchor with the scripture behind it, shaped as GET /api/ideas/:id/passages
// ships it. The verse text is what the card has to print; the label above it is
// assembled from the four fields around it.
const passageOf = (id, noteId, text) => ({
    id,
    noteId,
    bookId: 1,
    bookName: 'Genesis',
    chapter: 1,
    startVerse: 3,
    endVerse: 4,
    startIndex: 2,
    endIndex: 3,
    sortOrder: 0,
    verses: [
        { verse: 3, verseIndex: 2, text },
        { verse: 4, verseIndex: 3, text: 'God saw the light, and saw that it was good.' },
    ],
});

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

/* eslint-disable testing-library/no-node-access */

/** The card a line of text sits on — the element the spotlight classes land on. */
const cardAround = (text) => screen.getByText(text).closest('.thoughts-bubble');

/** The hover region a card sits in: the thing that opens and closes. */
const clusterAround = (text) => screen.getByText(text).closest('.thoughts-cluster');

/* eslint-enable testing-library/no-node-access */

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

// ─── The passages a note is anchored to ─────────────────────────────────────
//
// A note card carries WHERE it is anchored and the page shows scripture
// nowhere else, so the passage has to be reachable from the ring or the anchor
// is a fact the reader can never read. It is reached the way an idea is reached
// from a topic — hover, then click to hold it open — and the tests below are
// about that being true rather than about where the cards land, which is
// fanLayout's arithmetic and is tested as a function.
//
// The assertions are on presence and absence rather than on opacity, for the
// reason the pin's are: a closed fan is hidden with `visibility`, so a petal
// that were merely transparent would still be a tab stop and would still be
// read out — every passage of every note on the ring, at once.
describe('a note and its passages', () => {
    const PASSAGE_TEXT = 'God said, “Let there be light,” and there was light.';

    const renderAnchoredOrbit = (props = {}) => renderOrbit({
        notes: [noteOf(1, [passageOf(51, 1, PASSAGE_TEXT)]), noteOf(2)],
        ...props,
    });

    test('draws the reference and its verses', () => {
        renderAnchoredOrbit();

        expect(screen.getByText('Genesis 1:3–4')).toBeInTheDocument();
        expect(screen.getByText(PASSAGE_TEXT, { exact: false })).toBeInTheDocument();
    });

    test('opens the passages when the note is hovered, and closes them again', () => {
        renderAnchoredOrbit();

        expect(clusterAround('Note 1')).not.toHaveClass('is-active');

        fireEvent.mouseOver(screen.getByText('Note 1'));
        expect(clusterAround('Note 1')).toHaveClass('is-active');

        fireEvent.mouseOut(screen.getByText('Note 1'));
        expect(clusterAround('Note 1')).not.toHaveClass('is-active');
    });

    // The whole reason the lock exists: the petals sit far enough out that the
    // cursor's trip to one crosses other cards, and a fan that closed on the
    // way would be a passage nobody can reach.
    test('sticks them open on a click, and lets go on a second one', () => {
        renderAnchoredOrbit();

        fireEvent.click(screen.getByRole('button', { name: /^Note 1/ }));
        fireEvent.mouseOut(screen.getByText('Note 1'));

        expect(clusterAround('Note 1')).toHaveClass('is-active');

        fireEvent.click(screen.getByRole('button', { name: /^Note 1/ }));

        expect(clusterAround('Note 1')).not.toHaveClass('is-active');
    });

    test('lets Esc go of a stuck fan', () => {
        renderAnchoredOrbit();

        fireEvent.click(screen.getByRole('button', { name: /^Note 1/ }));
        fireEvent.mouseOut(screen.getByText('Note 1'));
        fireEvent.keyDown(window, { key: 'Escape' });

        expect(clusterAround('Note 1')).not.toHaveClass('is-active');
    });

    // The background dimming the spotlight is made of: everything that is not
    // the note being read recedes, the centred idea included — it is the card
    // the fan opens over, so leaving it lit would leave the passages competing
    // with the largest thing on the canvas.
    test('fades the rest of the ring, and the idea at its centre', () => {
        renderAnchoredOrbit();

        fireEvent.mouseOver(screen.getByText('Note 1'));

        expect(cardAround('Note 1')).not.toHaveClass('is-faded');
        expect(cardAround('Note 2')).toHaveClass('is-faded');
        expect(cardAround(IDEA.title)).toHaveClass('is-faded');
    });

    test('leaves a note with no anchors unclickable, and fades nothing', () => {
        renderAnchoredOrbit();

        expect(screen.queryByRole('button', { name: /^Note 2/ })).not.toBeInTheDocument();

        fireEvent.mouseOver(screen.getByText('Note 2'));

        expect(cardAround('Note 1')).not.toHaveClass('is-faded');
        expect(cardAround(IDEA.title)).not.toHaveClass('is-faded');
    });

    test('prints a book it cannot name by its id rather than blankly', () => {
        const nameless = { ...passageOf(52, 1, PASSAGE_TEXT), bookName: null };
        renderAnchoredOrbit({ notes: [noteOf(1, [nameless])] });

        expect(screen.getByText('Book 1 1:3–4')).toBeInTheDocument();
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
