import { parseLeftPanel, scrollsPanelView } from './leftPanel';

test.each([
    ['scrolls', 'scrolls'],
    ['compare', 'compare'],
    ['Scrolls', 'compare'],
    ['', 'compare'],
    [null, 'compare'],
    [undefined, 'compare'],
])('parseLeftPanel(%p) is %p', (value, expected) => {
    expect(parseLeftPanel(value)).toBe(expected);
});

test('browse pick shows the list even when a scroll covers the chapter', () => {
    expect(scrollsPanelView('browse', { id: 3 })).toEqual({ kind: 'browse' });
});

test('a picked id wins over the covering scroll', () => {
    expect(scrollsPanelView(8, { id: 3 })).toEqual({ kind: 'scroll', id: 8 });
});

test('no pick shows the covering scroll, marked as covering', () => {
    expect(scrollsPanelView(null, { id: 3 })).toEqual({ kind: 'scroll', id: 3, isCovering: true });
});

test('no pick and no covering scroll shows the list', () => {
    expect(scrollsPanelView(null, null)).toEqual({ kind: 'browse' });
});
