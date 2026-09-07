// A note's ideas and its topics are two memberships, and both are written by a
// PUT that replaces the whole set. So every filing action on this page is the
// set the note already carries, plus or minus one id.
//
// Two functions rather than the same spread and filter written out at each of
// the four call sites — import an idea, import a topic, unfile an idea, unfile
// a topic. They are here, tested once, because an add and a remove maintained
// apart are an add and a remove that come to disagree about the empty case.

/**
 * The set with `id` in it.
 *
 * Appended, so the order is the one the reader built. A set that already holds
 * the id is returned AS IS rather than copied: the caller compares the result
 * against what it passed in to decide whether there is anything to send, and a
 * fresh array that happens to be equal would spend a round trip storing what
 * is already stored.
 */
export const withMember = (ids, id) => (ids.includes(id) ? ids : [...ids, id]);

/** The set without `id`. An empty result is legal — a note may be filed under nothing. */
export const withoutMember = (ids, id) => ids.filter(memberId => memberId !== id);
