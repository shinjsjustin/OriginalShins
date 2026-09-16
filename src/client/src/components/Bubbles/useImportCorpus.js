import useCollection from '../Analyze/useCollection';

// The topics and ideas one import picker is offering, scoped to one book.
//
// The read lives in the overlay rather than on the page because the picker is
// the only thing that wants it, and because the book it wants is the picker's
// own — initialised from the centre panel and changed inside the overlay
// without moving it. A list fetched by the page could only ever be the page's
// book.
//
// Moving it here also takes two requests off every Analyze load that never
// opens the picker, which used to be most of them.
//
// Built on useCollection for the fetch-and-revision plumbing, and the scope
// rides in the `path` it is keyed on — so changing book IS the refetch, with
// no second effect to keep in step.
const useImportCorpus = (bookId) => {
    const topics = useCollection(`/topics?book=${bookId}`, 'topics');
    const ideas = useCollection(`/ideas?book=${bookId}`, 'ideas');

    return {
        topics: topics.items,
        ideas: ideas.items,
        isLoading: topics.isLoading || ideas.isLoading,
        // Either read failing leaves the field unable to draw the corpus, and
        // both failing at once is one server being down — so one message.
        error: topics.error || ideas.error,
    };
};

export default useImportCorpus;
