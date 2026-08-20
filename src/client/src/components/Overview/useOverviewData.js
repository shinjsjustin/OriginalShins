import { useEffect, useState } from 'react';
import { fetchJson } from '../../config/api';
import { TIER_KEYS } from './overviewLayout';
import { TIERS_PARAM, TOPIC_PARAM } from './overviewParams';

// Loads GET /api/overview for the rails the page is showing.
//
// ── One request for the whole diagram ──────────────────────────────────────
//
// The response is every anchor point the page plots, already grouped and
// sorted, in the plan's compact arrays, plus the parallel label tier beside
// each one that a tooltip and the drawer read. There is no pagination and no
// per-tier fetch: the picture is only worth looking at whole, and a few
// thousand groups of [id, [ints]] with their titles and reference tuples
// beside them is a few hundred kilobytes. What is NOT in it is bodies — see
// useTierDetail.
//
// ── Why the request names its tiers ────────────────────────────────────────
//
// A reader who has turned the topics rail off should not be paying for the
// topics tier, which is the widest of the three joins and the largest of the
// three tiers on the wire. So the request asks for exactly the rails the URL
// says to draw, and turning one back on refetches — served from the server's
// cache, which holds the payload whole precisely so that a toggle is not three
// joins. Turning one OFF fetches nothing at all.
//
// With every rail off there is no request: an empty diagram is not a question
// worth asking the network.
//
// ── Why there is no refetch beyond that ────────────────────────────────────
//
// Nothing on this page writes. A note is created and anchored on the Analyze
// page, an idea linked in its editor, and arriving here afterwards is a mount —
// which is when this runs. The server invalidates its cached copy on that
// write, so the mount gets the new answer without either side polling. The
// drawer reads and does not write, for exactly this reason; if it ever grows an
// edit, this is where the invalidation would go.
//
// Separate from useBooks rather than folded into it: the canon is static and
// cached for a year, this changes whenever the reader writes, and the two
// failing are different failures — see Overview.js for what the page does when
// only this one fails.

// A tier's two halves in the payload: `notes` and `noteLabels`.
const labelKeyFor = (tier) => `${tier.replace(/s$/, '')}Labels`;

const pathFor = (tiers, topicId) => {
    const query = new URLSearchParams({ [TIERS_PARAM]: tiers.join(',') });
    if (topicId !== null) {
        query.set(TOPIC_PARAM, String(topicId));
    }
    return `/overview?${query}`;
};

const emptyData = () => ({ tiers: {}, labels: {} });

// The payload -> one map per half, keyed by rail. Driven by what the response
// actually carries rather than by what was asked for, so a rail the server did
// not answer with simply is not drawn instead of drawing `undefined`.
const byRail = (payload, keyFor) => TIER_KEYS.reduce((collected, tier) => {
    const value = payload[keyFor(tier)];
    return Array.isArray(value) ? { ...collected, [tier]: value } : collected;
}, {});

/**
 * @param tiers   the rail keys to load, in any order
 * @param topicId restrict every tier to this topic, or null for the whole corpus
 * @returns { data: { tiers, labels }, isLoading, error } — both maps keyed by
 *          rail, and missing a rail that was not asked for
 */
const useOverviewData = (tiers, topicId) => {
    const [data, setData] = useState(emptyData);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    // The request, as one string. `tiers` is a fresh array on every render of
    // the page — it is parsed out of the URL — so depending on the array itself
    // would refetch on every keystroke anywhere in the app.
    const path = tiers.length === 0 ? null : pathFor(tiers, topicId);

    useEffect(() => {
        if (path === null) {
            setData(emptyData());
            setError('');
            setIsLoading(false);
            return undefined;
        }

        const controller = new AbortController();
        setIsLoading(true);

        fetchJson(path, { signal: controller.signal })
            .then(payload => {
                setData({
                    tiers: byRail(payload, tier => tier),
                    labels: byRail(payload, labelKeyFor),
                });
                setError('');
            })
            .catch(err => {
                if (err.name === 'AbortError') return;
                setData(emptyData());
                setError(err.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            });

        return () => controller.abort();
    }, [path]);

    // `data` only changes when a response lands, so every tier array below it
    // keeps its identity across the re-renders a pointer causes — which is
    // what keeps the memos in Overview.js that turn a tier into geometry from
    // running again mid-hover.
    return { data, isLoading, error };
};

export default useOverviewData;
