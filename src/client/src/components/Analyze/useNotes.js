import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../../config/api';

// The notes for one chapter, plus every write that can change them.
//
// Reads and writes live together so that `revision` can exist: it counts writes
// and is bumped by each one, which both refetches this hook's own lists and —
// because it is passed down to the scripture panels as a fetch dependency —
// repaints their highlights. A note created from a selection therefore shows up
// as a highlight without any component having to reconcile a reference list by
// hand.
const useNotes = (position) => {
    const [notes, setNotes] = useState([]);
    const [unreferenced, setUnreferenced] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionError, setActionError] = useState('');
    const [revision, setRevision] = useState(0);

    const { bookId, chapter } = position;

    useEffect(() => {
        const controller = new AbortController();
        setIsLoading(true);

        fetchJson(`/notes?bookId=${bookId}&chapter=${chapter}`, { signal: controller.signal })
            .then(data => {
                setNotes(data.notes || []);
                setUnreferenced(data.unreferenced || []);
                setError('');
            })
            .catch(err => {
                if (err.name === 'AbortError') return;
                setNotes([]);
                setUnreferenced([]);
                setError(err.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            });

        return () => controller.abort();
    }, [bookId, chapter, revision]);

    // Every mutation is the same shape: run it, surface any failure as a
    // message the panel can show, and on success bump the revision so both the
    // list and the highlights reload from the server rather than from a guess
    // about what the write did.
    const run = useCallback(async (operation) => {
        try {
            const result = await operation();
            setActionError('');
            setRevision(previous => previous + 1);
            return result;
        } catch (err) {
            setActionError(err.message);
            return null;
        }
    }, []);

    // One endpoint, two creation paths: `reference` is simply absent for a
    // standalone note.
    const createNote = useCallback((body = {}) => run(
        () => fetchJson('/notes', { method: 'POST', body }).then(data => data.note)
    ), [run]);

    const updateNote = useCallback((noteId, changes) => run(
        () => fetchJson(`/notes/${noteId}`, { method: 'PATCH', body: changes }).then(data => data.note)
    ), [run]);

    const removeNote = useCallback((noteId) => run(
        () => fetchJson(`/notes/${noteId}`, { method: 'DELETE' }).then(() => true)
    ), [run]);

    const addReference = useCallback((noteId, reference) => run(
        () => fetchJson(`/notes/${noteId}/references`, { method: 'POST', body: reference })
            .then(data => data.note)
    ), [run]);

    const removeReference = useCallback((referenceId) => run(
        () => fetchJson(`/references/${referenceId}`, { method: 'DELETE' }).then(() => true)
    ), [run]);

    // The note's complete idea set, replaced in one call. References are added
    // and removed one at a time because each is its own act of anchoring; idea
    // links come from a multi-select that already knows the whole membership,
    // so it sends the whole membership. An empty array is a legal save that
    // leaves the note filed under nothing.
    const setNoteIdeas = useCallback((noteId, ideaIds) => run(
        () => fetchJson(`/notes/${noteId}/ideas`, { method: 'PUT', body: { ideaIds } })
            .then(data => data.note)
    ), [run]);

    const dismissActionError = useCallback(() => setActionError(''), []);

    return {
        notes,
        unreferenced,
        isLoading,
        error,
        actionError,
        dismissActionError,
        revision,
        createNote,
        updateNote,
        removeNote,
        addReference,
        removeReference,
        setNoteIdeas,
    };
};

export default useNotes;
