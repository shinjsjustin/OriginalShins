import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TIER_KEYS } from './overviewLayout';
import {
    QUERY_PARAM,
    TIERS_PARAM,
    TOPIC_PARAM,
    parseTiers,
    queryFromParams,
    tiersFromParams,
    tiersToParam,
    topicIdFromParams,
} from './overviewParams';

// The Overview page's state, held in the query string.
//
// Which rails are shown, which topic the page is restricted to and what the
// reader is searching for are the three things they can change about this
// page, and all three live in the URL for the same reasons the Analyze page's
// panel positions do: the back button undoes a toggle, a reload keeps it, and
// "look at this, topics only, under Faith" is a link rather than a list of
// instructions.
//
// ── Why a toggle pushes a history entry and a search replaces one ──────────
//
// usePanelPositions replaces when it is normalising a URL and pushes when the
// reader moves a panel. The same rule applies here: turning a rail off is
// something the reader did, so the back button should undo it. Nothing here
// normalises, so nothing here replaces on that path — a bare /overview stays
// bare, and the param appears the moment the defaults stop being true.
//
// Typing is the exception. A search term is not one decision but a stream of
// them, and pushing per settled burst would bury the page the reader came from
// under one entry per word — so `?q=` is replaced into the current entry. The
// reader still gets the two things the URL is for, a reload that keeps the
// filter and a link that carries it; what they do not get is a back button
// that walks backwards through their own typing, which nobody wanted.
//
// ── Why `tiers` is memoised on the raw string ──────────────────────────────
//
// It is the key of the memo in Overview.js that turns three tiers into every
// stem and arc on the page, and of the effect in useOverviewData that decides
// whether to refetch. A fresh array per render would rebuild a few thousand
// curves and re-issue a request on every hover — which is exactly the cost this
// page is arranged around not paying. The raw param is a string, so memoising
// on it is one comparison and the array is new only when the URL is.
const useOverviewParams = () => {
    const [searchParams, setSearchParams] = useSearchParams();

    const rawTiers = searchParams.get(TIERS_PARAM);
    const tiers = useMemo(() => parseTiers(rawTiers), [rawTiers]);
    const topicId = topicIdFromParams(searchParams);
    const query = queryFromParams(searchParams);

    const toggleTier = useCallback((tier) => {
        setSearchParams(previous => {
            const next = new URLSearchParams(previous);
            const shown = tiersFromParams(previous);
            const wanted = shown.includes(tier)
                ? shown.filter(shownTier => shownTier !== tier)
                : [...shown, tier];

            // The param is dropped rather than spelled out when it says
            // nothing the default does not already say. A URL carries the
            // reader's departures from the default and not the default itself.
            if (wanted.length === TIER_KEYS.length) {
                next.delete(TIERS_PARAM);
            } else {
                next.set(TIERS_PARAM, tiersToParam(wanted));
            }

            return next;
        });
    }, [setSearchParams]);

    // Replaced rather than pushed, and dropped rather than spelled out empty,
    // by the same rule the tiers param follows: a URL carries the reader's
    // departures from the default and not the default itself.
    const setQuery = useCallback((term) => {
        setSearchParams(previous => {
            const next = new URLSearchParams(previous);

            if (term.trim() === '') {
                next.delete(QUERY_PARAM);
            } else {
                next.set(QUERY_PARAM, term);
            }

            return next;
        }, { replace: true });
    }, [setSearchParams]);

    const clearTopic = useCallback(() => {
        setSearchParams(previous => {
            const next = new URLSearchParams(previous);
            next.delete(TOPIC_PARAM);
            return next;
        });
    }, [setSearchParams]);

    return { tiers, topicId, query, toggleTier, clearTopic, setQuery };
};

export default useOverviewParams;
