import { useCallback } from 'react';
import { fetchJson } from '../../config/api';
import useCollection from './useCollection';

// The ideas imported into one chapter — the shortlist the notes panel keeps
// beside the passage under study.
//
// Same shape as useIdeas: useCollection holds the list and the revision, and
// the writes are wrapped on top of it. What differs is that the list is not the
// whole corpus but one chapter's worth of it, so the path carries the
// coordinate — and because useCollection's fetch effect depends on that path,
// moving the primary panel is a refetch and needs nothing else to make it one.
//
// ── One endpoint for both writes ───────────────────────────────────────────
//
// PUT /api/chapter-ideas replaces the chapter's ENTIRE set, and there is no
// import-one or remove-one beside it. So both calls below are the same call
// with a different set computed from the one on screen: importing appends,
// removing filters. That is the shape the endpoint was drawn for — see
// src/routes/chapterIdeas.js — and it is the only shape in which the list the
// reader is looking at and the list the server stores cannot drift apart.
//
// Removing is removing the IMPORT. The idea itself is untouched by this hook:
// nothing here deletes an idea, and an idea taken out of a chapter is still in
// GET /api/ideas, still offerable in the note editor, and still reachable
// through the importer overlay.
const useChapterIdeas = (position) => {
    const { bookId, chapter } = position;
    const { items, run, ...rest } = useCollection(
        `/chapter-ideas?bookId=${bookId}&chapter=${chapter}`,
        'ideas'
    );

    const replace = useCallback((ideaIds) => run(
        () => fetchJson('/chapter-ideas', { method: 'PUT', body: { bookId, chapter, ideaIds } })
            .then(data => data.ideas)
    ), [run, bookId, chapter]);

    // Appended rather than prepended, so the shortlist reads in the order the
    // reader built it. Importing an idea the chapter already holds writes
    // nothing: the set would come back identical, and a PUT that stores what
    // is already stored is a round trip spent to redraw the same list.
    const importIdea = useCallback((ideaId) => {
        const current = items.map(idea => idea.id);
        return current.includes(ideaId) ? Promise.resolve(items) : replace([...current, ideaId]);
    }, [items, replace]);

    const removeImport = useCallback((ideaId) => replace(
        items.map(idea => idea.id).filter(id => id !== ideaId)
    ), [items, replace]);

    return { chapterIdeas: items, importIdea, removeImport, ...rest };
};

export default useChapterIdeas;
