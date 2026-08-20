import { TIER_KEYS } from './overviewLayout';

// The names of the query params the Overview page reads, and the rules for
// reading them.
//
// Split out of the hook that owns them for the same reason panelParams.js is
// split out of usePanelPositions: a link INTO this page — the drawer's "filter
// to this topic", and whatever later phases add — should not have to pull in a
// hook, and its React import with it, just to spell 'tiers'.
//
// ── The contract ───────────────────────────────────────────────────────────
//
//   /overview                          all three rails, the whole corpus
//   /overview?tiers=notes              only the notes rail
//   /overview?tiers=notes,topics       two rails
//   /overview?topicId=3                all three rails, restricted to topic 3
//   /overview?q=faith                  everything drawn, arcs named "faith" lit
//
// The first two params are the same two the API takes, spelled the same way,
// because they mean the same thing on both sides — the page's state IS its
// request. `q` is the exception and deliberately so: it names nothing the
// server has to read. The payload the page already holds carries every group's
// title, so the filter is a substring test over data that has arrived rather
// than a round trip per keystroke, and the request path (see useOverviewData)
// is built from `tiers` and `topicId` alone so that typing never refetches.
// The plan's surface reserves ?q= on /api/overview for a server-side version;
// nothing here needs it, and the route ignores an unknown param by design.
//
// The same two params the API takes, spelled the same way, because they mean
// the same thing on both sides — the page's state IS its request. That is the
// Analyze page's convention (`?l=40.5&r=45.5`) applied to a page whose state
// happens to be a filter rather than a position: the URL is the single source
// of truth, so the back button, reload and a shared link all work with no
// extra plumbing.
//
// Pure. Nothing here reads the router or the network.

export const TIERS_PARAM = 'tiers';
export const TOPIC_PARAM = 'topicId';
export const QUERY_PARAM = 'q';

const SEPARATOR = ',';

/**
 * Which rails a raw `tiers` value asks for.
 *
 * An absent param (null) means all three — the page's default, and what a bare
 * /overview has always meant. A param naming nothing legal also means all
 * three rather than an empty diagram: a stale or hand-edited link should show
 * the page, not a blank frame with no way back. `?tiers=` deliberately survives
 * that rule as "nothing", because a reader who unticks every box has said
 * something specific and the page should show them exactly that.
 *
 * Takes the raw string rather than the URLSearchParams so the hook above it can
 * memoise on that one primitive. The array this returns keys the memo that
 * builds every arc on the page, and a fresh array per render would rebuild a
 * few thousand curves on every pointer move.
 */
export const parseTiers = (raw) => {
    if (raw === null || raw === undefined) return [...TIER_KEYS];

    const named = raw.split(SEPARATOR).map(tier => tier.trim());
    // Filtered from the canonical list rather than from what was asked for, so
    // the order is the rails' own and a repeat collapses.
    const tiers = TIER_KEYS.filter(tier => named.includes(tier));

    return tiers.length === 0 && raw.trim() !== '' ? [...TIER_KEYS] : tiers;
};

/** The same, read off a URL. */
export const tiersFromParams = (searchParams) => parseTiers(searchParams.get(TIERS_PARAM));

/** The value `tiers` takes for a set of rails. */
export const tiersToParam = (tiers) =>
    TIER_KEYS.filter(tier => tiers.includes(tier)).join(SEPARATOR);

/**
 * The topic a URL restricts the page to, or null for the whole corpus.
 *
 * A malformed or non-positive value is null rather than an error: a stale link
 * from a deleted topic must show the whole diagram rather than a message. A
 * well-formed id naming a topic that no longer exists is the server's answer
 * to give, and it gives a 404.
 */
export const topicIdFromParams = (searchParams) => {
    const raw = searchParams.get(TOPIC_PARAM);
    if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;

    const topicId = Number(raw);
    return topicId >= 1 ? topicId : null;
};

/**
 * The term a URL is filtering titles by, or '' for no search.
 *
 * Whitespace-only is '' as well: a URL carrying `?q=%20` is asking for nothing
 * in particular, and dimming the entire diagram over a stray space is the one
 * reading of it that helps nobody. Beyond that the value is taken as typed —
 * case and punctuation are the matcher's business (see arcSearch.js), not the
 * URL's, and normalising here would make the box and the address bar disagree
 * about what the reader wrote.
 */
export const queryFromParams = (searchParams) => {
    const raw = searchParams.get(QUERY_PARAM);
    if (typeof raw !== 'string' || raw.trim() === '') return '';

    return raw;
};

/** A link to this page, filtered to one topic. */
export const overviewUrlForTopic = (topicId) =>
    `/overview?${TOPIC_PARAM}=${topicId}`;
