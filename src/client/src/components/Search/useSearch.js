import { useEffect, useState } from 'react';
import { fetchJson } from '../../config/api';
import useDebouncedValue from './useDebouncedValue';
import { EMPTY_RESULTS, isSearchable, resultsFrom } from './searchModel';

// Long enough that a typed word is one request, short enough that the results
// feel like they are following the typing rather than arriving after it.
const DEBOUNCE_MS = 300;

// The search box's state: what was typed, what came back, and which of the
// three things that are not results is true — still typing, still waiting, or
// failed.
//
// The query is state and the request is an effect over the debounced copy of
// it, so the input stays responsive at every keystroke while the network sees
// one request per pause. Aborting on change is what keeps a slow answer to
// "shep" from landing after the answer to "shepherd".
const useSearch = () => {
    const [query, setQuery] = useState('');
    const trimmed = query.trim();
    const debouncedQuery = useDebouncedValue(trimmed, DEBOUNCE_MS);

    const [results, setResults] = useState(EMPTY_RESULTS);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState('');
    // The query the results on screen actually answer. Without it, "no results"
    // would print the word being typed rather than the word that was searched.
    const [searchedFor, setSearchedFor] = useState('');

    useEffect(() => {
        // Too short to search is not an error and not a result: it is the state
        // an empty box is in. The server would refuse it with a 400, and asking
        // it to is a round trip to be told what we already know.
        if (!isSearchable(debouncedQuery)) {
            setResults(EMPTY_RESULTS);
            setSearchedFor('');
            setError('');
            setIsSearching(false);
            return undefined;
        }

        const controller = new AbortController();
        setIsSearching(true);

        fetchJson(`/search?q=${encodeURIComponent(debouncedQuery)}`, { signal: controller.signal })
            .then(data => {
                setResults(resultsFrom(data));
                setError('');
                setSearchedFor(debouncedQuery);
            })
            .catch(err => {
                if (err.name === 'AbortError') return;
                setResults(EMPTY_RESULTS);
                setError(err.message);
                setSearchedFor(debouncedQuery);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsSearching(false);
                }
            });

        return () => controller.abort();
    }, [debouncedQuery]);

    return {
        query,
        setQuery,
        results,
        isSearching,
        error,
        searchedFor,
        // Typed something, but not yet enough to search on. Distinct from an
        // empty box, which prompts rather than corrects.
        isTooShort: trimmed.length > 0 && !isSearchable(trimmed),
    };
};

export default useSearch;
