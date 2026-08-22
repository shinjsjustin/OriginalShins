import useCollection from './useCollection';

// Every topic the reader has.
//
// Read-only, and the only hook here that is: topics are made and filed on the
// Thoughts page, and this page needs them for one thing — the importer overlay
// draws its field of bubbles as topics first, with each topic's ideas fanning
// out of it, so the field has to be handed the topics as well as the ideas.
const useTopics = () => {
    const { items, run, ...rest } = useCollection('/topics', 'topics');

    return { topics: items, ...rest };
};

export default useTopics;
