import { useEffect, useState } from 'react';

// `value`, but only after it has stopped changing for `delayMs`.
//
// Typing "shepherd" is eight renders and would otherwise be eight requests,
// seven of which are answers to a prefix nobody asked about. The timer is
// cleared on every change, so only the last keystroke of a burst survives.
//
// Generic on purpose: it knows nothing about search, and returning the value
// rather than taking a callback keeps the effect that acts on it in the caller,
// where its cancellation lives.
const useDebouncedValue = (value, delayMs) => {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(timer);
    }, [value, delayMs]);

    return debounced;
};

export default useDebouncedValue;
