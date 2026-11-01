import { renderHook, waitFor } from '@testing-library/react';
import useChapter from './useChapter';
import { fetchJson } from '../../config/api';

jest.mock('../../config/api');

const payload = { verses: [{ id: 1 }], references: [] };

beforeEach(() => {
    fetchJson.mockReset();
});

test('loads the chapter for the position', async () => {
    fetchJson.mockResolvedValue(payload);
    const { result } = renderHook(() => useChapter({ bookId: 40, chapter: 5 }, 0));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchJson).toHaveBeenCalledWith('/chapter/40/5', expect.objectContaining({ signal: expect.anything() }));
    expect(result.current.chapterData).toBe(payload);
    expect(result.current.error).toBe('');
});

test('refetches when the chapter changes', async () => {
    fetchJson.mockResolvedValue(payload);
    const { result, rerender } = renderHook(
        ({ pos }) => useChapter(pos, 0),
        { initialProps: { pos: { bookId: 40, chapter: 5 } } }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    rerender({ pos: { bookId: 40, chapter: 6 } });
    await waitFor(() => expect(fetchJson).toHaveBeenCalledWith('/chapter/40/6', expect.anything()));
    expect(fetchJson).toHaveBeenCalledTimes(2);
});

test('refetches when the revision changes', async () => {
    fetchJson.mockResolvedValue(payload);
    const { result, rerender } = renderHook(
        ({ rev }) => useChapter({ bookId: 1, chapter: 1 }, rev),
        { initialProps: { rev: 0 } }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    rerender({ rev: 1 });
    await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
});

test('does not refetch when only the position object identity changes', async () => {
    fetchJson.mockResolvedValue(payload);
    const { result, rerender } = renderHook(
        ({ pos }) => useChapter(pos, 0),
        { initialProps: { pos: { bookId: 1, chapter: 1 } } }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    rerender({ pos: { bookId: 1, chapter: 1 } });
    expect(fetchJson).toHaveBeenCalledTimes(1);
});

test('a failed fetch sets the error and clears the data', async () => {
    fetchJson.mockResolvedValueOnce(payload);
    const { result, rerender } = renderHook(
        ({ rev }) => useChapter({ bookId: 1, chapter: 1 }, rev),
        { initialProps: { rev: 0 } }
    );
    await waitFor(() => expect(result.current.chapterData).toBe(payload));

    fetchJson.mockRejectedValueOnce(new Error('We could not find that.'));
    rerender({ rev: 1 });

    await waitFor(() => expect(result.current.error).toBe('We could not find that.'));
    expect(result.current.chapterData).toBeNull();
    expect(result.current.isLoading).toBe(false);
});

test('an aborted fetch changes nothing', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    let rejectFirst;
    fetchJson.mockImplementationOnce(() => new Promise((_, reject) => { rejectFirst = reject; }));
    fetchJson.mockResolvedValueOnce(payload);
    const { result, rerender } = renderHook(
        ({ rev }) => useChapter({ bookId: 1, chapter: 1 }, rev),
        { initialProps: { rev: 0 } }
    );
    rerender({ rev: 1 });
    await waitFor(() => expect(result.current.chapterData).toBe(payload));

    rejectFirst(abort);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(result.current.error).toBe('');
    expect(result.current.chapterData).toBe(payload);
    expect(result.current.isLoading).toBe(false);
});

test('a superseded request is aborted', async () => {
    const signals = [];
    fetchJson.mockImplementation((path, { signal }) => {
        signals.push(signal);
        return new Promise(() => {});
    });
    const { rerender } = renderHook(
        ({ rev }) => useChapter({ bookId: 1, chapter: 1 }, rev),
        { initialProps: { rev: 0 } }
    );
    rerender({ rev: 1 });

    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
});
