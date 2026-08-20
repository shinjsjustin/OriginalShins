import { useCallback } from 'react';
import { fetchJson } from '../../config/api';
import useCollection from './useCollection';

// Every idea the user has, plus every write that can change one.
//
// Two very different pages use this: the ideas management page uses all of it,
// and the Analyze page's note editor uses only `ideas` — it needs the list to
// offer as a multi-select, and it saves through the notes endpoint rather than
// this one. That is why the hook loads the whole list rather than a page of it:
// it is a picker's worth of data, and the plan's scale assumption is low
// thousands of notes with far fewer ideas above them.
const useIdeas = () => {
    const { items, run, ...rest } = useCollection('/ideas', 'ideas');

    const createIdea = useCallback((body = {}) => run(
        () => fetchJson('/ideas', { method: 'POST', body }).then(data => data.idea)
    ), [run]);

    const updateIdea = useCallback((ideaId, changes) => run(
        () => fetchJson(`/ideas/${ideaId}`, { method: 'PATCH', body: changes }).then(data => data.idea)
    ), [run]);

    const removeIdea = useCallback((ideaId) => run(
        () => fetchJson(`/ideas/${ideaId}`, { method: 'DELETE' }).then(() => true)
    ), [run]);

    // The full replace. `topicIds` is the complete membership, not a delta, and
    // an empty array is a legitimate call that files the idea under nothing.
    const setIdeaTopics = useCallback((ideaId, topicIds) => run(
        () => fetchJson(`/ideas/${ideaId}/topics`, { method: 'PUT', body: { topicIds } })
            .then(data => data.idea)
    ), [run]);

    return { ideas: items, createIdea, updateIdea, removeIdea, setIdeaTopics, ...rest };
};

export default useIdeas;
