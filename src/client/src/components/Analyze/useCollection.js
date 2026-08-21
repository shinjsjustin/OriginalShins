import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../../config/api';

// One user-scoped list plus the write plumbing every list in this app shares.
//
// It is modelled on components/Analyze/useNotes.js and keeps the same
// `revision` trick: every successful write bumps a counter that the fetch
// effect depends on, so the list reloads from the server rather than from a
// guess about what the write did. That matters more here than it does for
// notes, because a link write changes counts on rows the response never
// mentions — saving an idea's topics changes those topics' idea and note
// counts, and only a refetch can be right about them.
//
// `path` and `key` name the endpoint and the property its payload is wrapped
// in ('/ideas' and 'ideas'). It stays separate from useIdeas, its only caller,
// because the split is what keeps this fetch-and-revision plumbing apart from
// the mutations written on top of it.
const useCollection = (path, key) => {
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionError, setActionError] = useState('');
    const [revision, setRevision] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        setIsLoading(true);

        fetchJson(path, { signal: controller.signal })
            .then(data => {
                setItems(data[key] || []);
                setError('');
            })
            .catch(err => {
                if (err.name === 'AbortError') return;
                setItems([]);
                setError(err.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            });

        return () => controller.abort();
    }, [path, key, revision]);

    // Every mutation is the same shape: run it, surface any failure as a
    // message the page can show, and on success bump the revision.
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

    const dismissActionError = useCallback(() => setActionError(''), []);

    return { items, isLoading, error, actionError, dismissActionError, revision, run };
};

export default useCollection;
