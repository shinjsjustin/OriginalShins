import { useEffect, useState } from 'react';
import { fetchJson } from '../../config/api';

// Loads the 66-book canon and its chapter grid once per page mount.
//
// The response is static reference data (and served with a year-long
// Cache-Control), so there is no refetch and no invalidation — every panel and
// picker on the page reads this one copy.
const useBooks = () => {
    const [books, setBooks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const controller = new AbortController();

        fetchJson('/books', { signal: controller.signal })
            .then(data => {
                setBooks(data.books || []);
                setError('');
            })
            .catch(err => {
                if (err.name === 'AbortError') return;
                setBooks([]);
                setError(err.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            });

        return () => controller.abort();
    }, []);

    return { books, isLoading, error };
};

export default useBooks;
