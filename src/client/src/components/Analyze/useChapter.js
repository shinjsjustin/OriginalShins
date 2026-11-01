import { useEffect, useState } from 'react';
import { fetchJson } from '../../config/api';

// One chapter's payload: its verses plus the references that tint them.
// `revision` is useNotes' counter; every note write bumps it, so each consumer
// of this hook repaints its marks from the same fetch rule.
const useChapter = ({ bookId, chapter }, revision) => {
    const [chapterData, setChapterData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const controller = new AbortController();
        setIsLoading(true);

        fetchJson(`/chapter/${bookId}/${chapter}`, { signal: controller.signal })
            .then(data => {
                setChapterData(data);
                setError('');
            })
            .catch(err => {
                if (err.name === 'AbortError') return;
                setChapterData(null);
                setError(err.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            });

        return () => controller.abort();
    }, [bookId, chapter, revision]);

    return { chapterData, isLoading, error };
};

export default useChapter;
