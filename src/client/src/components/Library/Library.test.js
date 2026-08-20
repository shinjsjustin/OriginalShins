import React from 'react';
import { act, render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import IdeasPage from './IdeasPage';
import TopicsPage from './TopicsPage';

// ─── A standing-in ideas/topics API ─────────────────────────────────────────
//
// Stateful for the same reason the Analyze suite's mock is: the flows worth
// testing are round trips. Checking a topic on an idea must produce a link the
// SERVER reports back on the next list fetch — a canned response would let a
// client-side guess pass — and the counts the topics list shows are derived
// from the link table exactly as the SQL derives them.

let store;

const resetStore = () => {
    store = { topics: [], ideas: [], ideaTopics: [], nextTopicId: 1, nextIdeaId: 1 };
};

// The server derives the slug from the name and refuses a repeat per user.
const slugify = (value) => String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const topicsOf = (ideaId) => store.ideaTopics
    .filter(link => link.ideaId === ideaId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(link => {
        const topic = store.topics.find(item => item.id === link.topicId);
        return { id: topic.id, name: topic.name, slug: topic.slug };
    });

// Counts walk topic -> idea -> note, the same two joins the list query makes.
// The note tier is faked with a per-idea count, which is enough to prove the
// numbers reach the page and are not hard-coded there.
const NOTES_PER_IDEA = {};

const ideaCountOf = (topicId) => store.ideaTopics.filter(link => link.topicId === topicId).length;

const noteCountOf = (topicId) => store.ideaTopics
    .filter(link => link.topicId === topicId)
    .reduce((total, link) => total + (NOTES_PER_IDEA[link.ideaId] || 0), 0);

const hydrateTopic = (topic) => ({
    ...topic,
    ideaCount: ideaCountOf(topic.id),
    noteCount: noteCountOf(topic.id),
});

const hydrateIdea = (idea) => ({
    ...idea,
    topics: topicsOf(idea.id),
    noteCount: NOTES_PER_IDEA[idea.id] || 0,
});

const addTopic = ({ name, slug, description = '' }) => {
    const topic = {
        id: store.nextTopicId,
        name,
        slug: slug || slugify(name),
        description,
        sortOrder: store.topics.length,
    };
    store.nextTopicId += 1;
    store.topics = [...store.topics, topic];
    return topic;
};

const addIdea = ({ title, body = '' }) => {
    const idea = { id: store.nextIdeaId, title, body, sortOrder: store.ideas.length };
    store.nextIdeaId += 1;
    store.ideas = [...store.ideas, idea];
    return idea;
};

// The full-set replace, exactly as src/lib/links.js performs it.
const replaceIdeaTopics = (ideaId, topicIds) => {
    store.ideaTopics = [
        ...store.ideaTopics.filter(link => link.ideaId !== ideaId),
        ...topicIds.map((topicId, index) => ({ ideaId, topicId, sortOrder: index })),
    ];
};

const jsonResponse = (body, status = 200) => Promise.resolve({
    ok: true,
    status,
    json: () => Promise.resolve(body),
});

const noContent = () => Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve(null) });
const failure = (status) => Promise.resolve({ ok: false, status, json: () => Promise.resolve({}) });

let requests;

const handleRequest = (url, options = {}) => {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;
    requests.push({ url, method, body });

    if (url.endsWith('/topics') && method === 'GET') {
        return jsonResponse({ topics: store.topics.map(hydrateTopic) });
    }

    if (url.endsWith('/topics') && method === 'POST') {
        const slug = body.slug || slugify(body.name);
        if (store.topics.some(topic => topic.slug === slug)) {
            return failure(409);
        }
        return jsonResponse({ topic: hydrateTopic(addTopic({ ...body, slug })) }, 201);
    }

    if (url.endsWith('/ideas') && method === 'GET') {
        return jsonResponse({ ideas: store.ideas.map(hydrateIdea) });
    }

    if (url.endsWith('/ideas') && method === 'POST') {
        return jsonResponse({ idea: hydrateIdea(addIdea(body)) }, 201);
    }

    const ideaTopics = /\/ideas\/(\d+)\/topics$/.exec(url);
    if (ideaTopics && method === 'PUT') {
        const ideaId = Number(ideaTopics[1]);
        replaceIdeaTopics(ideaId, body.topicIds);
        return jsonResponse({ idea: hydrateIdea(store.ideas.find(item => item.id === ideaId)) });
    }

    const topic = /\/topics\/(\d+)$/.exec(url);
    if (topic && method === 'PATCH') {
        const id = Number(topic[1]);
        store.topics = store.topics.map(item => (item.id === id ? { ...item, ...body } : item));
        return jsonResponse({ topic: hydrateTopic(store.topics.find(item => item.id === id)) });
    }

    if (topic && method === 'DELETE') {
        const id = Number(topic[1]);
        store.topics = store.topics.filter(item => item.id !== id);
        // Its links go with it; the ideas themselves survive as unfiled ideas.
        store.ideaTopics = store.ideaTopics.filter(link => link.topicId !== id);
        return noContent();
    }

    const idea = /\/ideas\/(\d+)$/.exec(url);
    if (idea && method === 'PATCH') {
        const id = Number(idea[1]);
        store.ideas = store.ideas.map(item => (item.id === id ? { ...item, ...body } : item));
        return jsonResponse({ idea: hydrateIdea(store.ideas.find(item => item.id === id)) });
    }

    if (idea && method === 'DELETE') {
        const id = Number(idea[1]);
        store.ideas = store.ideas.filter(item => item.id !== id);
        store.ideaTopics = store.ideaTopics.filter(link => link.ideaId !== id);
        return noContent();
    }

    return failure(404);
};

beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    resetStore();
    requests = [];
    global.fetch = jest.fn(handleRequest);
});

afterEach(async () => {
    // Let any request the last assertion did not wait on settle inside act(),
    // so a stray "not wrapped in act" warning cannot bury a real one.
    await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
    });

    jest.resetAllMocks();
    localStorage.clear();
    Object.keys(NOTES_PER_IDEA).forEach(key => { delete NOTES_PER_IDEA[key]; });
});

const mount = async (element) => {
    let result;
    await act(async () => {
        result = render(<MemoryRouter>{element}</MemoryRouter>);
    });
    return result;
};

const clickAndSettle = async (element) => {
    await act(async () => {
        fireEvent.click(element);
    });
};

const rows = (attribute) => Array.from(document.querySelectorAll(`[${attribute}]`));

const requestsMatching = (predicate) => requests.filter(predicate);

describe('Topics page', () => {
    test('derives the slug from the name as you type', async () => {
        // Arrange
        await mount(<TopicsPage />);

        // Act
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Faith & Works' } });

        // Assert
        expect(screen.getByLabelText('Slug')).toHaveValue('faith-works');
    });

    test('stops deriving once the slug is edited by hand', async () => {
        await mount(<TopicsPage />);

        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Faith' } });
        fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'trust' } });
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Faithfulness' } });

        // A slug can end up in a URL; rewriting one that was chosen by hand
        // would be the wrong kind of helpful.
        expect(screen.getByLabelText('Slug')).toHaveValue('trust');
    });

    test('creates a topic and clears the form for the next one', async () => {
        // Arrange
        await mount(<TopicsPage />);

        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Faith' } });
        fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Trusting God.' } });

        // Act
        await clickAndSettle(screen.getByRole('button', { name: 'Create topic' }));

        // Assert
        const posted = requestsMatching(r => r.method === 'POST');
        expect(posted).toHaveLength(1);
        expect(posted[0].body).toEqual({ name: 'Faith', slug: 'faith', description: 'Trusting God.' });

        await waitFor(() => expect(rows('data-topic-id')).toHaveLength(1));
        expect(screen.getByLabelText('Name')).toHaveValue('');
    });

    test('shows the idea and note counts the server reports', async () => {
        // Arrange — one topic holding two ideas, which between them hold five
        // notes. The page must print what the server computed, not a guess.
        const faith = addTopic({ name: 'Faith' });
        const abiding = addIdea({ title: 'Abiding' });
        const pruning = addIdea({ title: 'Pruning' });
        NOTES_PER_IDEA[abiding.id] = 3;
        NOTES_PER_IDEA[pruning.id] = 2;
        replaceIdeaTopics(abiding.id, [faith.id]);
        replaceIdeaTopics(pruning.id, [faith.id]);

        // Act
        await mount(<TopicsPage />);

        // Assert
        await waitFor(() => expect(rows('data-topic-id')).toHaveLength(1));
        expect(rows('data-topic-id')[0]).toHaveTextContent('2 ideas · 5 notes');
    });

    test('counts an empty topic as zero rather than hiding the numbers', async () => {
        addTopic({ name: 'Unused' });

        await mount(<TopicsPage />);

        await waitFor(() => expect(rows('data-topic-id')).toHaveLength(1));
        expect(rows('data-topic-id')[0]).toHaveTextContent('0 ideas · 0 notes');
    });

    test('edits a topic through a PATCH and closes the form', async () => {
        // Arrange
        addTopic({ name: 'Faith' });
        await mount(<TopicsPage />);
        await waitFor(() => expect(rows('data-topic-id')).toHaveLength(1));

        // Act
        await clickAndSettle(screen.getByRole('button', { name: 'Edit' }));
        fireEvent.change(screen.getAllByLabelText('Name')[1], { target: { value: 'Faithfulness' } });
        await clickAndSettle(screen.getByRole('button', { name: 'Save topic' }));

        // Assert
        const patched = requestsMatching(r => r.method === 'PATCH');
        expect(patched).toHaveLength(1);
        expect(patched[0].body.name).toBe('Faithfulness');
        await waitFor(() => expect(rows('data-topic-id')[0]).toHaveTextContent('Faithfulness'));
        expect(screen.queryByRole('button', { name: 'Save topic' })).not.toBeInTheDocument();
    });

    test('deletes a topic', async () => {
        addTopic({ name: 'Faith' });
        await mount(<TopicsPage />);
        await waitFor(() => expect(rows('data-topic-id')).toHaveLength(1));

        await clickAndSettle(screen.getByRole('button', { name: 'Delete Faith' }));

        await waitFor(() => expect(rows('data-topic-id')).toHaveLength(0));
    });

    test('reports a duplicate slug instead of silently renaming it', async () => {
        // Arrange
        addTopic({ name: 'Faith' });
        await mount(<TopicsPage />);
        await waitFor(() => expect(rows('data-topic-id')).toHaveLength(1));

        // Act — the same name again, which slugs to the same thing.
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Faith' } });
        await clickAndSettle(screen.getByRole('button', { name: 'Create topic' }));

        // Assert
        expect(await screen.findByRole('alert')).toHaveTextContent('You already have one of those');
        expect(rows('data-topic-id')).toHaveLength(1);
    });
});

describe('Ideas page', () => {
    const topicCheckbox = (name) => screen.getByRole('checkbox', { name });

    const topicLinkRequests = () => requestsMatching(r => r.method === 'PUT' && r.url.endsWith('/topics'));

    test('creates an idea with a title and a markdown body', async () => {
        // Arrange
        await mount(<IdeasPage />);

        fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Abiding' } });
        fireEvent.change(screen.getByLabelText('Body (markdown)'), { target: { value: '# Stay' } });

        // Act
        await clickAndSettle(screen.getByRole('button', { name: 'Create idea' }));

        // Assert
        const posted = requestsMatching(r => r.method === 'POST');
        expect(posted[0].body).toEqual({ title: 'Abiding', body: '# Stay' });
        await waitFor(() => expect(rows('data-idea-id')).toHaveLength(1));
    });

    test('renders an idea body as markdown, not as literal hashes', async () => {
        addIdea({ title: 'Abiding', body: '# Stay\n\nIn **me**.' });

        await mount(<IdeasPage />);

        await waitFor(() => expect(rows('data-idea-id')).toHaveLength(1));
        const row = rows('data-idea-id')[0];
        expect(row.querySelector('h1')).toHaveTextContent('Stay');
        expect(row.querySelector('strong')).toHaveTextContent('me');
    });

    test('checking a topic PUTs the complete set', async () => {
        // Arrange
        const faith = addTopic({ name: 'Faith' });
        const grace = addTopic({ name: 'Grace' });
        const idea = addIdea({ title: 'Abiding' });
        replaceIdeaTopics(idea.id, [faith.id]);

        await mount(<IdeasPage />);
        await waitFor(() => expect(rows('data-idea-id')).toHaveLength(1));
        await clickAndSettle(screen.getByRole('button', { name: 'Edit' }));

        // Act
        await clickAndSettle(topicCheckbox('Grace'));

        // Assert
        expect(topicLinkRequests()).toHaveLength(1);
        expect(topicLinkRequests()[0].body).toEqual({ topicIds: [faith.id, grace.id] });
        await waitFor(() => expect(topicCheckbox('Grace')).toBeChecked());
    });

    test('unchecking the last topic sends an empty set and leaves an unfiled idea', async () => {
        // Arrange
        const faith = addTopic({ name: 'Faith' });
        const idea = addIdea({ title: 'Abiding' });
        replaceIdeaTopics(idea.id, [faith.id]);

        await mount(<IdeasPage />);
        await waitFor(() => expect(rows('data-idea-id')).toHaveLength(1));
        await clickAndSettle(screen.getByRole('button', { name: 'Edit' }));

        // Act
        await clickAndSettle(topicCheckbox('Faith'));

        // Assert — an idea under no topic is legal, so this is a normal save.
        expect(topicLinkRequests()[0].body).toEqual({ topicIds: [] });
        await waitFor(() => expect(topicCheckbox('Faith')).not.toBeChecked());
        expect(store.ideas).toHaveLength(1);
    });

    test("shows an idea's topics as chips when it is not being edited", async () => {
        const faith = addTopic({ name: 'Faith' });
        const idea = addIdea({ title: 'Abiding' });
        replaceIdeaTopics(idea.id, [faith.id]);

        await mount(<IdeasPage />);

        await waitFor(() => expect(rows('data-idea-id')).toHaveLength(1));
        expect(within(rows('data-idea-id')[0]).getByText('Faith')).toHaveClass('library-chip');
    });

    test('says so when there are no topics to file an idea under', async () => {
        addIdea({ title: 'Abiding' });

        await mount(<IdeasPage />);
        await waitFor(() => expect(rows('data-idea-id')).toHaveLength(1));
        await clickAndSettle(screen.getByRole('button', { name: 'Edit' }));

        expect(screen.getByText(/No topics yet/)).toBeInTheDocument();
        expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    });

    test('deletes an idea', async () => {
        addIdea({ title: 'Abiding' });
        await mount(<IdeasPage />);
        await waitFor(() => expect(rows('data-idea-id')).toHaveLength(1));

        await clickAndSettle(screen.getByRole('button', { name: 'Delete Abiding' }));

        await waitFor(() => expect(rows('data-idea-id')).toHaveLength(0));
    });
});
