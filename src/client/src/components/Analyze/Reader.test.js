import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Reader from './Reader';
import { fetchJson } from '../../config/api';
import { TEXT_SIZE_KEY } from './readerTextSize';

jest.mock('../../config/api');

const books = [{ id: 1, name: 'Genesis', chapterCount: 50, verseCounts: [] }];
const payload = {
    verses: [
        { id: 1, verse: 1, verseIndex: 1, text: 'In the beginning' },
        { id: 2, verse: 2, verseIndex: 2, text: 'The earth was formless' },
    ],
    references: [{ id: 9, noteId: 3, startIndex: 1, endIndex: 1, noteTitle: 'n' }],
};

let now;
let onStep;
let onExit;

const setup = async () => {
    const utils = render(
        <Reader books={books} position={{ bookId: 1, chapter: 1 }} notesRevision={0} onStep={onStep} onExit={onExit} />
    );
    await screen.findByText('In the beginning');
    return { ...utils, body: utils.container.querySelector('.analyze-reader-body') };
};

const touch = (el, from, to, ms) => {
    now = 1000;
    fireEvent.touchStart(el, { changedTouches: [{ clientX: from[0], clientY: from[1] }] });
    now = 1000 + ms;
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: to[0], clientY: to[1] }] });
};

beforeEach(() => {
    localStorage.clear();
    fetchJson.mockReset();
    fetchJson.mockResolvedValue(payload);
    onStep = jest.fn();
    onExit = jest.fn();
    now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
});

afterEach(() => jest.restoreAllMocks());

test('renders a labelled section with the header and tinted verses', async () => {
    const { container } = await setup();

    expect(screen.getByRole('region', { name: 'Reader' })).toBeInTheDocument();
    expect(container.querySelector('.analyze-reader-header')).toHaveTextContent('Genesis 1');
    const rows = container.querySelectorAll('.analyze-reader-verse');
    expect(rows[0]).toHaveAttribute('data-verse-index', '1');
    expect(rows[0]).toHaveClass('analyze-verse--tint-1');
    expect(rows[1]).not.toHaveClass('analyze-verse--tint-1');
    expect(fetchJson).toHaveBeenCalledWith('/chapter/1/1', expect.anything());
});

test.each([
    ['left swipe', [500, 300], [300, 305], 1],
    ['right-edge tap', [950, 300], [950, 300], 1],
    ['right-edge click', null, [950, 300], 1],
    ['right swipe', [300, 300], [500, 305], -1],
    ['left-edge tap', [50, 300], [50, 300], -1],
    ['left-edge click', null, [50, 300], -1],
])('%s steps %s', async (name, from, to, direction) => {
    const { body } = await setup();
    if (from) touch(body, from, to, 100);
    else fireEvent.click(body, { clientX: to[0], clientY: to[1] });
    expect(onStep).toHaveBeenCalledTimes(1);
    expect(onStep).toHaveBeenCalledWith(direction);
});

test('a vertical drag calls nothing', async () => {
    const { body } = await setup();
    touch(body, [500, 100], [500, 400], 200);
    expect(onStep).not.toHaveBeenCalled();
    expect(document.querySelector('.analyze-reader-overlay')).toBeNull();
});

test('the click that follows a touch is ignored, a later one is not', async () => {
    const { body } = await setup();
    touch(body, [950, 300], [950, 300], 100);
    now += 100;
    fireEvent.click(body, { clientX: 950, clientY: 300 });
    expect(onStep).toHaveBeenCalledTimes(1);
    now += 600;
    fireEvent.click(body, { clientX: 950, clientY: 300 });
    expect(onStep).toHaveBeenCalledTimes(2);
});

test('a middle tap toggles the overlay', async () => {
    const { body } = await setup();
    touch(body, [500, 300], [500, 300], 100);
    const overlay = document.querySelector('.analyze-reader-overlay');
    expect(overlay).toHaveTextContent('Genesis 1');
    expect(screen.getByRole('button', { name: 'Exit reader' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Smaller text' })).toBeInTheDocument();
    expect(onStep).not.toHaveBeenCalled();

    touch(body, [500, 300], [500, 300], 100);
    expect(document.querySelector('.analyze-reader-overlay')).toBeNull();
});

test('Larger text grows the size and disables at the largest', async () => {
    localStorage.setItem(TEXT_SIZE_KEY, '3');
    const { body } = await setup();
    const section = screen.getByRole('region', { name: 'Reader' });
    expect(section.style.getPropertyValue('--reader-text-size')).toBe('25px');

    touch(body, [500, 300], [500, 300], 100);
    fireEvent.click(screen.getByRole('button', { name: 'Larger text' }));
    expect(section.style.getPropertyValue('--reader-text-size')).toBe('28px');
    expect(screen.getByRole('button', { name: 'Larger text' })).toBeDisabled();
});

test('Exit reader calls onExit', async () => {
    const { body } = await setup();
    touch(body, [500, 300], [500, 300], 100);
    fireEvent.click(screen.getByRole('button', { name: 'Exit reader' }));
    expect(onExit).toHaveBeenCalledTimes(1);
});

test('arrow keys step and Escape exits', async () => {
    await setup();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onStep).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onStep).toHaveBeenLastCalledWith(-1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
});
