import React, { Profiler } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Overview from './Overview';
import { AXIS, RAILS, RAIL_X, WORLD } from './overviewLayout';
import { CHAPTER_ZOOM_THRESHOLD, MIN_SCALE } from './viewport';
import { SEARCH_DEBOUNCE_MS } from './OverviewSearch';
import { MIN_REGION_SPAN } from './useZoomRegion';

// buildArcs is the most expensive thing this page computes — every chain on
// every rail — and the whole arrangement of the page depends on it running when
// a payload lands and at no other time. Nothing in the DOM can tell a rebuilt
// arc from a kept one (the `d` is identical either way), so the only way to
// hold that line is to count the calls. The real function still does the work;
// this only counts. `mock`-prefixed names are the escape hatch jest's module
// factory allows, and a plain counter survives the resetAllMocks in afterEach
// where a jest.fn implementation would not.
let mockArcBuilds = 0;

jest.mock('./arcModel', () => {
    const actual = jest.requireActual('./arcModel');
    return {
        ...actual,
        buildArcs: (...args) => {
            mockArcBuilds += 1;
            return actual.buildArcs(...args);
        },
    };
});

// ─── What this page has to get right ────────────────────────────────────────
//
// Four things, and none of them is visible in a screenshot.
//
// The first is that pan and zoom do not re-render. A React page that redraws
// 1,255 ticks on every wheel notch looks identical to one that moves a
// transform until you put a few thousand arcs on it, at which point it is
// unusable and the cause is three phases back. The Profiler below is the only
// way to hold that line, so it is here from the start.
//
// The second is that the axis is one linear mapping. A tick in the wrong place
// is not an obvious failure — it is a picture that reads fine and means
// something else.
//
// The third is that a chain is chained and not pairwise. Six curves over four
// points reads as a denser, richer note rather than as a bug, and the cost is
// quadratic in what the reader has written.
//
// The fourth arrived with 6d: the three rails are three readings of ONE set of
// references, so the same verse has to land at the same y on all three, and an
// idea's chain has to be exactly the references of the notes linked to it. The
// mock below derives the upper two tiers from a link table the way the server
// does, precisely so that "link a note to an idea and its anchors appear on
// the idea's chain" is an assertion about a round trip rather than about a
// fixture someone typed out twice.

// A stand-in canon: 66 books, as the real one has, with chapter counts that
// vary the way the real ones do — a 150-chapter book next to a 1-chapter one
// is what makes label crowding real rather than theoretical.
const BOOK_COUNT = 66;

const chapterCountFor = (position) => {
    if (position === 18) return 150;          // the Psalms-shaped one
    if (position % 7 === 3) return 1;         // the Obadiah-shaped ones
    return 3 + (position % 24);
};

const CANON = Array.from({ length: BOOK_COUNT }, (unused, position) => ({
    id: position + 1,
    name: `Book ${position + 1}`,
    abbrev: `B${position + 1}`,
    testament: position < 39 ? 'OT' : 'NT',
    chapterCount: chapterCountFor(position),
    canonicalOrder: position + 1,
    chapters: Array.from({ length: chapterCountFor(position) }, (ignored, index) => ({
        number: index + 1,
        verseCount: 10 + ((position + index) % 30),
    })),
}));

const TOTAL_CHAPTERS = CANON.reduce((total, book) => total + book.chapters.length, 0);

const TOTAL_VERSES = CANON.reduce(
    (total, book) => book.chapters.reduce((count, chapter) => count + chapter.verseCount, total),
    0
);

// ─── The corpus the mock server holds ───────────────────────────────────────
//
// Notes and their references are the ground truth; every tier above them is
// DERIVED from the two link tables, exactly as src/lib/overviewQueries.js
// derives them from note_ideas and idea_topics. A fixture that spelled the
// ideas tier out by hand would let the page pass while the grouping it is
// meant to be showing was wrong.

const MIDDLE_VERSE = Math.round((1 + TOTAL_VERSES) / 2);

// A note carrying four references spread down the canon: that is the one shape
// that tells a chained renderer from a pairwise one, since 4 points are 3 arcs
// chained and 6 arcs pairwise. Its anchors are fractions of the total rather
// than literals so they stay inside whatever canon the stand-in above adds up
// to, and none of them collides with the others.
const CHAIN_FRACTIONS = [0.1, 0.3, 0.6, 0.9];
const CHAIN_NOTE_ID = 14;
const CHAIN_ANCHORS = CHAIN_FRACTIONS.map(fraction => Math.round(TOTAL_VERSES * fraction));
const CHAIN_TITLE = 'A thread through the canon';

const CHAIN_REFERENCES = CHAIN_ANCHORS.map((anchor, position) => [
    anchor,
    1 + position * 10,
    2,
    1,
    3,
]);

// [noteId, title, [[anchor, bookId, chapter, startVerse, endVerse], ...]] — the
// whole corpus, from which both halves of all three tiers are computed.
const NOTES = [
    [9, 'Justified by faith', [[1, 1, 1, 1, 5], [MIDDLE_VERSE, 40, 5, 3, 12]]],
    [11, 'The middle of the canon', [[MIDDLE_VERSE, 40, 5, 3, 3]]],
    // Untitled on purpose: a note may legally have no title.
    [12, '', [[TOTAL_VERSES, 66, 22, 1, 5]]],
    [CHAIN_NOTE_ID, CHAIN_TITLE, CHAIN_REFERENCES],
];

const IDEA_ID = 3;
const IDEA_TITLE = 'Faith as a thread';
const OTHER_IDEA_ID = 4;
const TOPIC_ID = 1;
const TOPIC_NAME = 'Faith';

const INITIAL_IDEAS = [
    [IDEA_ID, IDEA_TITLE],
    [OTHER_IDEA_ID, 'Creation'],
];

const TOPICS = [[TOPIC_ID, TOPIC_NAME]];

// The rows above notes, and the two link tables between them. Reassigned per
// test when a test is about what linking does, which is why they are `let` and
// restored in beforeEach — a test that edited a shared constant would leave
// the next one reading a corpus it never set up.
let ideas;        // [ideaId, title]
let noteIdeas;    // ideaId -> [noteId, ...]
let ideaTopics;   // topicId -> [ideaId, ...]

const INITIAL_NOTE_IDEAS = { [IDEA_ID]: [9, CHAIN_NOTE_ID], [OTHER_IDEA_ID]: [12] };
const INITIAL_IDEA_TOPICS = { [TOPIC_ID]: [IDEA_ID] };

const notesOfIdea = (ideaId) => noteIdeas[ideaId] || [];

const notesOfTopic = (topicId) => [...new Set(
    (ideaTopics[topicId] || []).flatMap(notesOfIdea)
)];

const referencesOfNote = (noteId) => {
    const note = NOTES.find(([id]) => id === noteId);
    return note ? note[2] : [];
};

// The server's grouping rule, in the two lines it actually is: collect the
// references of every note the group reaches, sort them canonically, and take
// the anchors as a sorted DEDUPLICATED set within the group.
const groupReferences = (noteIds) => noteIds
    .flatMap(referencesOfNote)
    .slice()
    .sort((a, b) => a[0] - b[0]);

const groupAnchors = (references) =>
    [...new Set(references.map(([anchor]) => anchor))].sort((a, b) => a - b);

// Which groups survive a ?topicId= filter, per tier.
const scopedGroups = (topicId) => (topicId === null
    ? {
        notes: NOTES.map(([id]) => id),
        ideas: ideas.map(([id]) => id),
        topics: TOPICS.map(([id]) => id),
    }
    : {
        notes: notesOfTopic(topicId),
        ideas: (ideaTopics[topicId] || []),
        topics: TOPICS.filter(([id]) => id === topicId).map(([id]) => id),
    });

const titleOf = (rows, id) => {
    const row = rows.find(([rowId]) => rowId === id);
    return row ? row[1] : '';
};

const tierFor = (rail, topicId) => {
    const scope = scopedGroups(topicId);

    const groups = scope[rail].map(id => {
        if (rail === 'notes') return { id, title: titleOf(NOTES, id), noteIds: [id] };
        if (rail === 'ideas') return { id, title: titleOf(ideas, id), noteIds: notesOfIdea(id) };
        return { id, title: titleOf(TOPICS, id), noteIds: notesOfTopic(id) };
    });

    // A group anchoring nothing is absent from the payload rather than present
    // with an empty array — the server's joins leave it out.
    return groups
        .map(group => ({ ...group, references: groupReferences(group.noteIds) }))
        .filter(group => group.references.length > 0);
};

const overviewPayload = (tiers, topicId) => tiers.reduce((payload, rail) => {
    const groups = tierFor(rail, topicId);
    const labelKey = `${rail.replace(/s$/, '')}Labels`;

    return {
        ...payload,
        [rail]: groups.map(group => [group.id, groupAnchors(group.references)]),
        [labelKey]: groups.map(group => [group.id, group.title, group.references]),
    };
}, {});

// The anchors the fixture's one idea gathers, computed the same way the mock
// does — the number the ideas rail has to draw.
const ideaAnchors = () => groupAnchors(groupReferences(notesOfIdea(IDEA_ID)));

// What GET /api/notes/:id returns for the chained note — the body the drawer
// fetches, which /api/overview deliberately does not carry.
const CHAIN_NOTE = {
    id: CHAIN_NOTE_ID,
    title: CHAIN_TITLE,
    body: '## In the beginning\n\nA body, in *markdown*.',
    references: CHAIN_REFERENCES.map(([, bookId, chapter, startVerse, endVerse], position) => ({
        id: 100 + position,
        noteId: CHAIN_NOTE_ID,
        bookId,
        chapter,
        startVerse,
        endVerse,
    })),
    ideas: [],
};

// GET /api/ideas/:id and /api/topics/:id: one tier's row with the tier below
// it nested inside, which is what the Topic page's tree already reads.
const IDEA_DETAIL = {
    id: IDEA_ID,
    title: IDEA_TITLE,
    body: 'Faith *threaded* through the canon.',
    topics: [{ id: TOPIC_ID, name: TOPIC_NAME }],
    notes: [
        { id: 9, title: 'Justified by faith', firstReference: { bookId: 1, chapter: 1 } },
        { id: CHAIN_NOTE_ID, title: CHAIN_TITLE, firstReference: { bookId: 1, chapter: 2 } },
    ],
};

const TOPIC_DETAIL = {
    id: TOPIC_ID,
    name: TOPIC_NAME,
    slug: 'faith',
    description: 'Everything filed under faith.',
    ideas: [{ id: IDEA_ID, title: IDEA_TITLE, noteCount: 2 }],
};

// The <svg> is laid out by the browser, and jsdom lays nothing out. Every
// client-to-world conversion reads this box, so without it a wheel event would
// zoom about the world origin and the anchor assertions would prove nothing.
const SVG_BOX = { left: 20, top: 10, width: WORLD.width, height: WORLD.height };

// jsdom implements no PointerEvent whatsoever, so a synthetic pointerdown
// arrives with no clientX, no button and no pointerId — a drag test against it
// would assert that nothing happens, and pass. MouseEvent already carries
// every field the pan handler reads except the id, so this is the smallest
// stand-in that lets the real handler run against real coordinates.
class TestPointerEvent extends window.MouseEvent {
    constructor(type, init = {}) {
        super(type, init);
        this.pointerId = init.pointerId;
        this.pointerType = init.pointerType ?? 'mouse';
    }
}

const ok = (body) => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
});

const failWith = (status) => () =>
    Promise.resolve({ ok: false, status, json: () => Promise.resolve({}) });

let commits;
let respond;
let respondToOverview;
let respondToDetail;
let overviewRequests;

// The mock reads the query string the page sent, so "the request asked for one
// tier" and "the response carried one tier" are the same fact rather than two.
const answerOverview = (url) => {
    const query = new URLSearchParams(String(url).split('?')[1] || '');
    const tiers = (query.get('tiers') || 'notes,ideas,topics').split(',').filter(Boolean);
    const rawTopic = query.get('topicId');
    const topicId = rawTopic === null ? null : Number(rawTopic);

    overviewRequests.push({ tiers, topicId });

    // A topic the reader does not own is a 404, not an empty diagram.
    if (topicId !== null && !TOPICS.some(([id]) => id === topicId)) {
        return failWith(404)();
    }

    return ok(overviewPayload(tiers, topicId));
};

beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    window.PointerEvent = TestPointerEvent;
    commits = [];
    mockArcBuilds = 0;
    overviewRequests = [];
    ideas = [...INITIAL_IDEAS];
    noteIdeas = { ...INITIAL_NOTE_IDEAS };
    ideaTopics = { ...INITIAL_IDEA_TOPICS };
    respond = () => ok({ books: CANON });
    respondToOverview = answerOverview;
    respondToDetail = (path) => {
        if (/\/notes\/\d+/.test(path)) return ok({ note: CHAIN_NOTE });
        if (/\/ideas\/\d+/.test(path)) return ok({ idea: IDEA_DETAIL });
        return ok({ topic: TOPIC_DETAIL });
    };
    // Routed by path rather than call order: the page fires both of its
    // requests from the same render, so which resolves first is not something a
    // test should be asserting about by accident. The third — one group's own
    // row — is fired by the drawer, much later and only if one is opened.
    global.fetch = jest.fn((url) => {
        const path = String(url);
        if (path.includes('/overview')) return respondToOverview(path);
        if (/\/(notes|ideas|topics)\/\d+/.test(path)) return respondToDetail(path);
        return respond();
    });

    jest.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
        ...SVG_BOX,
        right: SVG_BOX.left + SVG_BOX.width,
        bottom: SVG_BOX.top + SVG_BOX.height,
        x: SVG_BOX.left,
        y: SVG_BOX.top,
        toJSON: () => ({}),
    });
    // Pointer capture is how a drag keeps receiving moves once the cursor
    // leaves the element. jsdom has no pointer capture at all.
    SVGElement.prototype.setPointerCapture = jest.fn();
    SVGElement.prototype.releasePointerCapture = jest.fn();
});

afterEach(async () => {
    await act(async () => {});
    delete window.PointerEvent;
    jest.restoreAllMocks();
    jest.resetAllMocks();
    localStorage.clear();
});

// The page's state is its query string, so a test about a toggle is a test
// about the URL. This is the smallest thing that can read one back.
const LocationProbe = () => {
    const location = useLocation();
    return <span data-testid="location">{location.search}</span>;
};

const searchOf = () => screen.getByTestId('location').textContent;

const mount = async (entry = '/overview') => {
    let result;
    await act(async () => {
        result = render(
            <Profiler id="overview" onRender={(id, phase) => commits.push(phase)}>
                <MemoryRouter initialEntries={[entry]}>
                    <Overview />
                    <LocationProbe />
                </MemoryRouter>
            </Profiler>
        );
    });
    return result;
};

const sceneOf = (container) => container.querySelector('[data-testid="overview-scene"]');
const svgOf = (container) => container.querySelector('[data-testid="overview-svg"]');

const scaleOf = (container) =>
    Number(/scale\(([-\d.e+]+)\)/.exec(sceneOf(container).getAttribute('transform'))[1]);

const translationOf = (container) => {
    const [, x, y] = /translate\(([-\d.e+]+) ([-\d.e+]+)\)/
        .exec(sceneOf(container).getAttribute('transform'));
    return { x: Number(x), y: Number(y) };
};

// One wheel notch over a point in the middle of the box.
const wheelOver = (container, deltaY, point = { x: 120, y: 300 }) => {
    fireEvent.wheel(svgOf(container), {
        deltaY,
        clientX: SVG_BOX.left + point.x,
        clientY: SVG_BOX.top + point.y,
    });
};

// Zooms in until the chapter threshold is passed, however the zoom is tuned.
const zoomPastChapterThreshold = (container) => {
    for (let notch = 0; notch < 200 && scaleOf(container) < CHAPTER_ZOOM_THRESHOLD; notch += 1) {
        wheelOver(container, -100);
    }
};

// Everything is addressed by (rail, group id) rather than by id alone: note 9,
// idea 9 and topic 9 are three different things and, with all three rails
// drawn, three different chains on screen at once.
const stemsOn = (container, rail) =>
    [...container.querySelectorAll(`[data-rail="${rail}"] .overview-stem`)];

const arcsOn = (container, rail) =>
    [...container.querySelectorAll(`[data-rail="${rail}"] .overview-arc`)];

const arcGroupOf = (container, rail, groupId) => container.querySelector(
    `[data-rail="${rail}"] .overview-arc-group[data-group-id="${groupId}"]`
);

const stemOf = (container, rail, groupId, verseIndex) => container.querySelector(
    `[data-rail="${rail}"] .overview-stem[data-group-id="${groupId}"][data-verse-index="${verseIndex}"]`
);

// The pointer's target is the wide invisible path, never the drawn one — see
// the arcs section of Overview.css.
const hitPathOf = (container, rail, groupId) =>
    arcGroupOf(container, rail, groupId).querySelector('.overview-arc-hit');

// The client y at which a given world y sits. The mocked box is exactly the
// world's size and starts at SVG_BOX.top, so at rest the two differ by that
// offset alone — which is what makes "clicked nearest THIS anchor" a thing a
// test can state precisely.
const clientYForWorldY = (worldY) => SVG_BOX.top + worldY;

const hoverArc = (container, rail, groupId, clientY = 200) => {
    fireEvent.pointerOver(hitPathOf(container, rail, groupId), {
        clientX: SVG_BOX.left + 300,
        clientY,
    });
};

// A press and release in the same place: usePanZoom captures the pointer on
// every press, so the click arrives retargeted at the <svg> and the group is
// resolved from what was pressed. Both halves have to be fired for that to be
// exercised at all.
const clickArc = (container, rail, groupId, clientY = 200) => {
    const clientX = SVG_BOX.left + 300;
    fireEvent.pointerDown(hitPathOf(container, rail, groupId), {
        pointerId: 1,
        clientX,
        clientY,
        button: 0,
    });
    fireEvent.pointerUp(svgOf(container), { pointerId: 1, clientX, clientY });
    fireEvent.click(svgOf(container), { clientX, clientY });
};

describe('the axis', () => {
    test('draws one tick for every book in the canon', async () => {
        // Arrange / Act
        const { container } = await mount();

        // Assert
        expect(container.querySelectorAll('.overview-book-tick')).toHaveLength(BOOK_COUNT);
    });

    test('labels every book tick with the book name', async () => {
        // Arrange / Act
        const { container } = await mount();
        const labels = [...container.querySelectorAll('.overview-book-label')];

        // Assert
        expect(labels).toHaveLength(BOOK_COUNT);
        expect(labels[0]).toHaveTextContent('Book 1');
        expect(labels[BOOK_COUNT - 1]).toHaveTextContent(`Book ${BOOK_COUNT}`);
    });

    test('puts the first book at the top and the last at the foot of the axis', async () => {
        // Arrange / Act
        const { container } = await mount();
        const ticks = [...container.querySelectorAll('.overview-book-tick')];
        const yOf = (tick) => Number(tick.getAttribute('y1'));

        // Assert — one linear mapping means the ticks come out in order.
        const positions = ticks.map(yOf);
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
        expect(yOf(ticks[0])).toBeLessThan(yOf(ticks[BOOK_COUNT - 1]));
    });

    test('spaces book ticks by their verse count, not evenly', async () => {
        // Arrange — the 150-chapter book must own far more of the axis than
        // its one-chapter neighbours. Even spacing would be per-book math.
        const { container } = await mount();
        const positions = [...container.querySelectorAll('.overview-book-tick')]
            .map(tick => Number(tick.getAttribute('y1')));

        // Act
        const spans = positions.slice(1).map((y, index) => y - positions[index]);

        // Assert
        expect(Math.max(...spans)).toBeGreaterThan(Math.min(...spans) * 5);
    });
});

describe('chapter detail', () => {
    test('draws no chapter ticks at rest', async () => {
        // Arrange / Act
        const { container } = await mount();

        // Assert — 1,189 marks over the resting axis is a smear, and 1,189
        // labels is a page that stutters before it has drawn an arc.
        expect(container.querySelectorAll('.overview-chapter-tick')).toHaveLength(0);
        expect(container.querySelectorAll('.overview-chapter-label')).toHaveLength(0);
    });

    test('draws chapter ticks and labels once zoomed past the threshold', async () => {
        // Arrange
        const { container } = await mount();

        // Act
        zoomPastChapterThreshold(container);

        // Assert
        expect(container.querySelectorAll('.overview-chapter-tick')).toHaveLength(TOTAL_CHAPTERS);
        expect(container.querySelectorAll('.overview-chapter-label')).toHaveLength(TOTAL_CHAPTERS);
    });

    test('takes the chapter ticks away again on zooming back out', async () => {
        // Arrange
        const { container } = await mount();
        zoomPastChapterThreshold(container);

        // Act
        for (let notch = 0; notch < 200 && scaleOf(container) > MIN_SCALE; notch += 1) {
            wheelOver(container, 100);
        }

        // Assert
        expect(container.querySelectorAll('.overview-chapter-tick')).toHaveLength(0);
    });
});

describe('pan and zoom', () => {
    test('zooms by writing the transform, without re-rendering the page', async () => {
        // Arrange
        const { container } = await mount();
        const before = sceneOf(container).getAttribute('transform');
        commits.length = 0;

        // Act — several notches, all inside the resting detail band so that
        // nothing legitimately changes in the tree.
        wheelOver(container, -100);
        wheelOver(container, -100);
        wheelOver(container, -50);

        // Assert
        expect(sceneOf(container).getAttribute('transform')).not.toBe(before);
        expect(scaleOf(container)).toBeGreaterThan(MIN_SCALE);
        expect(commits).toEqual([]);
    });

    test('keeps the verse under the cursor still while zooming', async () => {
        // Arrange — the content point under the cursor before the notch has to
        // land back under the cursor after it, however many notches deep the
        // reader already is.
        const { container } = await mount();
        wheelOver(container, -100);
        wheelOver(container, -100);

        const cursor = { x: 130, y: 700 };
        const contentUnderCursor = () =>
            (cursor.y - translationOf(container).y) / scaleOf(container);
        const anchor = contentUnderCursor();

        // Act
        wheelOver(container, -100, cursor);

        // Assert
        expect(anchor * scaleOf(container) + translationOf(container).y)
            .toBeCloseTo(cursor.y, 6);
    });

    test('does not slide the view sideways while zooming', async () => {
        // Arrange — the labels and rails hold their distance from the axis at
        // every zoom, so moving x would carry a rigid column off the page.
        const { container } = await mount();

        // Act
        wheelOver(container, -100, { x: 400, y: 200 });
        wheelOver(container, -100, { x: 40, y: 800 });

        // Assert
        expect(translationOf(container).x).toBe(0);
    });

    test('pans on a drag, again without re-rendering', async () => {
        // Arrange
        const { container } = await mount();
        const svg = svgOf(container);
        commits.length = 0;

        // Act
        fireEvent.pointerDown(svg, { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
        fireEvent.pointerMove(svg, { pointerId: 1, clientX: 130, clientY: 60 });
        fireEvent.pointerUp(svg, { pointerId: 1, clientX: 130, clientY: 60 });

        // Assert — the box is exactly the world's size, so a 30px drag is a
        // 30 unit pan.
        expect(translationOf(container)).toEqual({ x: 30, y: -40 });
        expect(commits).toEqual([]);
    });

    test('pans even when the browser refuses to capture the pointer', async () => {
        // Arrange — setPointerCapture throws NotFoundError when the pointer is
        // no longer active by the time the handler runs, which a fast click or
        // a synthetic event can both produce. Capture only keeps the moves
        // coming once the cursor leaves the <svg>; losing it has to cost the
        // reader that and nothing else, not put an exception through the
        // handler and leave the drag half-started.
        SVGElement.prototype.setPointerCapture = jest.fn(() => {
            throw new DOMException('No active pointer with the given id is found.', 'NotFoundError');
        });
        const { container } = await mount();
        const svg = svgOf(container);

        // Act
        fireEvent.pointerDown(svg, { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
        fireEvent.pointerMove(svg, { pointerId: 1, clientX: 130, clientY: 60 });
        fireEvent.pointerUp(svg, { pointerId: 1, clientX: 130, clientY: 60 });

        // Assert
        expect(translationOf(container)).toEqual({ x: 30, y: -40 });
    });

    test('ends a drag cleanly when releasing the pointer is refused too', async () => {
        // Arrange
        SVGElement.prototype.releasePointerCapture = jest.fn(() => {
            throw new DOMException('No active pointer with the given id is found.', 'NotFoundError');
        });
        const { container } = await mount();
        const svg = svgOf(container);

        // Act
        fireEvent.pointerDown(svg, { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
        fireEvent.pointerMove(svg, { pointerId: 1, clientX: 130, clientY: 60 });
        fireEvent.pointerUp(svg, { pointerId: 1, clientX: 130, clientY: 60 });
        // A move after the release must not still be panning.
        fireEvent.pointerMove(svg, { pointerId: 1, clientX: 300, clientY: 300 });

        // Assert
        expect(translationOf(container)).toEqual({ x: 30, y: -40 });
    });

    test('ignores pointer moves that are not part of a drag', async () => {
        // Arrange
        const { container } = await mount();

        // Act
        fireEvent.pointerMove(svgOf(container), { pointerId: 1, clientX: 300, clientY: 300 });

        // Assert
        expect(translationOf(container)).toEqual({ x: 0, y: 0 });
    });

    test('re-renders exactly once when the zoom crosses into chapter detail', async () => {
        // Arrange — the one commit this page is allowed during a gesture:
        // chapter ticks have to enter the DOM, so React has to run. Anything
        // more than one commit means something else is re-rendering too.
        const { container } = await mount();
        for (let notch = 0; notch < 200 && scaleOf(container) < CHAPTER_ZOOM_THRESHOLD * 0.85; notch += 1) {
            wheelOver(container, -100);
        }
        commits.length = 0;

        // Act
        zoomPastChapterThreshold(container);

        // Assert
        expect(commits).toHaveLength(1);
    });
});

describe('holding sizes constant', () => {
    test('publishes an inverse scale of one at rest', async () => {
        // Arrange / Act
        const { container } = await mount();

        // Assert — strokes and labels are sized in CSS as their design size
        // times this number, so the whole page stays put by arithmetic rather
        // than by re-measuring anything.
        expect(svgOf(container).style.getPropertyValue('--ov-inverse-scale')).toBe('1');
    });

    test('publishes the reciprocal of the zoom so strokes and labels do not grow', async () => {
        // Arrange
        const { container } = await mount();

        // Act
        wheelOver(container, -100);

        // Assert
        const published = Number(svgOf(container).style.getPropertyValue('--ov-inverse-scale'));
        expect(published).toBeCloseTo(1 / scaleOf(container), 10);
    });

    test('publishes the detail tier the zoom has reached, so crowded labels resolve', async () => {
        // Arrange
        const { container } = await mount();
        expect(svgOf(container)).toHaveAttribute('data-detail-tier', '0');

        // Act
        zoomPastChapterThreshold(container);

        // Assert — 12x is past 2^3.
        expect(Number(svgOf(container).getAttribute('data-detail-tier'))).toBeGreaterThanOrEqual(3);
    });
});

describe('reset', () => {
    test('puts the view back to the fitted whole canon', async () => {
        // Arrange
        const { container } = await mount();
        wheelOver(container, -100);
        fireEvent.pointerDown(svgOf(container), { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
        fireEvent.pointerMove(svgOf(container), { pointerId: 1, clientX: 160, clientY: 160 });
        fireEvent.pointerUp(svgOf(container), { pointerId: 1, clientX: 160, clientY: 160 });

        // Act
        fireEvent.click(screen.getByRole('button', { name: /reset/i }));

        // Assert
        expect(sceneOf(container).getAttribute('transform')).toBe('translate(0 0) scale(1)');
        expect(svgOf(container).style.getPropertyValue('--ov-inverse-scale')).toBe('1');
    });
});

describe('the three rails', () => {
    test('draws a rail for each tier the arcs land on', async () => {
        // Arrange / Act
        const { container } = await mount();

        // Assert
        expect(container.querySelectorAll('.overview-rail')).toHaveLength(RAILS.length);
    });

    test('names them notes, ideas and topics, in that order', async () => {
        // Arrange / Act
        const { container } = await mount();
        const labels = [...container.querySelectorAll('.overview-rail-label')];

        // Assert
        expect(labels.map(label => label.textContent)).toEqual(['notes', 'ideas', 'topics']);
    });

    test('keeps the rails clear of the axis labels', async () => {
        // Arrange / Act
        const { container } = await mount();
        const railX = [...container.querySelectorAll('.overview-rail')]
            .map(rail => Number(rail.getAttribute('x1')));

        // Assert — every rail is to the right of the axis, in ascending order.
        expect(railX).toEqual(RAILS.map(rail => rail.x));
        expect(Math.min(...railX)).toBeGreaterThan(100);
    });
});

describe('the stems', () => {
    const yOf = (stem) => Number(stem.getAttribute('y1'));

    const NOTE_ANCHOR_COUNT = NOTES.reduce(
        (total, [, , references]) => total + new Set(references.map(([anchor]) => anchor)).size,
        0
    );

    test('draws one stem per anchor point, not one per note', async () => {
        // Arrange / Act — note 9 carries two references, so it gets two stems.
        const { container } = await mount();

        // Assert
        expect(stemsOn(container, 'notes')).toHaveLength(NOTE_ANCHOR_COUNT);
        expect(NOTE_ANCHOR_COUNT).toBeGreaterThan(NOTES.length);
    });

    test('runs each stem from the axis to its own rail', async () => {
        // Arrange / Act
        const { container } = await mount();

        // Assert — horizontal, and spanning exactly the gap the layout names.
        RAILS.forEach(rail => {
            stemsOn(container, rail.key).forEach(stem => {
                expect(Number(stem.getAttribute('x1'))).toBe(AXIS.x);
                expect(Number(stem.getAttribute('x2'))).toBe(RAIL_X[rail.key]);
                expect(yOf(stem)).toBe(Number(stem.getAttribute('y2')));
            });
        });
    });

    test('puts a stem at the same y as the axis mark for the same verse', async () => {
        // Arrange — this is the assertion the phase exists to make. An anchor
        // at verse_index 1 is the first book's tick; an anchor at the last
        // verse is the foot of the axis. If the stems used any mapping other
        // than the axis's own, these two would drift apart and the picture
        // would still look entirely reasonable.
        const { container } = await mount();
        const firstBookTick = container.querySelector('.overview-book-tick');

        // Act
        const positions = stemsOn(container, 'notes').map(yOf);

        // Assert
        expect(Math.min(...positions)).toBe(Number(firstBookTick.getAttribute('y1')));
        expect(Math.min(...positions)).toBe(AXIS.top);
        expect(Math.max(...positions)).toBe(AXIS.bottom);
    });

    test('places a mid-canon anchor halfway down the axis', async () => {
        // Arrange — the mapping is linear, so the middle verse is the middle
        // of the axis. A per-book mapping would land it somewhere plausible
        // and wrong.
        const { container } = await mount();

        // Act
        const middle = stemsOn(container, 'notes')
            .filter(stem => Number(stem.getAttribute('data-verse-index')) === MIDDLE_VERSE)
            .map(yOf);

        // Assert — against the linear rule spelled out here rather than
        // imported, so the page and the test cannot be wrong together. Then
        // against the middle of the axis, to within the one verse that
        // rounding an odd verse total to an integer index costs.
        const expected = AXIS.top
            + ((MIDDLE_VERSE - 1) / (TOTAL_VERSES - 1)) * (AXIS.bottom - AXIS.top);
        const oneVerse = (AXIS.bottom - AXIS.top) / (TOTAL_VERSES - 1);

        // Two notes share that anchor, and both get their own stem.
        expect(middle).toHaveLength(2);
        middle.forEach(y => {
            expect(y).toBeCloseTo(expected, 10);
            expect(Math.abs(y - (AXIS.top + AXIS.bottom) / 2)).toBeLessThanOrEqual(oneVerse);
        });
    });

    test('carries the group each stem belongs to, for the hover to find', async () => {
        // Arrange / Act
        const { container } = await mount();

        // Assert
        const groupIds = stemsOn(container, 'notes')
            .map(stem => Number(stem.getAttribute('data-group-id')));
        expect(new Set(groupIds)).toEqual(new Set(NOTES.map(([noteId]) => noteId)));
    });

    test('does not re-render when the reader zooms', async () => {
        // Arrange — the whole point of the phase's placement in the scene: a
        // few thousand stems must be as free to zoom over as the empty rails
        // of 6a were.
        const { container } = await mount();
        expect(stemsOn(container, 'notes')).toHaveLength(NOTE_ANCHOR_COUNT);
        commits.length = 0;

        // Act
        wheelOver(container, -100);
        wheelOver(container, -100);
        fireEvent.pointerDown(svgOf(container), { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
        fireEvent.pointerMove(svgOf(container), { pointerId: 1, clientX: 130, clientY: 60 });
        fireEvent.pointerUp(svgOf(container), { pointerId: 1, clientX: 130, clientY: 60 });

        // Assert
        expect(commits).toEqual([]);
        expect(stemsOn(container, 'notes')).toHaveLength(NOTE_ANCHOR_COUNT);
    });

    test('draws no stems for a reader who has written no notes', async () => {
        // Arrange
        respondToOverview = () => ok({ notes: [] });

        // Act
        const { container } = await mount();

        // Assert — an axis with nothing on it, and no error: that is what an
        // empty corpus looks like, not a failure.
        expect(stemsOn(container, 'notes')).toHaveLength(0);
        expect(container.querySelectorAll('.overview-book-tick')).toHaveLength(BOOK_COUNT);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    test('keeps the axis and says the anchors are missing when they fail to load', async () => {
        // Arrange — the canon and the anchors fail differently. Losing the
        // anchors leaves a page that still works, and hiding it would be
        // indistinguishable from a reader who has written nothing.
        respondToOverview = failWith(500);

        // Act
        const { container } = await mount();

        // Assert
        expect(await screen.findByRole('alert')).toHaveTextContent(/not on the axis/i);
        expect(container.querySelectorAll('.overview-book-tick')).toHaveLength(BOOK_COUNT);
        expect(stemsOn(container, 'notes')).toHaveLength(0);
    });
});

describe('the arcs', () => {
    const quadraticsIn = (path) =>
        (path.getAttribute('d').match(/Q/g) || []).length;

    test('chains a four-reference note into three arcs, not six', async () => {
        // Arrange — the assertion the phase exists to make, and the one that
        // fails invisibly: pairwise would be n(n-1)/2 = 6 curves, and six
        // curves over four points reads as a denser, richer note rather than
        // as a bug. At a few hundred references it is the difference between a
        // page that draws and one that does not.
        const { container } = await mount();

        // Act
        const chain = arcGroupOf(container, 'notes', CHAIN_NOTE_ID)
            .querySelector('.overview-arc');

        // Assert
        expect(quadraticsIn(chain)).toBe(CHAIN_ANCHORS.length - 1);
    });

    test('draws one connected path per note rather than one per arc', async () => {
        // Arrange / Act — two of the four notes have more than one anchor; the
        // other two have one each and have nothing to be chained to.
        const { container } = await mount();

        // Assert
        expect(arcsOn(container, 'notes')).toHaveLength(2);
        expect(arcGroupOf(container, 'notes', 11)).toBeNull();
        expect(arcGroupOf(container, 'notes', 12)).toBeNull();
    });

    test('hangs both ends of every arc on its own rail', async () => {
        // Arrange / Act
        const { container } = await mount();

        // Assert — an arc leaves the rail only at its control point, and each
        // tier's arcs leave from the tier's own rail.
        RAILS.forEach(rail => {
            arcsOn(container, rail.key).forEach(arc => {
                const endpoints = [...arc.getAttribute('d')
                    .matchAll(/(?:^M|Q [\d.]+ [\d.]+) ([\d.]+) [\d.]+/g)]
                    .map(match => Number(match[1]));
                expect(endpoints.length).toBeGreaterThan(0);
                endpoints.forEach(x => expect(x).toBe(RAIL_X[rail.key]));
            });
        });
    });

    test('starts a chain at the same y as the stem for its first reference', async () => {
        // Arrange — arcs and stems read the same anchor points through the
        // same module, so an arc endpoint without a stem under it would mean
        // the two had drifted apart.
        const { container } = await mount();
        const stem = stemOf(container, 'notes', CHAIN_NOTE_ID, CHAIN_ANCHORS[0]);

        // Act
        const [, , startY] = /^M ([\d.]+) ([\d.]+)/
            .exec(arcGroupOf(container, 'notes', CHAIN_NOTE_ID)
                .querySelector('.overview-arc').getAttribute('d'));

        // Assert
        expect(Number(startY)).toBeCloseTo(Number(stem.getAttribute('y1')), 1);
    });

    test('does not re-render when the reader zooms', async () => {
        // Arrange — the arcs are the heaviest thing on the page and the reason
        // the whole drawing is arranged around not re-rendering.
        const { container } = await mount();
        commits.length = 0;

        // Act
        wheelOver(container, -100);
        wheelOver(container, -100);

        // Assert
        expect(commits).toEqual([]);
        expect(arcsOn(container, 'notes')).toHaveLength(2);
    });

    test('draws no arcs for a reader whose notes each have one reference', async () => {
        // Arrange — one anchor is a stem and nothing else. This is the common
        // shape of a new corpus, and it must not draw a zero-length curve.
        respondToOverview = () => ok({ notes: [[9, [4]], [11, [90]]], noteLabels: [] });

        // Act
        const { container } = await mount();

        // Assert
        expect(arcsOn(container, 'notes')).toHaveLength(0);
        expect(stemsOn(container, 'notes')).toHaveLength(2);
    });
});

describe('the ideas and topics rails', () => {
    const quadraticsIn = (path) => (path.getAttribute('d').match(/Q/g) || []).length;

    test('gives an idea the anchors of every note linked to it', async () => {
        // Arrange — the phase's grouping rule, stated against the link table
        // rather than against a fixture: idea 3 gathers notes 9 and 14, so its
        // chain is their references and nothing else.
        const { container } = await mount();

        // Act
        const anchors = stemsOn(container, 'ideas')
            .filter(stem => stem.getAttribute('data-group-id') === String(IDEA_ID))
            .map(stem => Number(stem.getAttribute('data-verse-index')));

        // Assert
        expect(anchors).toEqual(ideaAnchors());
        expect(anchors).toEqual(expect.arrayContaining(CHAIN_ANCHORS));
    });

    test('adds a newly linked note to the idea chain on the next load', async () => {
        // Arrange — the phase's acceptance criterion. The mock derives the
        // ideas tier from note_ideas the way the server does, so linking a
        // note and remounting is a round trip and not a re-read of a fixture.
        const { container: before } = await mount();
        const anchorsBefore = stemsOn(before, 'ideas')
            .filter(stem => stem.getAttribute('data-group-id') === String(IDEA_ID)).length;

        // Act — note 12 is anchored at the last verse of the canon and was
        // filed under a different idea.
        noteIdeas = { ...noteIdeas, [IDEA_ID]: [...noteIdeas[IDEA_ID], 12] };
        const { container: after } = await mount();

        // Assert
        const anchorsAfter = stemsOn(after, 'ideas')
            .filter(stem => stem.getAttribute('data-group-id') === String(IDEA_ID))
            .map(stem => Number(stem.getAttribute('data-verse-index')));
        expect(anchorsAfter).toHaveLength(anchorsBefore + 1);
        expect(anchorsAfter).toContain(TOTAL_VERSES);
    });

    test('gives a topic the anchors of every note under all of its ideas', async () => {
        // Arrange / Act — topic 1 holds idea 3 alone, so the two rails carry
        // the same points at this size of corpus, which is exactly right: a
        // topic is its ideas' notes and nothing more.
        const { container } = await mount();

        // Assert
        const anchorsOn = (rail) => stemsOn(container, rail)
            .filter(stem => stem.getAttribute('data-group-id') === String(
                rail === 'ideas' ? IDEA_ID : TOPIC_ID
            ))
            .map(stem => Number(stem.getAttribute('data-verse-index')));

        expect(anchorsOn('topics')).toEqual(anchorsOn('ideas'));
    });

    test('puts the same verse at the same y on all three rails', async () => {
        // Arrange — the acceptance criterion a reader can actually see, and
        // the one thing three rails makes easy to get wrong. Note 14's first
        // anchor is on the notes rail as itself, on the ideas rail through
        // idea 3, and on the topics rail through topic 1.
        const { container } = await mount();
        const anchor = CHAIN_ANCHORS[0];

        // Act
        const ys = [
            stemOf(container, 'notes', CHAIN_NOTE_ID, anchor),
            stemOf(container, 'ideas', IDEA_ID, anchor),
            stemOf(container, 'topics', TOPIC_ID, anchor),
        ].map(stem => Number(stem.getAttribute('y1')));

        // Assert
        expect(ys.every(y => Number.isFinite(y))).toBe(true);
        expect(new Set(ys).size).toBe(1);
    });

    test('chains an idea the same way it chains a note', async () => {
        // Arrange — one continuous path, one quadratic per consecutive pair.
        // Pairwise on the upper rails is where the cost really bites: a topic
        // reaches every reference under it.
        const { container } = await mount();

        // Act
        const chain = arcGroupOf(container, 'ideas', IDEA_ID).querySelector('.overview-arc');

        // Assert
        expect(quadraticsIn(chain)).toBe(ideaAnchors().length - 1);
    });

    test('tells note 14 and idea 14 apart when both are on the page', async () => {
        // Arrange — ids are per tier, so the same number naming a note and an
        // idea is ordinary. Hovering one must not light the other.
        ideas = [...ideas, [CHAIN_NOTE_ID, 'An idea with a note id']];
        noteIdeas = { [CHAIN_NOTE_ID]: [9] };
        ideaTopics = {};
        const { container } = await mount();

        // Act
        hoverArc(container, 'notes', CHAIN_NOTE_ID);

        // Assert
        expect(arcGroupOf(container, 'notes', CHAIN_NOTE_ID)).toHaveAttribute('data-active');
        expect(arcGroupOf(container, 'ideas', CHAIN_NOTE_ID)).not.toHaveAttribute('data-active');
    });
});

describe('the tier toggles', () => {
    const toggleFor = (name) => screen.getByRole('checkbox', { name });

    test('shows every rail by default', async () => {
        // Arrange / Act
        await mount();

        // Assert
        RAILS.forEach(rail => expect(toggleFor(rail.label)).toBeChecked());
    });

    test('takes a rail away when its box is unticked', async () => {
        // Arrange
        const { container } = await mount();
        expect(arcsOn(container, 'topics').length).toBeGreaterThan(0);

        // Act
        await act(async () => {
            fireEvent.click(toggleFor('topics'));
        });

        // Assert — the arcs, the stems and the rail itself, since a labelled
        // line with nothing on it says something different from "hidden".
        expect(arcsOn(container, 'topics')).toHaveLength(0);
        expect(stemsOn(container, 'topics')).toHaveLength(0);
        expect([...container.querySelectorAll('.overview-rail-label')]
            .map(label => label.textContent)).toEqual(['notes', 'ideas']);
    });

    test('writes the choice into the URL so it survives a reload', async () => {
        // Arrange — the Analyze page's convention: the page's state is its
        // query string, so a toggle is shareable and the back button undoes it.
        await mount();

        // Act
        await act(async () => {
            fireEvent.click(toggleFor('ideas'));
        });

        // Assert
        expect(searchOf()).toBe('?tiers=notes%2Ctopics');
    });

    test('leaves the URL bare when every rail is shown', async () => {
        // Arrange — a URL carries the reader's departures from the default,
        // not the default itself.
        await mount();

        // Act — off and on again.
        await act(async () => {
            fireEvent.click(toggleFor('ideas'));
        });
        await act(async () => {
            fireEvent.click(toggleFor('ideas'));
        });

        // Assert
        expect(searchOf()).toBe('');
    });

    test('draws the rails a URL arrived asking for', async () => {
        // Arrange / Act
        const { container } = await mount('/overview?tiers=topics');

        // Assert
        expect(screen.getByRole('checkbox', { name: 'topics' })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'notes' })).not.toBeChecked();
        expect(stemsOn(container, 'notes')).toHaveLength(0);
        expect(stemsOn(container, 'topics').length).toBeGreaterThan(0);
    });

    test('asks the server only for the rails it is drawing', async () => {
        // Arrange — the topics tier is the widest join of the three and the
        // largest on the wire. A reader who has turned it off should not be
        // paying for it.
        // Act
        await mount('/overview?tiers=notes');

        // Assert
        expect(overviewRequests).toEqual([{ tiers: ['notes'], topicId: null }]);
    });

    test('asks for nothing at all when every rail is off', async () => {
        // Arrange / Act — an empty diagram is not a question worth asking the
        // network.
        const { container } = await mount('/overview?tiers=');

        // Assert
        expect(overviewRequests).toEqual([]);
        expect(container.querySelectorAll('.overview-stem')).toHaveLength(0);
        expect(container.querySelectorAll('.overview-book-tick')).toHaveLength(BOOK_COUNT);
    });

    test('falls back to every rail when the URL names none that exist', async () => {
        // Arrange / Act — a stale or hand-edited link should show the page,
        // not a blank frame with no way back.
        const { container } = await mount('/overview?tiers=nonsense');

        // Assert
        expect(stemsOn(container, 'notes').length).toBeGreaterThan(0);
        expect(stemsOn(container, 'topics').length).toBeGreaterThan(0);
    });
});

describe('the topic filter', () => {
    test('restricts every rail to what falls under one topic', async () => {
        // Arrange — the plan's open question 2. Note 12 is filed under idea 4,
        // which is under no topic, so it must not appear on any rail.
        // Act
        const { container } = await mount(`/overview?topicId=${TOPIC_ID}`);

        // Assert
        const groupsOn = (rail) => new Set(stemsOn(container, rail)
            .map(stem => Number(stem.getAttribute('data-group-id'))));

        expect(groupsOn('notes')).toEqual(new Set(notesOfIdea(IDEA_ID)));
        expect(groupsOn('ideas')).toEqual(new Set([IDEA_ID]));
        expect(groupsOn('topics')).toEqual(new Set([TOPIC_ID]));
    });

    test('sends the filter to the server rather than trimming the answer', async () => {
        // Arrange / Act — the client cannot do this filtering: the payload
        // carries no note-to-idea membership, on purpose.
        await mount(`/overview?topicId=${TOPIC_ID}`);

        // Assert
        expect(overviewRequests).toEqual([
            { tiers: ['notes', 'ideas', 'topics'], topicId: TOPIC_ID },
        ]);
    });

    test('says the diagram is filtered, and offers the way back', async () => {
        // Arrange — an unexplained near-empty diagram is the one failure a
        // filter can produce that looks exactly like an empty corpus.
        await mount(`/overview?topicId=${TOPIC_ID}`);

        // Act
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /show every topic/i }));
        });

        // Assert
        expect(searchOf()).toBe('');
        expect(screen.queryByText(/showing one topic only/i)).not.toBeInTheDocument();
    });

    test('ignores a malformed topicId rather than refusing to draw', async () => {
        // Arrange / Act
        const { container } = await mount('/overview?topicId=not-a-number');

        // Assert
        expect(overviewRequests[0].topicId).toBeNull();
        expect(stemsOn(container, 'notes').length).toBeGreaterThan(0);
    });

    test('reports a topic that is not the readers, without losing the axis', async () => {
        // Arrange — the server answers 404 rather than an empty diagram, and
        // the page treats it the way it treats any failure of the anchors.
        // Act
        const { container } = await mount('/overview?topicId=999');

        // Assert
        expect(await screen.findByRole('alert')).toHaveTextContent(/not on the axis/i);
        expect(container.querySelectorAll('.overview-book-tick')).toHaveLength(BOOK_COUNT);
    });
});

describe('hovering a chain', () => {
    test('lights the whole chain and its stems, and dims the rest', async () => {
        // Arrange — this is the interaction the phase is for. Hovering ONE arc
        // of a note has to bring up every arc of that note and every stem
        // hanging off it, because the point being made is that these passages
        // are one thought.
        const { container } = await mount();

        // Act
        hoverArc(container, 'notes', CHAIN_NOTE_ID);

        // Assert
        expect(svgOf(container)).toHaveAttribute('data-focused');
        expect(arcGroupOf(container, 'notes', CHAIN_NOTE_ID)).toHaveAttribute('data-active');

        const litStems = [...container.querySelectorAll('.overview-stem[data-active]')];
        expect(litStems).toHaveLength(CHAIN_ANCHORS.length);
        litStems.forEach(stem =>
            expect(stem.getAttribute('data-group-id')).toBe(String(CHAIN_NOTE_ID)));

        // And nothing belonging to another group came up with it.
        expect(arcGroupOf(container, 'notes', 9)).not.toHaveAttribute('data-active');
        expect(arcGroupOf(container, 'ideas', IDEA_ID)).not.toHaveAttribute('data-active');
    });

    test('lights an idea chain the same way it lights a note', async () => {
        // Arrange
        const { container } = await mount();

        // Act
        hoverArc(container, 'ideas', IDEA_ID);

        // Assert
        expect(arcGroupOf(container, 'ideas', IDEA_ID)).toHaveAttribute('data-active');
        expect([...container.querySelectorAll('.overview-stem[data-active]')])
            .toHaveLength(ideaAnchors().length);
    });

    test('moves the highlight when the pointer crosses to another rail', async () => {
        // Arrange
        const { container } = await mount();
        hoverArc(container, 'notes', CHAIN_NOTE_ID);

        // Act
        hoverArc(container, 'topics', TOPIC_ID);

        // Assert
        expect(arcGroupOf(container, 'topics', TOPIC_ID)).toHaveAttribute('data-active');
        expect(arcGroupOf(container, 'notes', CHAIN_NOTE_ID)).not.toHaveAttribute('data-active');
    });

    test('puts everything back when the pointer leaves the drawing', async () => {
        // Arrange
        const { container } = await mount();
        hoverArc(container, 'notes', CHAIN_NOTE_ID);

        // Act
        fireEvent.pointerLeave(svgOf(container));

        // Assert
        expect(svgOf(container)).not.toHaveAttribute('data-focused');
        expect(container.querySelectorAll('[data-active]')).toHaveLength(0);
    });

    test('names the note and lists its references', async () => {
        // Arrange — the tooltip is the only thing that says what an arc IS,
        // and the references come from the parallel tier: an anchor is a
        // midpoint and cannot be turned back into "Book 1 2:1–3".
        const { container } = await mount();

        // Act
        hoverArc(container, 'notes', 9);

        // Assert
        const tooltip = screen.getByTestId('overview-tooltip');
        expect(tooltip).toHaveTextContent('Justified by faith');
        expect(tooltip).toHaveTextContent('Book 1 1:1–5; Book 40 5:3–12');
    });

    test('names the tier a hovered chain is on', async () => {
        // Arrange — three rails drawn the same way in three colours. "Faith"
        // as an idea and "Faith" as a topic are different rows and different
        // chains, and the tooltip should not leave that to a colour match.
        const { container } = await mount();

        // Act
        hoverArc(container, 'topics', TOPIC_ID);

        // Assert
        const tooltip = screen.getByTestId('overview-tooltip');
        expect(tooltip.querySelector('.overview-tooltip-rail')).toHaveTextContent('topic');
        expect(tooltip).toHaveTextContent(TOPIC_NAME);
    });

    test('names an untitled note rather than showing a blank tooltip', async () => {
        // Arrange — note 12 has one anchor and so no arc, so the tier is
        // rewritten to give it two. A note with no title is legal.
        respondToOverview = () => ok({
            notes: [[12, [1, MIDDLE_VERSE]]],
            noteLabels: [[12, '', [[1, 1, 1, 1, 1], [MIDDLE_VERSE, 40, 5, 3, 3]]]],
        });
        const { container } = await mount();

        // Act
        hoverArc(container, 'notes', 12);

        // Assert
        expect(screen.getByTestId('overview-tooltip')).toHaveTextContent('Untitled note');
    });

    test('does not rebuild any rail geometry when the pointer moves', async () => {
        // Arrange — hovering DOES commit React, because the tooltip is content
        // and content is React's job. What must not happen is the commit
        // reaching the geometry: three rails of chains rebuilt per pointer
        // crossing is the cost this page is arranged around never paying, and
        // it is invisible from the DOM because a rebuilt arc has the same `d`.
        //
        // It is only true while `tiers` keeps its identity between renders —
        // it is parsed out of the URL on every one — hence the memo in
        // useOverviewParams. Without that memo this counts one build per rail
        // per commit.
        const { container } = await mount();

        // Loading costs at most two passes over the rails: one for the render
        // before the payload arrives and one for the render after it.
        expect(mockArcBuilds).toBeLessThanOrEqual(RAILS.length * 2);
        mockArcBuilds = 0;
        commits.length = 0;

        // Act — a dozen pointer events across two chains on two rails.
        for (let crossing = 0; crossing < 6; crossing += 1) {
            hoverArc(container, 'notes', CHAIN_NOTE_ID, 200 + crossing);
            hoverArc(container, 'ideas', IDEA_ID, 300 + crossing);
        }
        fireEvent.pointerLeave(svgOf(container));

        // Assert — React ran, and not one curve was recomputed.
        expect(commits.length).toBeGreaterThan(0);
        expect(mockArcBuilds).toBe(0);
    });

    test('leaves the arcs and stems in the DOM it built them in', async () => {
        // Arrange — the highlight is written onto the DOM and resolved in CSS
        // precisely so that a pointer crossing a dense rail does not reconcile
        // a few thousand elements. If hovering re-created them, this page would
        // be unusable long before it was visibly wrong.
        const { container } = await mount();
        const before = arcGroupOf(container, 'notes', CHAIN_NOTE_ID)
            .querySelector('.overview-arc');

        // Act
        hoverArc(container, 'notes', CHAIN_NOTE_ID);
        hoverArc(container, 'ideas', IDEA_ID);

        // Assert — the same node, not an equal one.
        expect(arcGroupOf(container, 'notes', CHAIN_NOTE_ID).querySelector('.overview-arc'))
            .toBe(before);
    });
});

describe('clicking a chain', () => {
    test('opens the note it belongs to, with its body', async () => {
        // Arrange
        const { container } = await mount();

        // Act
        await act(async () => {
            clickArc(container, 'notes', CHAIN_NOTE_ID);
        });

        // Assert
        const drawer = screen.getByTestId('overview-drawer');
        expect(drawer.querySelector('.overview-drawer-title')).toHaveTextContent(CHAIN_TITLE);

        // The body is markdown, rendered — not printed as its source. Scoped to
        // the body, since the drawer heading is an <h2> of its own.
        const body = drawer.querySelector('.overview-drawer-body');
        expect(body.querySelector('h2')).toHaveTextContent('In the beginning');
        expect(body.querySelector('em')).toHaveTextContent('markdown');
    });

    test('fetches the body it needs rather than carrying it in the payload', async () => {
        // Arrange — /api/overview is every note the reader owns, and a body has
        // no bound on its length. One is fetched when one is opened.
        const { container } = await mount();
        expect(global.fetch.mock.calls.some(([url]) => /\/notes\/\d+/.test(String(url))))
            .toBe(false);

        // Act
        await act(async () => {
            clickArc(container, 'notes', CHAIN_NOTE_ID);
        });

        // Assert
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining(`/notes/${CHAIN_NOTE_ID}`),
            expect.anything()
        );
    });

    test('lists the note references', async () => {
        // Arrange
        const { container } = await mount();

        // Act
        await act(async () => {
            clickArc(container, 'notes', CHAIN_NOTE_ID);
        });

        // Assert
        const listed = [...screen.getByTestId('overview-drawer')
            .querySelectorAll('.overview-drawer-item')]
            .map(row => row.textContent);
        expect(listed).toEqual(CHAIN_REFERENCES.map(([, bookId]) => `Book ${bookId} 2:1–3`));
    });

    test('opens an idea, with its body and the notes it gathers', async () => {
        // Arrange — the same drawer, filled by the idea endpoint. What hangs
        // below an idea is notes, and each of them is somewhere to go.
        const { container } = await mount();

        // Act
        await act(async () => {
            clickArc(container, 'ideas', IDEA_ID);
        });

        // Assert
        const drawer = screen.getByTestId('overview-drawer');
        expect(drawer.querySelector('.overview-drawer-title')).toHaveTextContent(IDEA_TITLE);
        expect(drawer.querySelector('.overview-drawer-rail')).toHaveTextContent('idea');
        expect(drawer.querySelector('.overview-drawer-body em')).toHaveTextContent('threaded');
        expect(drawer.querySelector('.overview-drawer-heading')).toHaveTextContent('Notes');

        expect(screen.getByRole('link', { name: CHAIN_TITLE }))
            .toHaveAttribute('href', `/analyze?l=1.2&note=${CHAIN_NOTE_ID}`);
    });

    test('opens a topic, with its description and the ideas filed under it', async () => {
        // Arrange — a topic's description is a plain field on /topics, so it
        // is printed rather than rendered as markdown here.
        const { container } = await mount();

        // Act
        await act(async () => {
            clickArc(container, 'topics', TOPIC_ID);
        });

        // Assert
        const drawer = screen.getByTestId('overview-drawer');
        expect(drawer.querySelector('.overview-drawer-title')).toHaveTextContent(TOPIC_NAME);
        expect(drawer.querySelector('.overview-drawer-body'))
            .toHaveTextContent('Everything filed under faith.');
        expect(drawer.querySelector('.overview-drawer-heading')).toHaveTextContent('Ideas');

        // An idea has no page of its own, so its row leads to the tree.
        expect(screen.getByRole('link', { name: IDEA_TITLE }))
            .toHaveAttribute('href', `/topics-tree?topic=${TOPIC_ID}&idea=${IDEA_ID}`);
    });

    test('offers to narrow the whole diagram to the topic it opened', async () => {
        // Arrange — the plan's filter-to-one-topic, reachable from the diagram
        // itself rather than only by editing the URL.
        const { container } = await mount();

        // Act
        await act(async () => {
            clickArc(container, 'topics', TOPIC_ID);
        });

        // Assert
        expect(screen.getByRole('link', { name: /show only this topic/i }))
            .toHaveAttribute('href', `/overview?topicId=${TOPIC_ID}`);
    });

    test('reads the right endpoint for the rail that was clicked', async () => {
        // Arrange — three tiers, three endpoints, and an id that means a
        // different row in each.
        const { container } = await mount();

        // Act
        await act(async () => {
            clickArc(container, 'topics', TOPIC_ID);
        });

        // Assert
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining(`/topics/${TOPIC_ID}`),
            expect.anything()
        );
        expect(global.fetch).not.toHaveBeenCalledWith(
            expect.stringContaining(`/notes/${TOPIC_ID}`),
            expect.anything()
        );
    });

    test('links to Analyze at the reference nearest the point clicked', async () => {
        // Arrange — a chain runs the height of the canon, and the reader who
        // clicks its foot means the passage at its foot. Opening Analyze at the
        // note first reference instead would be right a quarter of the time
        // and look right every time.
        const { container } = await mount();
        const lastAnchor = CHAIN_ANCHORS[CHAIN_ANCHORS.length - 1];
        const lastStem = stemOf(container, 'notes', CHAIN_NOTE_ID, lastAnchor);

        // Act
        await act(async () => {
            clickArc(
                container,
                'notes',
                CHAIN_NOTE_ID,
                clientYForWorldY(Number(lastStem.getAttribute('y1')))
            );
        });

        // Assert — the last of the four references, not the first.
        const [, lastBookId] = CHAIN_REFERENCES[CHAIN_REFERENCES.length - 1];
        expect(screen.getByRole('link', { name: /open in analyze/i }))
            .toHaveAttribute('href', `/analyze?l=${lastBookId}.2&note=${CHAIN_NOTE_ID}`);
    });

    test('links at the top of the chain when the top of it is clicked', async () => {
        // Arrange — the same gesture at the other end of the same arc has to
        // give a different answer, or the nearest-anchor rule is not being
        // applied at all.
        const { container } = await mount();
        const firstStem = stemOf(container, 'notes', CHAIN_NOTE_ID, CHAIN_ANCHORS[0]);

        // Act
        await act(async () => {
            clickArc(
                container,
                'notes',
                CHAIN_NOTE_ID,
                clientYForWorldY(Number(firstStem.getAttribute('y1')))
            );
        });

        // Assert
        const [, firstBookId] = CHAIN_REFERENCES[0];
        expect(screen.getByRole('link', { name: /open in analyze/i }))
            .toHaveAttribute('href', `/analyze?l=${firstBookId}.2&note=${CHAIN_NOTE_ID}`);
    });

    test('links a topic to the chapter it was clicked at, and opens no note', async () => {
        // Arrange — a topic has no editor on the Analyze page, so its link
        // positions the panel and stops there.
        const { container } = await mount();
        const lastAnchor = CHAIN_ANCHORS[CHAIN_ANCHORS.length - 1];
        const lastStem = stemOf(container, 'topics', TOPIC_ID, lastAnchor);

        // Act
        await act(async () => {
            clickArc(
                container,
                'topics',
                TOPIC_ID,
                clientYForWorldY(Number(lastStem.getAttribute('y1')))
            );
        });

        // Assert
        const [, lastBookId] = CHAIN_REFERENCES[CHAIN_REFERENCES.length - 1];
        expect(screen.getByRole('link', { name: /open in analyze/i }))
            .toHaveAttribute('href', `/analyze?l=${lastBookId}.2`);
    });

    test('keeps the open group lit once the pointer has moved off it', async () => {
        // Arrange
        const { container } = await mount();

        // Act
        await act(async () => {
            clickArc(container, 'notes', CHAIN_NOTE_ID);
        });
        fireEvent.pointerLeave(svgOf(container));

        // Assert — the reader is reading about this note; the diagram should
        // still be showing them which one.
        expect(arcGroupOf(container, 'notes', CHAIN_NOTE_ID)).toHaveAttribute('data-active');
    });

    test('does not open anything when the reader was panning', async () => {
        // Arrange — a drag that begins on an arc and ends somewhere else is a
        // pan. The browser still fires a click at the end of it.
        const { container } = await mount();
        const clientX = SVG_BOX.left + 300;

        // Act
        await act(async () => {
            fireEvent.pointerDown(hitPathOf(container, 'notes', CHAIN_NOTE_ID), {
                pointerId: 1, clientX, clientY: 200, button: 0,
            });
            fireEvent.pointerMove(svgOf(container), { pointerId: 1, clientX, clientY: 320 });
            fireEvent.pointerUp(svgOf(container), { pointerId: 1, clientX, clientY: 320 });
            fireEvent.click(svgOf(container), { clientX, clientY: 320 });
        });

        // Assert
        expect(screen.queryByTestId('overview-drawer')).not.toBeInTheDocument();
    });

    test('does not open anything when the click was on empty space', async () => {
        // Arrange
        const { container } = await mount();

        // Act
        await act(async () => {
            fireEvent.pointerDown(svgOf(container), {
                pointerId: 1, clientX: 60, clientY: 200, button: 0,
            });
            fireEvent.click(svgOf(container), { clientX: 60, clientY: 200 });
        });

        // Assert
        expect(screen.queryByTestId('overview-drawer')).not.toBeInTheDocument();
    });

    test('closes on the close button', async () => {
        // Arrange
        const { container } = await mount();
        await act(async () => {
            clickArc(container, 'notes', CHAIN_NOTE_ID);
        });

        // Act
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /close details/i }));
        });

        // Assert
        expect(screen.queryByTestId('overview-drawer')).not.toBeInTheDocument();
        expect(svgOf(container)).not.toHaveAttribute('data-focused');
    });

    test('closes on Escape', async () => {
        // Arrange — the reader focus is wherever the click left it, which is
        // inside the drawing, so the listener is on the document.
        const { container } = await mount();
        await act(async () => {
            clickArc(container, 'notes', CHAIN_NOTE_ID);
        });

        // Act
        await act(async () => {
            fireEvent.keyDown(document, { key: 'Escape' });
        });

        // Assert
        expect(screen.queryByTestId('overview-drawer')).not.toBeInTheDocument();
    });

    test('shows the title and references it already has when the body fails', async () => {
        // Arrange — the drawer opens from the overview payload, which it has,
        // and the body arrives separately. Losing the body must not lose the
        // rest.
        respondToDetail = failWith(500);
        const { container } = await mount();

        // Act
        await act(async () => {
            clickArc(container, 'notes', CHAIN_NOTE_ID);
        });

        // Assert
        const drawer = screen.getByTestId('overview-drawer');
        expect(drawer).toHaveTextContent(CHAIN_TITLE);
        expect(drawer).toHaveTextContent('Book 1 2:1–3');
        expect(drawer).toHaveTextContent(/server ran into a problem/i);
    });
});

describe('when the canon cannot be loaded', () => {
    test('says so rather than drawing an empty axis', async () => {
        // Arrange
        respond = failWith(500);

        // Act
        await mount();

        // Assert
        expect(await screen.findByRole('alert')).toHaveTextContent(/server ran into a problem/i);
    });

    test('says so when scripture has never been imported', async () => {
        // Arrange — a 503 from /api/books means the importer has not run.
        respond = failWith(503);

        // Act
        const { container } = await mount();

        // Assert
        expect(await screen.findByRole('alert')).toHaveTextContent(/not available yet/i);
        expect(container.querySelectorAll('.overview-book-tick')).toHaveLength(0);
    });
});

// ─── 6e: search ─────────────────────────────────────────────────────────────
//
// The plan's wording is "filter to matching arcs rather than hiding others
// outright", and the difference between those two is the whole of what these
// tests exist to hold. A search that removed the unmatched arcs would look
// tidier and pass any assertion about what is lit; what it would destroy is
// the only thing this page has to say, which is where a chain falls in
// relation to everything else. So every test below that asserts something is
// dimmed also asserts it is still there.

// Long enough for the box's debounce to settle and the URL to catch up.
const SEARCH_SETTLE_MS = SEARCH_DEBOUNCE_MS + 80;

const settleFor = async (ms) => {
    await act(async () => {
        await new Promise(resolve => { setTimeout(resolve, ms); });
    });
};

const searchBox = () => screen.getByLabelText('Filter by title');

const searchFor = async (text) => {
    fireEvent.change(searchBox(), { target: { value: text } });
    await settleFor(SEARCH_SETTLE_MS);
};

const isMatched = (element) => element.hasAttribute('data-match');

describe('searching the diagram', () => {
    test('lights the groups whose title contains the term, on every rail', async () => {
        // Arrange
        const { container } = await mount();

        // Act
        await searchFor('faith');

        // Assert — note 9 "Justified by faith", idea 3 "Faith as a thread" and
        // topic 1 "Faith", each matched on its own title.
        expect(isMatched(arcGroupOf(container, 'notes', 9))).toBe(true);
        expect(isMatched(arcGroupOf(container, 'ideas', IDEA_ID))).toBe(true);
        expect(isMatched(arcGroupOf(container, 'topics', TOPIC_ID))).toBe(true);
    });

    test('dims the unrelated arcs on every visible rail without removing one', async () => {
        // Arrange
        const { container } = await mount();
        const before = RAILS.map(rail => arcsOn(container, rail.key).length);

        // Act — a topic's name, which the notes rail's other chain does not
        // answer to.
        await searchFor(TOPIC_NAME);

        // Assert: the diagram says a search is running, the unrelated chain is
        // not among what it lit …
        expect(svgOf(container)).toHaveAttribute('data-searching');
        expect(isMatched(arcGroupOf(container, 'notes', CHAIN_NOTE_ID))).toBe(false);

        // … and every arc that was on the page is still on it. Dimming is a
        // filter; removing would take each chain's position away with it.
        expect(RAILS.map(rail => arcsOn(container, rail.key).length)).toEqual(before);
    });

    test('lights a matched chain’s stems along with its arcs', async () => {
        // Arrange
        const { container } = await mount();

        // Act
        await searchFor('justified');

        // Assert — the same rule the hover highlight follows: a group is its
        // whole structure, not only the curve.
        expect(isMatched(stemOf(container, 'notes', 9, 1))).toBe(true);
        expect(isMatched(stemOf(container, 'notes', CHAIN_NOTE_ID, CHAIN_ANCHORS[0]))).toBe(false);
    });

    test('puts everything back when the box is cleared', async () => {
        // Arrange
        const { container } = await mount();
        await searchFor('faith');

        // Act
        await searchFor('');

        // Assert
        expect(svgOf(container)).not.toHaveAttribute('data-searching');
        expect(arcGroupOf(container, 'notes', 9)).not.toHaveAttribute('data-match');
    });

    test('does not leave the previous term’s highlight behind', async () => {
        // Arrange
        const { container } = await mount();
        await searchFor('justified');

        // Act
        await searchFor('creation');

        // Assert — the marks are written onto the DOM, so the record of what
        // was marked has to survive from one term to the next. Overview.js
        // composes four callback refs onto this one <svg>, and a ref whose
        // identity changed per keystroke would detach the element from all
        // four, dropping that record while the marks stayed on the elements.
        // See useArcSearch.
        expect(isMatched(arcGroupOf(container, 'notes', 9))).toBe(false);
        // And the new term did land: idea 4 is "Creation", whose one note has
        // a single reference and so a stem but no chain to draw.
        expect(isMatched(stemOf(container, 'ideas', OTHER_IDEA_ID, TOTAL_VERSES))).toBe(true);
    });

    test('treats a box holding only spaces as no search at all', async () => {
        // Arrange
        const { container } = await mount();

        // Act
        await searchFor('   ');

        // Assert: dimming the whole diagram over a stray space helps nobody.
        expect(svgOf(container)).not.toHaveAttribute('data-searching');
    });

    test('says so when a term names nothing, rather than leaving a blank page', async () => {
        // Arrange
        const { container } = await mount();

        // Act
        await searchFor('nothing is called this');

        // Assert — every arc dimmed is the honest answer here, and it looks
        // exactly like a page that has lost its data. The status line is what
        // tells the two apart.
        expect(svgOf(container)).toHaveAttribute('data-searching');
        expect(screen.getByRole('status')).toHaveTextContent(/nothing on the diagram is called/i);
    });

    test('reports how much of what is drawn matched', async () => {
        // Arrange
        const { container } = await mount();

        // Act
        await searchFor('faith');

        // Assert
        expect(svgOf(container)).toHaveAttribute('data-searching');
        expect(screen.getByRole('status')).toHaveTextContent(/3 of \d+ highlighted/i);
    });

    test('writes the term into the URL so a filtered view is a link', async () => {
        // Arrange
        await mount();

        // Act
        await searchFor('faith');

        // Assert
        expect(searchOf()).toContain('q=faith');
    });

    test('drops the param again when the box is cleared', async () => {
        // Arrange
        await mount();
        await searchFor('faith');

        // Act
        await searchFor('');

        // Assert: a URL carries the reader's departures from the default, not
        // the default itself.
        expect(searchOf()).not.toContain('q=');
    });

    test('arrives already filtered from a link carrying the term', async () => {
        // Arrange / Act
        const { container } = await mount('/overview?q=faith');
        await settleFor(SEARCH_SETTLE_MS);

        // Assert — the box shows it and the drawing is marked by it.
        expect(searchBox()).toHaveValue('faith');
        expect(svgOf(container)).toHaveAttribute('data-searching');
        expect(isMatched(arcGroupOf(container, 'topics', TOPIC_ID))).toBe(true);
    });

    test('keeps the rails a URL asked for while it filters them', async () => {
        // Arrange / Act
        const { container } = await mount('/overview?tiers=notes&q=faith');
        await settleFor(SEARCH_SETTLE_MS);

        // Assert
        expect(arcsOn(container, 'ideas')).toHaveLength(0);
        expect(isMatched(arcGroupOf(container, 'notes', 9))).toBe(true);
    });

    test('filters a rail switched back on while the search is running', async () => {
        // Arrange
        const { container } = await mount('/overview?tiers=notes');
        await searchFor('faith');

        // Act
        await act(async () => {
            fireEvent.click(screen.getByLabelText('ideas'));
        });

        // Assert — the rail arrives filtered rather than at full strength,
        // which is why the search follows the geometry and not only the term.
        expect(isMatched(arcGroupOf(container, 'ideas', IDEA_ID))).toBe(true);
        expect(searchOf()).toContain('q=faith');
    });

    test('keeps the topic filter and the term in the URL together', async () => {
        // Arrange
        await mount(`/overview?topicId=${TOPIC_ID}`);

        // Act
        await searchFor('faith');

        // Assert: the two filters narrow along different axes and compose.
        expect(searchOf()).toContain(`topicId=${TOPIC_ID}`);
        expect(searchOf()).toContain('q=faith');
    });

    test('asks the server nothing while the reader types', async () => {
        // Arrange
        await mount();
        const before = overviewRequests.length;

        // Act
        await searchFor('faith');
        await searchFor('faithful');

        // Assert — the term is matched against the payload already in hand, so
        // the request path never moves and a keystroke costs nothing on the
        // wire. See useOverviewData for why that path is built from the tiers
        // and the topic alone.
        expect(overviewRequests).toHaveLength(before);
    });

    test('lets a hover pick one chain out of what the search dimmed', async () => {
        // Arrange
        const { container } = await mount();
        await searchFor('faith');

        // Act — hovering a chain the search did NOT match.
        hoverArc(container, 'notes', CHAIN_NOTE_ID);

        // Assert: the two states are independent and hover wins, so a reader
        // can still ask "what is that one?" about something they filtered out.
        expect(svgOf(container)).toHaveAttribute('data-focused');
        expect(arcGroupOf(container, 'notes', CHAIN_NOTE_ID)).toHaveAttribute('data-active');
        expect(svgOf(container)).toHaveAttribute('data-searching');
    });

    test('still opens the drawer for a chain while a search is running', async () => {
        // Arrange
        const { container } = await mount();
        await searchFor('faith');

        // Act
        await act(async () => { clickArc(container, 'notes', CHAIN_NOTE_ID); });

        // Assert
        expect(await screen.findByText(CHAIN_TITLE)).toBeInTheDocument();
    });

    test('does not rebuild any rail geometry when the term changes', async () => {
        // Arrange
        await mount();
        const builtOnLoad = mockArcBuilds;

        // Act
        await searchFor('faith');

        // Assert — the search is two attributes and a CSS rule, exactly like
        // the hover highlight. A prop on TierArcs would re-reconcile every
        // path on the page per settled keystroke.
        expect(mockArcBuilds).toBe(builtOnLoad);
    });
});

// ─── 6e: magnify ────────────────────────────────────────────────────────────
//
// The plan offers "a fisheye on the axis, or simpler, a zoom-to-region on
// drag", and this is the second. What makes it the cheap one is that it
// produces nothing new — a scale and a translation, the same pair a wheel notch
// produces — so the thing to hold is that everything already written to keep
// the page correct under zoom keeps it correct under this.

// jsdom runs a real animation-frame loop, so the flight to a region is left to
// fly and simply waited out. Comfortably longer than ZOOM_ANIMATION_MS.
const FLIGHT_MS = 600;

const shiftDragTo = (container, fromWorldY, toWorldY, { release = true } = {}) => {
    const svg = svgOf(container);
    const clientX = SVG_BOX.left + 300;

    fireEvent.pointerDown(svg, {
        pointerId: 7,
        button: 0,
        shiftKey: true,
        clientX,
        clientY: clientYForWorldY(fromWorldY),
    });
    fireEvent.pointerMove(svg, {
        pointerId: 7,
        clientX,
        clientY: clientYForWorldY(toWorldY),
    });

    if (release) {
        fireEvent.pointerUp(svg, {
            pointerId: 7,
            clientX,
            clientY: clientYForWorldY(toWorldY),
        });
    }
};

// Where a world y lands in the fitted box under the transform now on the scene.
const projectedY = (container, worldY) =>
    worldY * scaleOf(container) + translationOf(container).y;

const bandOf = (container) => container.querySelector('[data-testid="overview-zoom-band"]');

describe('zooming to a dragged region', () => {
    test('draws a band down the axis while the reader drags', async () => {
        // Arrange
        const { container } = await mount();

        // Act
        shiftDragTo(container, 300, 400, { release: false });

        // Assert
        const band = bandOf(container);
        expect(band).toHaveAttribute('data-active');
        expect(Number(band.getAttribute('y'))).toBeCloseTo(300, 6);
        expect(Number(band.getAttribute('height'))).toBeCloseTo(100, 6);
    });

    test('draws the same band for a drag pulled upwards', async () => {
        // Arrange
        const { container } = await mount();

        // Act
        shiftDragTo(container, 400, 300, { release: false });

        // Assert
        expect(Number(bandOf(container).getAttribute('y'))).toBeCloseTo(300, 6);
        expect(Number(bandOf(container).getAttribute('height'))).toBeCloseTo(100, 6);
    });

    test('spans the whole width, because the gesture selects a range of canon', async () => {
        // Arrange / Act
        const { container } = await mount();

        // Assert: there is nothing to magnify sideways, so a band that narrowed
        // would be offering a choice the zoom cannot honour.
        expect(Number(bandOf(container).getAttribute('width'))).toBe(WORLD.width);
    });

    test('does not pan while the band is being pulled', async () => {
        // Arrange
        const { container } = await mount();

        // Act
        shiftDragTo(container, 300, 400, { release: false });

        // Assert — plain drag still means pan; the modifier is what makes this
        // gesture stateless, and neither hook knows the other exists.
        expect(translationOf(container)).toEqual({ x: 0, y: 0 });
        expect(scaleOf(container)).toBe(MIN_SCALE);
    });

    test('stops the arcs answering the pointer while the band is being pulled', async () => {
        // Arrange
        const { container } = await mount();

        // Act
        shiftDragTo(container, 300, 400, { release: false });

        // Assert: dragging across a dense rail would otherwise trail a tooltip
        // behind the marquee and light a different chain every few pixels.
        expect(svgOf(container)).toHaveAttribute('data-selecting');
    });

    test('flies rather than cuts to the range, so the reader can follow it', async () => {
        // Arrange
        const { container } = await mount();

        // Act
        shiftDragTo(container, 300, 400);

        // Assert — nothing has moved by the time the release returns: a hard
        // jump from the whole canon to a tenth of it leaves nobody any way to
        // tell what they are now looking at.
        expect(scaleOf(container)).toBe(MIN_SCALE);
    });

    test('lands with the selected range filling the viewport', async () => {
        // Arrange
        const { container } = await mount();

        // Act
        shiftDragTo(container, 300, 400);
        await settleFor(FLIGHT_MS);

        // Assert
        expect(scaleOf(container)).toBeCloseTo(WORLD.height / 100, 4);
        expect(projectedY(container, 300)).toBeCloseTo(0, 3);
        expect(projectedY(container, 400)).toBeCloseTo(WORLD.height, 3);
    });

    test('keeps strokes and labels at their drawn size in the new view', async () => {
        // Arrange
        const { container } = await mount();

        // Act
        shiftDragTo(container, 300, 400);
        await settleFor(FLIGHT_MS);

        // Assert — the flight writes the transform through the same path a
        // wheel notch does, so the counter-scale that holds every stroke and
        // every label still is published for it too.
        const svg = svgOf(container);
        expect(Number(svg.style.getPropertyValue('--ov-inverse-scale')))
            .toBeCloseTo(1 / scaleOf(container), 8);
        expect(svg.getAttribute('data-detail-tier')).not.toBe('0');
    });

    test('brings the chapter detail in as the flight arrives', async () => {
        // Arrange
        const { container } = await mount();

        // Act — a range far past the chapter threshold.
        shiftDragTo(container, 300, 320);
        await settleFor(FLIGHT_MS);

        // Assert: the one thing about a zoom that cannot be done without React.
        expect(scaleOf(container)).toBeGreaterThanOrEqual(CHAPTER_ZOOM_THRESHOLD);
        expect(container.querySelectorAll('.overview-chapter-tick').length).toBeGreaterThan(0);
    });

    test('puts the band away once the flight has been asked for', async () => {
        // Arrange
        const { container } = await mount();

        // Act
        shiftDragTo(container, 300, 400);
        await settleFor(FLIGHT_MS);

        // Assert
        expect(bandOf(container)).not.toHaveAttribute('data-active');
        expect(svgOf(container)).not.toHaveAttribute('data-selecting');
    });

    test('ignores a shift-click that never became a drag', async () => {
        // Arrange
        const { container } = await mount();

        // Act — shorter than the band a gesture has to reach.
        shiftDragTo(container, 300, 300 + MIN_REGION_SPAN / 2);
        await settleFor(FLIGHT_MS);

        // Assert: obeying a slip of the hand would fly to the ceiling zoom
        // somewhere the reader never chose, which is the one outcome of this
        // feature that is hard to recover from.
        expect(scaleOf(container)).toBe(MIN_SCALE);
        expect(translationOf(container)).toEqual({ x: 0, y: 0 });
    });

    test('flies nowhere when the pointer is cancelled mid-drag', async () => {
        // Arrange
        const { container } = await mount();
        const svg = svgOf(container);

        // Act
        shiftDragTo(container, 300, 400, { release: false });
        fireEvent.pointerCancel(svg, { pointerId: 7 });
        await settleFor(FLIGHT_MS);

        // Assert — the reader never let go, so they never said where.
        expect(scaleOf(container)).toBe(MIN_SCALE);
        expect(bandOf(container)).not.toHaveAttribute('data-active');
    });

    test('does not open the drawer on a shift-drag that began on a chain', async () => {
        // Arrange
        const { container } = await mount();
        const clientX = SVG_BOX.left + 300;

        // Act
        fireEvent.pointerDown(hitPathOf(container, 'notes', CHAIN_NOTE_ID), {
            pointerId: 7,
            button: 0,
            shiftKey: true,
            clientX,
            clientY: clientYForWorldY(300),
        });
        fireEvent.pointerUp(svgOf(container), {
            pointerId: 7,
            clientX,
            clientY: clientYForWorldY(300),
        });
        fireEvent.click(svgOf(container), { clientX, clientY: clientYForWorldY(300) });
        await settleFor(FLIGHT_MS);

        // Assert: a short shift-drag would otherwise land inside the click slop
        // and open a drawer on top of the view it had just flown to.
        expect(screen.queryByText(CHAIN_TITLE)).not.toBeInTheDocument();
    });

    test('takes the whole canon back when the reader resets the view', async () => {
        // Arrange
        const { container } = await mount();
        shiftDragTo(container, 300, 400);
        await settleFor(FLIGHT_MS);

        // Act
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /reset view/i }));
        });

        // Assert — fit all, immediately: an escape hatch that takes a third of
        // a second to open is one you press twice.
        expect(scaleOf(container)).toBe(MIN_SCALE);
        expect(translationOf(container)).toEqual({ x: 0, y: 0 });
    });

    test('lets a wheel notch take over from a flight already under way', async () => {
        // Arrange
        const { container } = await mount();

        // Act — interrupt before the flight has landed.
        shiftDragTo(container, 300, 400);
        wheelOver(container, -100);
        await settleFor(FLIGHT_MS);

        // Assert: the reader steering by hand outranks a flight, and nothing
        // keeps writing the transform behind them.
        const afterInterruption = scaleOf(container);
        await settleFor(FLIGHT_MS);
        expect(scaleOf(container)).toBe(afterInterruption);
        expect(afterInterruption).toBeLessThan(WORLD.height / 100);
    });

    test('still pans on a plain drag once a region zoom has landed', async () => {
        // Arrange
        const { container } = await mount();
        shiftDragTo(container, 300, 400);
        await settleFor(FLIGHT_MS);
        const before = translationOf(container);

        // Act
        const svg = svgOf(container);
        fireEvent.pointerDown(svg, { pointerId: 9, button: 0, clientX: 100, clientY: 200 });
        fireEvent.pointerMove(svg, { pointerId: 9, clientX: 100, clientY: 260 });
        fireEvent.pointerUp(svg, { pointerId: 9, clientX: 100, clientY: 260 });

        // Assert
        expect(translationOf(container).y).toBeGreaterThan(before.y);
    });

    test('leaves a running search filtering the view it flew to', async () => {
        // Arrange
        const { container } = await mount();
        await searchFor('faith');

        // Act
        shiftDragTo(container, 300, 400);
        await settleFor(FLIGHT_MS);

        // Assert: the flight is a transform, so nothing it does can reach the
        // attributes the search wrote.
        expect(svgOf(container)).toHaveAttribute('data-searching');
        expect(isMatched(arcGroupOf(container, 'topics', TOPIC_ID))).toBe(true);
    });

    test('does not rebuild any rail geometry to fly', async () => {
        // Arrange
        const { container } = await mount();
        const builtOnLoad = mockArcBuilds;

        // Act
        shiftDragTo(container, 300, 400);
        await settleFor(FLIGHT_MS);

        // Assert — a magnify that re-derived the drawing per frame is the cost
        // the fisheye was rejected for; this one is the transform and nothing
        // else.
        expect(mockArcBuilds).toBe(builtOnLoad);
    });
});
