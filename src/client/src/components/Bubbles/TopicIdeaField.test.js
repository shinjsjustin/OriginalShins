import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TopicIdeaField, { UNFILED_TITLE, buildClusters, clusterMembers } from './TopicIdeaField';
import useThoughtsView from '../Thoughts/useThoughtsView';
import { UNTITLED_NOTE_LABEL } from '../Thoughts/IdeaOrbit';

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
