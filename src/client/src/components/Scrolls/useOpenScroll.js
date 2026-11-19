import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export const SCROLL_PARAM = 'scroll';

// Anything that is not a positive integer means no scroll is open: the value
// is a URL and must never become an error page.
export const parseScrollId = (raw) => {
    if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
    const id = Number(raw);
    return id >= 1 ? id : null;
};

// Which scroll is expanded, held in ?scroll=<id>. Opening pushes so Back closes it.
const useOpenScroll = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const scrollId = parseScrollId(searchParams.get(SCROLL_PARAM));

    const open = useCallback((id) => {
        const wanted = parseScrollId(String(id));
        setSearchParams((previous) => {
            const next = new URLSearchParams(previous);
            if (wanted === null) next.delete(SCROLL_PARAM);
            else next.set(SCROLL_PARAM, String(wanted));
            return next;
        });
    }, [setSearchParams]);

    const close = useCallback(() => {
        setSearchParams((previous) => {
            const next = new URLSearchParams(previous);
            next.delete(SCROLL_PARAM);
            return next;
        });
    }, [setSearchParams]);

    return { scrollId, open, close };
};

export default useOpenScroll;
