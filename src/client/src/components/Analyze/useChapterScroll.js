import { useEffect } from 'react';

const scrollMemory = new Map();

export function resetScrollMemory() {
    scrollMemory.clear();
}

export default function useChapterScroll(ref, key, isReady) {
    // Cleanup runs when the key changes or on unmount, saving under the key being left.
    useEffect(() => {
        const el = ref.current;
        return () => {
            if (el) scrollMemory.set(key, el.scrollTop);
        };
    }, [ref, key]);

    useEffect(() => {
        if (isReady && ref.current) ref.current.scrollTop = scrollMemory.get(key) ?? 0;
    }, [ref, key, isReady]);
}
