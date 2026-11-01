import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import Reader from './Reader';
import { fetchJson } from '../../config/api';
import { LONG_PRESS_MS } from './readerGestures';

jest.mock('../../config/api');

const books = [{ id: 1, name: 'Genesis', chapterCount: 50, verseCounts: [] }];
const payload = {
    verses: [
        { id: 1, verse: 1, verseIndex: 1, text: 'In the beginning' },
        { id: 2, verse: 2, verseIndex: 2, text: 'The earth was formless' },
        { id: 3, verse: 3, verseIndex: 3, text: 'God said' },
    ],
    references: [],
};
const notes = [
    { id: 5, title: '', body: '', references: [{ id: 50, startIndex: 1, endIndex: 1 }] },
    { id: 6, title: 'Kept', body: 'x', references: [{ id: 60, startIndex: 2, endIndex: 2 }] },
];

let props;
const setup = async (extra = {}) => {
    props = {
        onStep: jest.fn(), onExit: jest.fn(), onHighlight: jest.fn(), onRemoveHighlight: jest.fn(),
        onAddNote: jest.fn(), onOpenNote: jest.fn(), notes, ...extra,
    };
    const utils = render(
        <Reader books={books} position={{ bookId: 1, chapter: 1 }} notesRevision={0} {...props} />
    );
    await screen.findByText('In the beginning');
    const rows = utils.container.querySelectorAll('.analyze-reader-verse');
    return { ...utils, rows, body: utils.container.querySelector('.analyze-reader-body') };
};

const pt = (x = 500, y = 300) => ({ changedTouches: [{ clientX: x, clientY: y }] });
const press = (row) => {
    fireEvent.touchStart(row, pt());
    act(() => { jest.advanceTimersByTime(LONG_PRESS_MS); });
};

beforeEach(() => {
    jest.useFakeTimers();
    fetchJson.mockReset();
    fetchJson.mockResolvedValue(payload);
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: jest.fn().mockResolvedValue() }, configurable: true });
});
afterEach(() => { jest.useRealTimers(); });

test('long press selects the verse and shows the sheet', async () => {
    const { rows } = await setup();
    press(rows[1]);
    expect(rows[1]).toHaveClass('analyze-reader-verse--selected');
    expect(rows[0]).not.toHaveClass('analyze-reader-verse--selected');
    expect(screen.getByRole('dialog', { name: 'Genesis 1:2' })).toBeInTheDocument();
});

test('moving past the slop cancels the long press', async () => {
    const { rows } = await setup();
    fireEvent.touchStart(rows[1], pt());
    fireEvent.touchMove(rows[1], pt(500, 340));
    act(() => { jest.advanceTimersByTime(LONG_PRESS_MS); });
    expect(rows[1]).not.toHaveClass('analyze-reader-verse--selected');
});

test('lifting before the delay cancels the long press', async () => {
    const { rows } = await setup();
    fireEvent.touchStart(rows[1], pt());
    fireEvent.touchEnd(rows[1], pt());
    act(() => { jest.advanceTimersByTime(LONG_PRESS_MS); });
    expect(rows[1]).not.toHaveClass('analyze-reader-verse--selected');
});

test('lifting after a fired press does not open the overlay or step', async () => {
    const { rows, container } = await setup();
    press(rows[1]);
    fireEvent.touchEnd(rows[1], pt(950, 300));
    expect(props.onStep).not.toHaveBeenCalled();
    expect(container.querySelector('.analyze-reader-overlay')).toBeNull();
});

test('tapping a verse number selects that verse, then taps extend the range', async () => {
    const { rows } = await setup();
    fireEvent.click(rows[0].querySelector('.analyze-reader-verse-number'));
    expect(rows[0]).toHaveClass('analyze-reader-verse--selected');
    fireEvent.click(rows[2].querySelector('.analyze-reader-verse-text'), { clientX: 950 });
    expect(rows[1]).toHaveClass('analyze-reader-verse--selected');
    expect(rows[2]).toHaveClass('analyze-reader-verse--selected');
    expect(props.onStep).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Genesis 1:1–3' })).toBeInTheDocument();
});

test('a tap with no selection on a verse still uses the tap zones', async () => {
    const { rows } = await setup();
    fireEvent.click(rows[1].querySelector('.analyze-reader-verse-text'), { clientX: 950 });
    expect(props.onStep).toHaveBeenCalledWith(1);
});

test('Done clears the selection', async () => {
    const { rows } = await setup();
    press(rows[0]);
    fireEvent.click(screen.getByText('Done'));
    expect(rows[0]).not.toHaveClass('analyze-reader-verse--selected');
    expect(screen.queryByRole('dialog')).toBeNull();
});

test('changing chapter clears the selection', async () => {
    const { rows, rerender } = await setup();
    press(rows[0]);
    rerender(<Reader books={books} position={{ bookId: 1, chapter: 2 }} notesRevision={0} {...props} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('Highlight and Add note pass the selected reference and clear on success', async () => {
    const { rows } = await setup();
    props.onHighlight.mockResolvedValue(true);
    props.onAddNote.mockResolvedValue(false);
    press(rows[0]);
    fireEvent.click(screen.getByText('Add note'));
    expect(props.onAddNote).toHaveBeenCalledWith({ bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 });
    await act(async () => {});
    expect(rows[0]).toHaveClass('analyze-reader-verse--selected');
    fireEvent.click(screen.getByText('Highlight'));
    expect(props.onHighlight).toHaveBeenCalledWith({ bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 });
    await waitFor(() => expect(rows[0]).not.toHaveClass('analyze-reader-verse--selected'));
});

test('Remove highlight passes the removal plan', async () => {
    const { rows } = await setup();
    props.onRemoveHighlight.mockResolvedValue(true);
    press(rows[0]);
    fireEvent.click(screen.getByText('Remove highlight'));
    expect(props.onRemoveHighlight).toHaveBeenCalledWith({ noteIds: [5], referenceIds: [], writtenNotes: [] });
    await waitFor(() => expect(rows[0]).not.toHaveClass('analyze-reader-verse--selected'));
});

test('Open in Analyze hands over the written note', async () => {
    const { rows } = await setup();
    press(rows[1]);
    fireEvent.click(screen.getByText('Open in Analyze'));
    expect(props.onOpenNote).toHaveBeenCalledWith(6);
});

test('Copy verse writes the formatted text to the clipboard', async () => {
    const { rows } = await setup();
    press(rows[0]);
    fireEvent.click(screen.getByText('Copy verse'));
    await act(async () => {});
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('In the beginning\nGenesis 1:1');
});

test('Copy verse shows the text when the clipboard is unavailable', async () => {
    const { rows } = await setup();
    navigator.clipboard.writeText.mockRejectedValue(new Error('denied'));
    press(rows[0]);
    fireEvent.click(screen.getByText('Copy verse'));
    expect(await screen.findByText(/In the beginning\s+Genesis 1:1/)).toHaveClass('analyze-reader-copy-text');
});
