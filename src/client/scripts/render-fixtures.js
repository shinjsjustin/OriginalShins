// Canned API answers for the headless render script. Stateful only where a
// state needs it: saving an answer is echoed back and kept for the next read.

const FIXTURE_BOOKS = { JOHN: 43, PSALMS: 19, ROMANS: 45 };

const keys = [
    { id: 1, name: 'My GPT', hint: 'a1b2', createdAt: '2026-10-02T15:04:00.000Z', lastUsedAt: '2026-11-17T09:30:00.000Z' },
    { id: 2, name: 'Study notebook', hint: 'c3d4', createdAt: '2026-11-05T18:20:00.000Z', lastUsedAt: null },
];

const NEW_KEY_SECRET = 'scr_9f8e7d6c5b4a39281706f5e4d3c2b1a0';

const noAnswer = null;
const block = (id, position, kind, body, extra = {}) => ({
    id, position, kind, body, reference: null, answer: noAnswer, ...extra,
});

const buildScrolls = () => [
    {
        id: 1,
        title: 'Born again',
        passage: { bookId: FIXTURE_BOOKS.JOHN, bookName: 'John', startChapter: 3, startVerse: 1, endChapter: 3, endVerse: 21 },
        createdAt: '2026-11-15T12:00:00.000Z',
        updatedAt: '2026-11-15T12:00:00.000Z',
        blocks: [
            block(11, 0, 'note', 'Nicodemus comes **by night**, a teacher of Israel who still has questions.'),
            block(12, 1, 'question', 'Why does Jesus answer a question about signs with talk of birth?'),
            block(13, 2, 'reference', 'The same word for wind and spirit appears here.', {
                reference: { bookId: FIXTURE_BOOKS.JOHN, chapter: 3, startVerse: 8, endVerse: 8 },
            }),
            block(14, 3, 'idea', 'Belief in this chapter is something received before it is something done.'),
            block(15, 4, 'question', 'What does it mean to you that God loved the world?', {
                answer: {
                    text: 'It means the invitation is wider than I tend to assume.',
                    answeredAt: '2026-11-16T08:00:00.000Z',
                    updatedAt: '2026-11-16T08:00:00.000Z',
                },
            }),
        ],
    },
    {
        id: 2,
        title: 'The shepherd psalm',
        passage: { bookId: FIXTURE_BOOKS.PSALMS, bookName: 'Psalms', startChapter: 23, startVerse: 1, endChapter: 23, endVerse: null },
        createdAt: '2026-11-10T12:00:00.000Z',
        updatedAt: '2026-11-10T12:00:00.000Z',
        blocks: [
            block(21, 0, 'note', 'A psalm of David, spoken in the first person.'),
            block(22, 1, 'question', 'Where in your week is the valley of the shadow?'),
        ],
    },
    {
        id: 3,
        title: 'Justified by faith',
        passage: { bookId: FIXTURE_BOOKS.ROMANS, bookName: 'Romans', startChapter: 4, startVerse: 1, endChapter: 5, endVerse: 11 },
        createdAt: '2026-10-28T12:00:00.000Z',
        updatedAt: '2026-10-28T12:00:00.000Z',
        blocks: [block(31, 0, 'note', 'Abraham is the test case Paul chooses.')],
    },
];

const toSummary = ({ blocks, ...scroll }) => {
    const questions = blocks.filter((b) => b.kind === 'question');
    return {
        ...scroll,
        blockCount: blocks.length,
        questionCount: questions.length,
        answeredCount: questions.filter((b) => b.answer).length,
    };
};

const createFixtureApi = () => {
    const scrolls = buildScrolls();

    // Resolves to { status, body } for an /api path (the prefix already stripped).
    return (method, path, body) => {
        if (method === 'GET' && path === '/keys') return { status: 200, body: { keys } };
        if (method === 'POST' && path === '/keys') {
            return { status: 201, body: { key: { ...keys[0], id: 3, name: body.name }, secret: NEW_KEY_SECRET } };
        }
        if (method === 'GET' && path === '/scrolls') return { status: 200, body: { scrolls: scrolls.map(toSummary) } };

        const scrollMatch = path.match(/^\/scrolls\/(\d+)$/);
        if (method === 'GET' && scrollMatch) {
            const scroll = scrolls.find((s) => s.id === Number(scrollMatch[1]));
            return scroll
                ? { status: 200, body: { scroll: { ...toSummary(scroll), blocks: scroll.blocks } } }
                : { status: 404, body: { error: 'Not found' } };
        }

        const answerMatch = path.match(/^\/scrolls\/(\d+)\/blocks\/(\d+)\/answer$/);
        if (method === 'PUT' && answerMatch) {
            const scroll = scrolls.find((s) => s.id === Number(answerMatch[1]));
            const found = scroll && scroll.blocks.find((b) => b.id === Number(answerMatch[2]));
            if (!found) return { status: 404, body: { error: 'Not found' } };
            const now = '2026-11-19T10:00:00.000Z';
            found.answer = { text: body.answer, answeredAt: now, updatedAt: now };
            return { status: 200, body: { block: found } };
        }

        return { status: 404, body: { error: 'Not found' } };
    };
};

module.exports = { createFixtureApi };
