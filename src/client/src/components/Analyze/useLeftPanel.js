import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SIDE_PARAM } from './panelParams';
import { parseLeftPanel } from './leftPanel';

// Which panel fills the left slot lives in the URL (?side=). Both writes
// replace: the slot is how the room is arranged, not a place the reader went.
const useLeftPanel = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const side = parseLeftPanel(searchParams.get(SIDE_PARAM));

    const showScrolls = useCallback(() => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set(SIDE_PARAM, 'scrolls');
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    const showCompare = useCallback(() => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.delete(SIDE_PARAM);
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    return { side, showScrolls, showCompare };
};

export default useLeftPanel;
