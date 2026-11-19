import { useEffect, useState } from 'react';
import { fetchJson } from '../../config/api';

// The scroll covering one chapter, or null. Makes no request while disabled.
// Errors are worded here, not taken from fetchJson, whose copy is about topics.
const useCoveringScroll = ({ bookId, chapter }, enabled) => {
    const [scroll, setScroll] = useState(null);
    const [isLoading, setIsLoading] = useState(enabled);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!enabled) {
            setIsLoading(false);
            return undefined;
        }
        const controller = new AbortController();
        setIsLoading(true);

        fetchJson(`/scrolls/covering?book=${bookId}&chapter=${chapter}`, { signal: controller.signal })
            .then(data => {
                setScroll(data.scroll);
                setError('');
            })
            .catch(err => {
                if (err.name === 'AbortError') return;
                setScroll(null);
                setError('Could not check for a scroll on this chapter.');
            })
            .finally(() => {
                if (!controller.signal.aborted) setIsLoading(false);
            });

        return () => controller.abort();
    }, [bookId, chapter, enabled]);

    return { scroll, isLoading, error };
};

export default useCoveringScroll;
