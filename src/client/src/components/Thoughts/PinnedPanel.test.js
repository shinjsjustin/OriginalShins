import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import PinnedPanel, { CLEAR_QUESTION, EMPTY_MESSAGE } from './PinnedPanel';
import { LINK_HINTS } from './linkRules';

// ─── What the panel has to get right ────────────────────────────────────────
//
// Four things, and the first three are the reasons this panel exists at all.
//
// The first is that a selection is worth something: checking rows has to put
// the two actions in front of the reader, and Unpin has to act on exactly the
// rows that are checked — by checkbox or by row click, which are the same
// selection made two ways.
//
// The second is that Link obeys linkRules and nothing else. The truth table
// itself is tested as a function in linkRules.test.js, so what is asserted here
// is the wiring: a single-tier selection leaves the button disabled and puts
// linkRules' OWN sentence under it, an adjacent pair enables it, and the click
// hands on the pairs linkRules built rather than a list this component
// re-derived. A component that counted tiers for itself would pass a truth
// table test and still be able to drift from it.
//
// The third is the page's structural rule: editing requires pinning. That is
// true by construction — the form only exists inside a pinned row — so the test
// for it is that there is no input anywhere in the panel until a row's pencil
// is pressed, and that the pencil is not even mounted until the row is hovered.
//
// The fourth is that Clear asks first. It unpins everything at once and there
// is no undo on this page, so a single click must not be able to do it.

const pinOf = (itemType, itemId, title) => ({
    itemType,
    itemId,
    title,
    createdAt: '2026-08-20T10:00:00.000Z',
});

const TOPIC = pinOf('topic', 1, 'Faith');
const IDEA = pinOf('idea', 2, 'Covenant renewal');
const NOTE = pinOf('note', 3, 'In the beginning');

const PINS = [TOPIC, IDEA, NOTE];

const TOPIC_DETAIL = { id: 1, name: 'Faith', description: 'What is hoped for.' };

const ok = (body) => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
});

// The panel is handed the page's writes; every test gets its own set so that
// "was this called" is a question about one render.
const handlersFor = (overrides) => ({
    onUnpin: jest.fn().mockResolvedValue(true),
    onClear: jest.fn(),
    onLink: jest.fn().mockResolvedValue(1),
    onSave: jest.fn().mockResolvedValue({ id: 1 }),
    onDelete: jest.fn().mockResolvedValue(true),
    ...overrides,
});

const renderPanel = ({ pins = PINS, ...overrides } = {}) => {
    const handlers = handlersFor(overrides);
    render(<PinnedPanel pins={pins} {...handlers} />);
    return handlers;
};

// Selecting by checkbox, which is one of the two ways the spec asks for.
const check = (title) =>
    fireEvent.click(screen.getByRole('checkbox', { name: `Select ${title}` }));

// The other way: the row itself, aimed at its title the way a reader aims at it.
const clickRow = (title) => fireEvent.click(screen.getByText(title));

// What a reader does to reveal a row's pencil. React synthesises the row's
// mouseenter from a mouseover on anything inside it.
const hoverRow = (title) => fireEvent.mouseOver(screen.getByText(title));

const clickButton = async (name) => {
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name }));
    });
};

beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    global.fetch = jest.fn(() => ok({ topic: TOPIC_DETAIL }));
});

afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
});

describe('the panel with nothing selected', () => {
    test('lists every pin with its tier, and offers no actions yet', () => {
        // Arrange / Act
        renderPanel();

        // Assert
        expect(screen.getByRole('heading', { name: 'Pinned (3)' })).toBeInTheDocument();
        expect(screen.getByText('TOPIC')).toBeInTheDocument();
        expect(screen.getByText('IDEA')).toBeInTheDocument();
        expect(screen.getByText('NOTE')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Unpin' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Link' })).not.toBeInTheDocument();
    });

    test('says what the panel is for when nothing is pinned', () => {
        // Arrange / Act
        renderPanel({ pins: [] });

        // Assert
        expect(screen.getByText(EMPTY_MESSAGE)).toBeInTheDocument();
    });
});

describe('selection', () => {
    test('a checked row enables Unpin, which acts on exactly that row', async () => {
        // Arrange
        const { onUnpin } = renderPanel();

        // Act
        check(IDEA.title);

        // Assert
        const unpin = screen.getByRole('button', { name: 'Unpin' });
        expect(unpin).toBeEnabled();
        expect(screen.getByText('1 selected')).toBeInTheDocument();

        await clickButton('Unpin');
        expect(onUnpin).toHaveBeenCalledWith([IDEA]);
    });

    test('clicking the row selects it too', () => {
        // Arrange
        renderPanel();

        // Act
        clickRow(NOTE.title);

        // Assert
        expect(screen.getByRole('checkbox', { name: `Select ${NOTE.title}` })).toBeChecked();
        expect(screen.getByRole('button', { name: 'Unpin' })).toBeEnabled();
    });

    test('Clear selection puts the actions away without unpinning anything', () => {
        // Arrange
        const { onUnpin } = renderPanel();
        check(TOPIC.title);

        // Act
        fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));

        // Assert
        expect(screen.queryByRole('button', { name: 'Unpin' })).not.toBeInTheDocument();
        expect(onUnpin).not.toHaveBeenCalled();
    });
});

describe('Link, which answers to linkRules and to nothing else', () => {
    test('is refused for a selection that sits in one tier, and says why', () => {
        // Arrange
        renderPanel();

        // Act
        check(IDEA.title);

        // Assert
        expect(screen.getByRole('button', { name: 'Link' })).toBeDisabled();
        expect(screen.getByText(LINK_HINTS.ideaOnly)).toBeInTheDocument();
    });

    test('is refused for two tiers that are not adjacent', () => {
        // Arrange
        renderPanel();

        // Act
        check(NOTE.title);
        check(TOPIC.title);

        // Assert
        expect(screen.getByRole('button', { name: 'Link' })).toBeDisabled();
        expect(screen.getByText(LINK_HINTS.nonAdjacent)).toBeInTheDocument();
    });

    test('is allowed for a note and an idea, and sends linkRules pairs', async () => {
        // Arrange
        const { onLink } = renderPanel();

        // Act
        check(NOTE.title);
        check(IDEA.title);

        // Assert
        const link = screen.getByRole('button', { name: 'Link' });
        expect(link).toBeEnabled();
        expect(screen.queryByText(LINK_HINTS.noteOnly)).not.toBeInTheDocument();

        await clickButton('Link');
        expect(onLink).toHaveBeenCalledWith([[
            { itemType: 'idea', itemId: IDEA.itemId },
            { itemType: 'note', itemId: NOTE.itemId },
        ]]);
    });

    test('holds the selection when the write fails, so it can be tried again', async () => {
        // Arrange
        const { onLink } = renderPanel({ onLink: jest.fn().mockResolvedValue(null) });

        // Act
        check(NOTE.title);
        check(IDEA.title);
        await clickButton('Link');

        // Assert
        expect(onLink).toHaveBeenCalled();
        expect(screen.getByText('2 selected')).toBeInTheDocument();
    });
});

describe('the edit form, which is the page one editing surface', () => {
    test('is not reachable until a pinned row hands it over', async () => {
        // Arrange
        renderPanel();

        // Assert — nothing to type in, and no pencil to press
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: `Edit ${TOPIC.title}` }))
            .not.toBeInTheDocument();

        // Act — the pencil appears on the row under the cursor
        hoverRow(TOPIC.title);

        // Assert
        expect(screen.getByRole('button', { name: `Edit ${TOPIC.title}` }))
            .toBeInTheDocument();

        // Act
        await clickButton(`Edit ${TOPIC.title}`);

        // Assert — a topic edits its name and its description
        expect(screen.getByLabelText('Name')).toHaveValue(TOPIC_DETAIL.name);
        expect(screen.getByLabelText('Description')).toHaveValue(TOPIC_DETAIL.description);
    });

    test('has no pencil at all when nothing is pinned', () => {
        // Arrange / Act
        renderPanel({ pins: [] });

        // Assert
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
    });

    test('saves only what was changed, and closes', async () => {
        // Arrange
        const { onSave } = renderPanel();
        hoverRow(TOPIC.title);
        await clickButton(`Edit ${TOPIC.title}`);

        // Act
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Faithfulness' } });
        await clickButton('Save');

        // Assert
        expect(onSave).toHaveBeenCalledWith(TOPIC, { name: 'Faithfulness' });
        expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    });

    test('asks before it deletes', async () => {
        // Arrange
        const { onDelete } = renderPanel();
        hoverRow(TOPIC.title);
        await clickButton(`Edit ${TOPIC.title}`);

        // Act
        await clickButton('Delete');

        // Assert — the question, not the deletion
        expect(onDelete).not.toHaveBeenCalled();
        expect(screen.getByText('Delete this topic?')).toBeInTheDocument();

        // Act
        await clickButton('Delete topic');

        // Assert
        expect(onDelete).toHaveBeenCalledWith(TOPIC);
    });

    test('Cancel closes it without writing anything', async () => {
        // Arrange
        const { onSave } = renderPanel();
        hoverRow(TOPIC.title);
        await clickButton(`Edit ${TOPIC.title}`);

        // Act
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Something else' } });
        await clickButton('Cancel');

        // Assert
        expect(onSave).not.toHaveBeenCalled();
        expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    });
});

describe('Clear', () => {
    test('asks for confirmation before unpinning everything', async () => {
        // Arrange
        const { onClear } = renderPanel();

        // Act
        await clickButton('Clear');

        // Assert — the question stands in for the button
        expect(onClear).not.toHaveBeenCalled();
        expect(screen.getByText(CLEAR_QUESTION)).toBeInTheDocument();

        // Act
        await clickButton('Unpin all');

        // Assert
        expect(onClear).toHaveBeenCalledTimes(1);
    });

    test('cancelling puts the button back and clears nothing', async () => {
        // Arrange
        const { onClear } = renderPanel();

        // Act
        await clickButton('Clear');
        await clickButton('Cancel');

        // Assert
        expect(onClear).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    });

    test('is not offered when there is nothing to clear', () => {
        // Arrange / Act
        renderPanel({ pins: [] });

        // Assert
        expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
    });
});

describe('the collapse', () => {
    test('leaves a spine that brings the panel back', () => {
        // Arrange
        renderPanel();

        // Act
        fireEvent.click(screen.getByRole('button', { name: 'Hide Pinned' }));

        // Assert — the list is gone; the spine still names the panel and counts
        expect(screen.queryByRole('heading', { name: 'Pinned (3)' })).not.toBeInTheDocument();
        const spine = screen.getByRole('button', { name: 'Show Pinned' });
        expect(within(spine).getByText('3')).toBeInTheDocument();

        // Act
        fireEvent.click(spine);

        // Assert
        expect(screen.getByRole('heading', { name: 'Pinned (3)' })).toBeInTheDocument();
    });
});
