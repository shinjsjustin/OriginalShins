import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '../../config/api';

// One scroll with its blocks. saveAnswer resolves true or false so the caller
// can keep a draft on failure; errors are worded here, not by fetchJson.
// onAnswerSaved runs after a save lands, so a host can refresh its summary.
const useScroll = (id, { onAnswerSaved } = {}) => {
    const [scroll, setScroll] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const onSavedRef = useRef(onAnswerSaved);
    onSavedRef.current = onAnswerSaved;

    useEffect(() => {
        const controller = new AbortController();
        setScroll(null);
        setIsLoading(true);
        setError(null);
        fetchJson(`/scrolls/${id}`, { signal: controller.signal })
            .then((data) => {
                setScroll(data.scroll);
                setIsLoading(false);
            })
            .catch((err) => {
                if (err.name === 'AbortError') return;
                setError('Could not load the scroll.');
                setIsLoading(false);
            });
        return () => controller.abort();
    }, [id]);

    const saveAnswer = useCallback(async (blockId, text) => {
        setError(null);
        try {
            const { block } = await fetchJson(`/scrolls/${id}/blocks/${blockId}/answer`, {
                method: 'PUT',
                body: { answer: text },
            });
            setScroll((current) => ({
                ...current,
                blocks: current.blocks.map((b) => (b.id === block.id ? block : b)),
            }));
            if (onSavedRef.current) onSavedRef.current(block);
            return true;
        } catch {
            setError('Could not save your answer.');
            return false;
        }
    }, [id]);

    return { scroll, isLoading, error, saveAnswer };
};

export default useScroll;
