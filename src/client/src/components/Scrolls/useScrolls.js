import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../../config/api';
import { sortNewestFirst } from './scrollModel';

// The reader's scrolls, newest first. Errors are worded here, not taken from
// fetchJson, whose 409/422 copy is about topics.
const useScrolls = () => {
    const [scrolls, setScrolls] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [revision, setRevision] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        setIsLoading(true);
        fetchJson('/scrolls', { signal: controller.signal })
            .then((data) => {
                setScrolls(sortNewestFirst(data.scrolls));
                setError(null);
                setIsLoading(false);
            })
            .catch((err) => {
                if (err.name === 'AbortError') return;
                setError('Could not load your scrolls.');
                setIsLoading(false);
            });
        return () => controller.abort();
    }, [revision]);

    const deleteScroll = useCallback(async (id) => {
        setError(null);
        try {
            await fetchJson(`/scrolls/${id}`, { method: 'DELETE' });
            setScrolls((current) => current.filter((scroll) => scroll.id !== id));
        } catch {
            setError('Could not delete the scroll.');
        }
    }, []);

    const reload = useCallback(() => setRevision((n) => n + 1), []);

    return { scrolls, isLoading, error, deleteScroll, reload };
};

export default useScrolls;
