// Small display helpers shared by the two management pages.

// "1 idea", "2 ideas", "0 notes". A count of zero is still worth printing —
// an empty topic is a legal, meaningful state here, not a missing value.
export const countLabel = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

// "3 ideas · 7 notes" — the pairs the topic list shows under each name.
export const joinCounts = (parts) => parts.join(' · ');
