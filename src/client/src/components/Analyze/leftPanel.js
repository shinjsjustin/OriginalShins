const SCROLLS = 'scrolls';
const COMPARE = 'compare';
const BROWSE = 'browse';

export const parseLeftPanel = (value) => (value === SCROLLS ? SCROLLS : COMPARE);

// pick: null (nothing chosen), 'browse' (the reader asked for the list) or a scroll id.
export const scrollsPanelView = (pick, coveringScroll) => {
    if (pick === BROWSE) return { kind: 'browse' };
    if (pick !== null) return { kind: 'scroll', id: pick };
    if (coveringScroll) return { kind: 'scroll', id: coveringScroll.id, isCovering: true };
    return { kind: 'browse' };
};
