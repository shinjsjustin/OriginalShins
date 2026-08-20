import { useCallback } from 'react';
import { fetchJson } from '../../config/api';
import useCollection from './useCollection';

// Every topic the user has, with the counts the list shows, plus every write.
//
// The topics page uses all of it; the ideas page uses only `topics`, as the
// options for an idea's multi-select. There is no link write here — an idea's
// topics are replaced from the idea's side (see useIdeas.setIdeaTopics),
// because that is the side holding the widget.
const useTopics = () => {
    const { items, run, ...rest } = useCollection('/topics', 'topics');

    const createTopic = useCallback((body) => run(
        () => fetchJson('/topics', { method: 'POST', body }).then(data => data.topic)
    ), [run]);

    const updateTopic = useCallback((topicId, changes) => run(
        () => fetchJson(`/topics/${topicId}`, { method: 'PATCH', body: changes }).then(data => data.topic)
    ), [run]);

    const removeTopic = useCallback((topicId) => run(
        () => fetchJson(`/topics/${topicId}`, { method: 'DELETE' }).then(() => true)
    ), [run]);

    return { topics: items, createTopic, updateTopic, removeTopic, ...rest };
};

export default useTopics;
