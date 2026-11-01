import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { READER_PARAM } from './panelParams';

// Whether the full-screen reader is showing lives in the URL (?read=1) so a
// reload or shared link lands in it. Opening pushes, so Back leaves the reader;
// closing replaces, so Back after closing does not reopen it.
const useReaderMode = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const isReading = searchParams.has(READER_PARAM);

    const openReader = useCallback(() => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set(READER_PARAM, '1');
            return next;
        });
    }, [setSearchParams]);

    const closeReader = useCallback(() => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.delete(READER_PARAM);
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    return { isReading, openReader, closeReader };
};

export default useReaderMode;
