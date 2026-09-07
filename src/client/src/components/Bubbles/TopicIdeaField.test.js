import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TopicIdeaField, { UNFILED_TITLE, buildClusters, clusterMembers } from './TopicIdeaField';
import BubbleCard from './BubbleCard';
import useThoughtsView from '../Thoughts/useThoughtsView';
import { UNTITLED_NOTE_LABEL } from '../Thoughts/IdeaOrbit';

const BOX = { x: 0, y: 0, width: 100, height: 60 };

// ─── What the field has to get right ────────────────────────────────────────
//
// Two of this canvas's behaviours are invisible to the layout unit tests and
// cannot be checked by looking at it, so they are checked here.
//
// The first is the pin. The spec asks for a toggle that is not there until the
// card is hovered, and "not there" is the part worth a test: a pin faded to
// zero opacity would still be a tab stop and would still be read out, on every
// card on the canvas at once. The assertion is therefore that it is absent
// before the hover and present after it — which a CSS-only implementation
// could not pass.
//
// The second is that a fanned idea card is a way INTO the idea view. The fan
// is the only route to an idea on this page, so the click has to move the view
// rather than merely call a prop: the test drives the real useThoughtsView
// through a real router and reads the view back out, so a handler wired to the
// wrong hook, or to nothing, fails here.
//
// Everything about WHERE the cards land belongs to fieldLayout and fanLayout,
// which are tested as functions. Nothing below asserts a coordinate.

const TOPICS = [
    { id: 1, name: 'Faith', ideaCount: 1 },
    { id: 2, name: 'Law', ideaCount: 1 },
];

const IDEAS = [
    { id: 11, title: 'Covenant renewal', topics: [{ id: 1, name: 'Faith' }] },
    { id: 12, title: 'Sabbath', topics: [{ id: 2, name: 'Law' }] },
];

const topicCard = (name) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

/** The cluster element a topic's card sits in — the thing that opens and closes. */
const clusterOf = (name) => topicCard(name).closest('.thoughts-cluster');

const isOpen = (name) => clusterOf(name).classList.contains('is-active');

/** What a reader does to open a topic: put the cursor anywhere on its cluster. */
const hoverTopic = (name) => fireEvent.mouseOver(topicCard(name));

const unhoverTopic = (name) => fireEvent.mouseOut(clusterOf(name));

const clickTopic = (name) => fireEvent.click(topicCard(name));

describe('buildClusters', () => {
    test('gives every topic the ideas filed under it', () => {
        const clusters = buildClusters(TOPICS, IDEAS);

        expect(clusters.map(cluster => cluster.title)).toEqual(['Faith', 'Law']);
        expect(clusters[0].ideas.map(idea => idea.id)).toEqual([11]);
    });

    test('files an idea under each of its several topics', () => {
        const shared = { id: 13, title: 'Both', topics: [{ id: 1 }, { id: 2 }] };
        const clusters = buildClusters(TOPICS, [shared]);

        expect(clusters[0].ideas).toEqual([shared]);
        expect(clusters[1].ideas).toEqual([shared]);
    });

    test('adds the unfiled bubble last, and only when it holds something', () => {
        expect(buildClusters(TOPICS, IDEAS)).toHaveLength(2);

        const loose = { id: 14, title: 'Loose thought', topics: [] };
        const clusters = buildClusters(TOPICS, [...IDEAS, loose]);

        expect(clusters).toHaveLength(3);
        expect(clusters[2]).toMatchObject({ kind: 'unfiled', title: UNFILED_TITLE });
        expect(clusters[2].ideas).toEqual([loose]);
    });
});

describe('buildClusters with notes', () => {
    const topicsWithNotes = [
        { id: 1, name: 'Faith', notes: [{ id: 50, title: 'On grace', body: 'b' }] },
        { id: 2, name: 'Works', notes: [] },
    ];
    const ideas = [
        { id: 10, title: 'Grace alone', topics: [{ id: 1 }] },
        { id: 11, title: 'Loose thought', topics: [] },
    ];

    test('a topic carries the notes filed directly under it', () => {
        const [faith] = buildClusters(topicsWithNotes, ideas);

        expect(faith.notes.map(note => note.id)).toEqual([50]);
        expect(faith.ideas.map(idea => idea.id)).toEqual([10]);
    });

    test('a topic with no direct notes carries an empty list, never undefined', () => {
        const [, works] = buildClusters(topicsWithNotes, ideas);

        expect(works.notes).toEqual([]);
    });

    test('a topic row with no notes key at all is tolerated', () => {
        const [faith] = buildClusters([{ id: 1, name: 'Faith' }], []);

        expect(faith.notes).toEqual([]);
    });

    test('the unfiled bubble holds ideas only — notes are never unfiled here', () => {
        const clusters = buildClusters(topicsWithNotes, ideas);
        const unfiled = clusters[clusters.length - 1];

        expect(unfiled).toMatchObject({ kind: 'unfiled' });
        expect(unfiled.ideas.map(idea => idea.id)).toEqual([11]);
        expect(unfiled.notes).toEqual([]);
    });
});

describe('clusterMembers', () => {
    test('puts every idea before every note, so adding a note never moves an idea', () => {
        const cluster = { ideas: [{ id: 10 }, { id: 11 }], notes: [{ id: 50 }] };

        expect(clusterMembers(cluster)).toEqual([
            { kind: 'idea', item: { id: 10 } },
            { kind: 'idea', item: { id: 11 } },
            { kind: 'note', item: { id: 50 } },
        ]);
    });

    test('is empty for a cluster holding neither', () => {
        expect(clusterMembers({ ideas: [], notes: [] })).toEqual([]);
    });
});

describe('TopicIdeaField', () => {
    test('draws a card per topic with its idea count', () => {
        render(<TopicIdeaField topics={TOPICS} ideas={IDEAS} />);

        expect(topicCard('Faith')).toHaveTextContent('1 idea');
        expect(topicCard('Law')).toBeInTheDocument();
    });

    test('draws no unfiled bubble when every idea is filed', () => {
        render(<TopicIdeaField topics={TOPICS} ideas={IDEAS} />);

        expect(screen.queryByText(UNFILED_TITLE)).not.toBeInTheDocument();
    });

    test('draws the unfiled bubble when a loose idea exists', () => {
        const loose = { id: 14, title: 'Loose thought', topics: [] };
        render(<TopicIdeaField topics={TOPICS} ideas={[...IDEAS, loose]} />);

        expect(screen.getByText(UNFILED_TITLE)).toBeInTheDocument();
    });

    test('shows no pin on a topic card until it is hovered', () => {
        render(<TopicIdeaField topics={TOPICS} ideas={IDEAS} onTogglePin={jest.fn()} />);

        expect(screen.queryByRole('button', { name: 'Pin Faith' })).not.toBeInTheDocument();

        hoverTopic('Faith');

        expect(screen.getByRole('button', { name: 'Pin Faith' })).toBeInTheDocument();
    });

    test('draws no pin on any card when the page passes no pin handler', () => {
        render(<TopicIdeaField topics={TOPICS} ideas={IDEAS} />);

        // Hovered and fanned open: every card that could carry a pin is on
        // screen and under the cursor, so an absent pin here is absent for
        // good rather than merely not revealed yet.
        hoverTopic('Faith');

        expect(screen.queryByRole('button', { name: /^(Pin|Unpin) / })).not.toBeInTheDocument();
    });

    test('keeps the pin on a card that is already pinned', () => {
        const isPinned = (itemType, itemId) => itemType === 'topic' && itemId === 1;
        render(<TopicIdeaField topics={TOPICS} ideas={IDEAS} isPinned={isPinned} onTogglePin={jest.fn()} />);

        expect(screen.getByRole('button', { name: 'Unpin Faith' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Pin Law' })).not.toBeInTheDocument();
    });

    test('toggles the pin through usePins with the card it belongs to', () => {
        const onTogglePin = jest.fn();
        render(<TopicIdeaField topics={TOPICS} ideas={IDEAS} onTogglePin={onTogglePin} />);

        hoverTopic('Faith');
        fireEvent.click(screen.getByRole('button', { name: 'Pin Faith' }));

        expect(onTogglePin).toHaveBeenCalledWith('topic', 1, 'Faith');
    });
});

// ─── The lock ───────────────────────────────────────────────────────────────
//
// A fan opens under the cursor and closes when the cursor goes, which is fine
// for reading a topic's ideas and useless for reaching one: the petals sit on
// an arc that overlaps the neighbouring topic cards, so the trip out to the
// far end of the fan crosses cards belonging to other clusters. Clicking the
// topic pins the fan open so that trip can be made, and clicking it again puts
// it away.
//
// The assertion that matters is the second one. An earlier version of this
// cluster also unlocked on hovering another topic, and that undid the whole
// point: the neighbour the cursor crossed on its way to a petal closed the fan
// out from under it, so the locked state was reachable and the petals still
// were not. Only a second click, Esc, or locking a different topic ends it.

describe('locking a topic open', () => {
    beforeEach(() => {
        render(<TopicIdeaField topics={TOPICS} ideas={IDEAS} />);
    });

    test('a hovered fan closes again when the cursor leaves', () => {
        hoverTopic('Faith');
        expect(isOpen('Faith')).toBe(true);

        unhoverTopic('Faith');
        expect(isOpen('Faith')).toBe(false);
    });

    test('clicking a topic holds its fan open after the cursor leaves', () => {
        hoverTopic('Faith');
        clickTopic('Faith');
        unhoverTopic('Faith');

        expect(isOpen('Faith')).toBe(true);
    });

    test('a locked fan survives the cursor crossing another topic', () => {
        hoverTopic('Faith');
        clickTopic('Faith');

        unhoverTopic('Faith');
        hoverTopic('Law');

        expect(isOpen('Faith')).toBe(true);
        expect(isOpen('Law')).toBe(false);
    });

    test('clicking the locked topic again closes its fan', () => {
        hoverTopic('Faith');
        clickTopic('Faith');
        clickTopic('Faith');
        unhoverTopic('Faith');

        expect(isOpen('Faith')).toBe(false);
    });

    test('clicking a different topic moves the lock to it', () => {
        hoverTopic('Faith');
        clickTopic('Faith');
        clickTopic('Law');
        unhoverTopic('Law');

        expect(isOpen('Law')).toBe(true);
        expect(isOpen('Faith')).toBe(false);
    });

    test('Escape releases the lock', () => {
        hoverTopic('Faith');
        clickTopic('Faith');
        unhoverTopic('Faith');

        fireEvent.keyDown(window, { key: 'Escape' });

        expect(isOpen('Faith')).toBe(false);
    });
});

// The idea view is a query string, so "the view changed" is a fact about the
// URL rather than about a prop. This harness holds the real hook and prints
// what it reads back, which is the only way the assertion can be about the
// thing the reader would actually see.
const ViewHarness = (props) => {
    const { ideaId, showIdea } = useThoughtsView();

    return (
        <>
            <p>view: {ideaId === null ? 'topics' : `idea ${ideaId}`}</p>
            <TopicIdeaField topics={TOPICS} ideas={IDEAS} onSelectIdea={showIdea} {...props} />
        </>
    );
};

describe('opening an idea from the fan', () => {
    const renderHarness = () => render(
        <MemoryRouter initialEntries={['/thoughts']}>
            <ViewHarness />
        </MemoryRouter>
    );

    test('clicking a fanned idea card moves the view to that idea', () => {
        renderHarness();

        expect(screen.getByText(/^view:/)).toHaveTextContent('view: topics');

        hoverTopic('Faith');
        fireEvent.click(screen.getByRole('button', { name: 'Covenant renewal' }));

        expect(screen.getByText(/^view:/)).toHaveTextContent('view: idea 11');
    });
});

// ─── A note petal's passages ────────────────────────────────────────────────
//
// The bloom is drawn OUTSIDE the cluster it belongs to — a BloomCluster
// positions itself in canvas coordinates and a petal already sits inside its
// parent's offset region, so a nested one would be offset twice. That makes two
// things worth asserting here rather than by eye: that the topic stays open
// while its note is blooming (the cursor has to leave the cluster to reach a
// passage, and without this the fan would shut under it), and that the fetch is
// asked for once, lazily, rather than for every topic on the field.
describe('TopicIdeaField passages', () => {
    const topicsWithNote = [{
        id: 1,
        name: 'Faith',
        notes: [{ id: 50, title: 'On grace', body: 'b' }],
    }];

    const passage = {
        id: 900,
        noteId: 50,
        bookId: 49,
        bookName: 'Ephesians',
        chapter: 2,
        startVerse: 8,
        endVerse: 9,
        verses: [{ verseIndex: 1, verse: 8, text: 'For by grace you have been saved' }],
    };

    const renderWithPassages = (props = {}) => render(
        <MemoryRouter>
            <TopicIdeaField topics={topicsWithNote} ideas={[]} {...props} />
        </MemoryRouter>
    );

    const noteFace = () => screen.getByText('On grace').closest('.thoughts-bubble')
        .querySelector('.thoughts-bubble-face');

    test('asks for a topic\'s passages when its fan opens', () => {
        // Arrange
        const onTopicOpen = jest.fn();
        renderWithPassages({ onTopicOpen });

        // Act
        fireEvent.mouseOver(topicCard('Faith'));

        // Assert
        expect(onTopicOpen).toHaveBeenCalledWith(1);
    });

    test('does not ask for anything before a fan is opened', () => {
        const onTopicOpen = jest.fn();
        renderWithPassages({ onTopicOpen });

        expect(onTopicOpen).not.toHaveBeenCalled();
    });

    test('draws no passage until its note is opened', () => {
        renderWithPassages({ passagesByTopicId: { 1: [passage] } });

        // The passages are loaded, but the bloom is a deliberate act.
        expect(screen.queryByText(/Ephesians/)).not.toBeInTheDocument();
    });

    test('blooms the note into its passages when the note is opened', () => {
        // Arrange
        renderWithPassages({ passagesByTopicId: { 1: [passage] } });

        // Act
        fireEvent.click(noteFace());

        // Assert
        expect(screen.getByText('Ephesians 2:8–9')).toBeInTheDocument();
        expect(screen.getByText(/For by grace/)).toBeInTheDocument();
    });

    test('keeps the topic open while its note is blooming', () => {
        // Arrange — open the fan, bloom the note, then take the cursor off the
        // topic, which is what reaching a passage card actually does.
        renderWithPassages({ passagesByTopicId: { 1: [passage] } });
        fireEvent.mouseOver(topicCard('Faith'));
        fireEvent.click(noteFace());

        // Act
        unhoverTopic('Faith');

        // Assert — the fan has not shut, so the passages are still reachable.
        expect(isOpen('Faith')).toBe(true);
        expect(screen.getByText('Ephesians 2:8–9')).toBeInTheDocument();
    });

    test('closes the bloom when the note is opened again', () => {
        renderWithPassages({ passagesByTopicId: { 1: [passage] } });

        fireEvent.click(noteFace());
        fireEvent.click(noteFace());

        expect(screen.queryByText(/Ephesians/)).not.toBeInTheDocument();
    });

    // ── More passages than one arc holds ──────────────────────────────────
    //
    // fanLayout puts everything past `rowCapacity` on a second, wider arc and
    // asks for a `+N more` chip. For a passage card that second arc sits closer
    // to the first than a card is tall, so drawing it immediately lays those
    // cards over the ones already there. The idea fan has never had that
    // problem visibly because BloomCluster stows its row-1 cards under the chip
    // — and the passage fan is drawn OUTSIDE BloomCluster, so it has to stow
    // its own.
    const sixPassages = Array.from({ length: 6 }, (unused, index) => ({
        ...passage,
        id: 900 + index,
        chapter: index + 1,
        startVerse: 1,
        endVerse: 2,
        verses: [{ verseIndex: index, verse: 1, text: `Verse of chapter ${index + 1}` }],
    }));

    const passageCards = () => [...document.querySelectorAll('.thoughts-passage-fan .thoughts-bubble')];

    test('stows the passages past one arc behind a chip', () => {
        // Arrange
        renderWithPassages({ passagesByTopicId: { 1: sixPassages } });

        // Act
        fireEvent.click(noteFace());

        // Assert — every card is placed, but the sixth is stowed rather than
        // drawn on top of the arc, and the chip says how many are behind it.
        expect(passageCards()).toHaveLength(6);
        expect(passageCards().filter(card => card.classList.contains('is-stowed')))
            .toHaveLength(1);
        expect(screen.getByRole('button', { name: '+1 more' })).toBeInTheDocument();
    });

    test('the chip lets the stowed passage out', () => {
        // Arrange
        renderWithPassages({ passagesByTopicId: { 1: sixPassages } });
        fireEvent.click(noteFace());

        // Act
        fireEvent.click(screen.getByRole('button', { name: '+1 more' }));

        // Assert
        expect(passageCards().filter(card => card.classList.contains('is-stowed')))
            .toHaveLength(0);
    });

    test('draws no chip when every passage fits one arc', () => {
        // Arrange / Act
        renderWithPassages({ passagesByTopicId: { 1: [passage] } });
        fireEvent.click(noteFace());

        // Assert
        expect(screen.queryByRole('button', { name: /more$/ })).not.toBeInTheDocument();
    });

    test('a note anchored to nothing is not a control', () => {
        // Arrange — passages loaded for the topic, but none for this note.
        renderWithPassages({ passagesByTopicId: { 1: [] } });

        // Assert — no button, so no click that promises a bloom and gives none.
        expect(noteFace().tagName).toBe('DIV');
    });
});

describe('TopicIdeaField note petals', () => {
    const topicsWithNote = [{
        id: 1,
        name: 'Faith',
        notes: [{ id: 50, title: 'On grace', body: 'and it is not of yourselves' }],
    }];
    const ideasForFaith = [{ id: 10, title: 'Grace alone', topics: [{ id: 1 }] }];

    const renderField = (props = {}) => render(
        <MemoryRouter>
            <TopicIdeaField topics={topicsWithNote} ideas={ideasForFaith} {...props} />
        </MemoryRouter>
    );

    test('draws a card for a directly-linked note beside the topic ideas', () => {
        renderField();

        // Every fan is mounted in its closed state, so both petals exist
        // without hovering — see the note at the top of TopicIdeaField.
        expect(screen.getByText('Grace alone')).toBeInTheDocument();
        expect(screen.getByText('On grace')).toBeInTheDocument();
    });

    test('the subtitle still counts ideas only', () => {
        renderField();

        expect(screen.getByText('1 idea')).toBeInTheDocument();
        // No "1 note" tally anywhere. Matched narrowly so the note's own body
        // cannot satisfy it.
        expect(screen.queryByText(/\d+ notes?\b/)).not.toBeInTheDocument();
    });

    test('a note card is not a way into the idea view', () => {
        renderField();

        fireEvent.click(screen.getByText('On grace'));

        // Still on the topics view: the idea fan is what opens an idea, and a
        // note has no view of its own to open.
        expect(screen.getByText('Grace alone')).toBeInTheDocument();
    });

    test('a note petal pins as a note', () => {
        const onTogglePin = jest.fn();
        renderField({ isPinned: () => false, onTogglePin });

        // The pin is not rendered until the card is hovered.
        fireEvent.mouseOver(screen.getByText('On grace'));
        fireEvent.click(screen.getByRole('button', { name: 'Pin On grace' }));

        expect(onTogglePin).toHaveBeenCalledWith('note', 50, 'On grace');
    });

    test('an untitled note is still pinnable by name', () => {
        const onTogglePin = jest.fn();
        render(
            <MemoryRouter>
                <TopicIdeaField
                    topics={[{ id: 1, name: 'Faith', notes: [{ id: 51, title: '', body: 'nameless' }] }]}
                    ideas={[]}
                    isPinned={() => false}
                    onTogglePin={onTogglePin}
                />
            </MemoryRouter>
        );

        fireEvent.mouseOver(screen.getByText('nameless'));
        fireEvent.click(screen.getByRole('button', { name: `Pin ${UNTITLED_NOTE_LABEL}` }));

        expect(onTogglePin).toHaveBeenCalledWith('note', 51, UNTITLED_NOTE_LABEL);
    });
});

describe('picking from the field', () => {
    const renderField = (props = {}) => render(
        <MemoryRouter>
            <TopicIdeaField topics={TOPICS} ideas={IDEAS} {...props} />
        </MemoryRouter>
    );

    const cardOf = (name) => screen.getByText(name, { selector: '.thoughts-bubble-title' })
        .closest('.thoughts-bubble');

    test('a topic click reports the pick when the caller asked for topic picking', () => {
        const onPickTopic = jest.fn();
        renderField({ onPickTopic });

        clickTopic('Faith');

        expect(onPickTopic).toHaveBeenCalledWith(1);
    });

    test('a topic click still opens the fan while picking it', () => {
        // The two are not rivals: the fan is how the reader reaches the
        // topic's ideas, and looking inside a topic is not evidence against
        // wanting to file under it.
        renderField({ onPickTopic: jest.fn() });

        clickTopic('Faith');

        expect(isOpen('Faith')).toBe(true);
    });

    test('without onPickTopic a topic click only opens the fan', () => {
        // The Thoughts page's behaviour, unchanged.
        renderField();

        clickTopic('Faith');

        expect(isOpen('Faith')).toBe(true);
    });

    test('draws the picked topic as picked, and nothing else', () => {
        renderField({ pick: { kind: 'topic', id: 1 }, onPickTopic: jest.fn() });

        expect(cardOf('Faith')).toHaveClass('is-picked');
        expect(cardOf('Law')).not.toHaveClass('is-picked');
    });

    test('draws the picked idea as picked, and not the topic it sits under', () => {
        renderField({ pick: { kind: 'idea', id: 11 }, onPickTopic: jest.fn() });

        expect(cardOf('Covenant renewal')).toHaveClass('is-picked');
        expect(cardOf('Faith')).not.toHaveClass('is-picked');
    });

    test('an idea and a topic sharing an id are not confused for each other', () => {
        // Topic 11 and idea 11 are different rows in different tables. A pick
        // that carried only an id would light both at once — so the ids here
        // deliberately collide, which is the only arrangement that can catch
        // a `kind` the field forgot to check.
        renderField({
            topics: [...TOPICS, { id: 11, name: 'Remnant', ideaCount: 0 }],
            pick: { kind: 'topic', id: 11 },
            onPickTopic: jest.fn(),
        });

        expect(cardOf('Remnant')).toHaveClass('is-picked');
        expect(cardOf('Covenant renewal')).not.toHaveClass('is-picked');
    });

    test('nothing is picked when pick is null', () => {
        renderField({ pick: null, onPickTopic: jest.fn() });

        expect(document.querySelectorAll('.is-picked')).toHaveLength(0);
    });
});

describe('BubbleCard picked state', () => {
    test('a picked card carries is-picked, and an unpicked one does not', () => {
        const { rerender } = render(
            <BubbleCard title="Faith" position={BOX} onActivate={() => {}} />
        );

        expect(screen.getByRole('button', { name: /Faith/ }).closest('.thoughts-bubble'))
            .not.toHaveClass('is-picked');

        rerender(<BubbleCard title="Faith" position={BOX} isPicked onActivate={() => {}} />);

        expect(screen.getByRole('button', { name: /Faith/ }).closest('.thoughts-bubble'))
            .toHaveClass('is-picked');
    });

    test('picked and selected are independent — a card can be both at once', () => {
        // The importer's common case: the topic you picked is the topic whose
        // fan you opened to pick it.
        render(<BubbleCard title="Faith" position={BOX} isPicked isSelected onActivate={() => {}} />);

        const card = screen.getByRole('button', { name: /Faith/ }).closest('.thoughts-bubble');
        expect(card).toHaveClass('is-picked');
        expect(card).toHaveClass('is-selected');
    });
});
