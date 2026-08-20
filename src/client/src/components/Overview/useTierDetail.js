import { useEffect, useState } from 'react';
import { fetchJson } from '../../config/api';
import { DETAIL_PATHS, toTierDetail } from './tierDetail';

// Loads the one group the reader opened, from whichever endpoint its rail
// belongs to — GET /api/notes/:id, /api/ideas/:id or /api/topics/:id.
//
// ── Why bodies are not in the overview payload ─────────────────────────────
//
// /api/overview is every note, idea and topic the reader owns. A title is tens
// of bytes and a body has no bound at all, so shipping bodies would make the
// one request the whole page waits on scale with how much the reader has
// written, to draw a picture that never shows a body. The drawer wants exactly
// one, at the moment it is opened, which is what this is.
//
// The same argument covers the lists an idea and a topic show: an idea's notes
// and a topic's ideas are a second tier of rows each, and only the one being
// read is ever needed.
//
// ── Why the previous group is cleared on the way ───────────────────────────
//
// The selection changes when the reader clicks a second chain without closing
// the drawer, possibly on another rail entirely. Holding the old group on
// screen under the new one's title is worse than a moment of "Loading…", so it
// is dropped as the request goes out and the drawer falls back to what the
// overview payload already told it — the title and the reference list, which
// are correct immediately.
const useTierDetail = (rail, groupId, books) => {
    const [detail, setDetail] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const pathFor = DETAIL_PATHS[rail];
        if (!pathFor || groupId === null || groupId === undefined) {
            setDetail(null);
            setError('');
            setIsLoading(false);
            return undefined;
        }

        const controller = new AbortController();
        setDetail(null);
        setError('');
        setIsLoading(true);

        fetchJson(pathFor(groupId), { signal: controller.signal })
            .then(payload => {
                setDetail(toTierDetail(rail, payload, books));
                setError('');
            })
            .catch(err => {
                if (err.name === 'AbortError') return;
                setDetail(null);
                setError(err.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            });

        return () => controller.abort();
    }, [rail, groupId, books]);

    return { detail, isLoading, error };
};

export default useTierDetail;
