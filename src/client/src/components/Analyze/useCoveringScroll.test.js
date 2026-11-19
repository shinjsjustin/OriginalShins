import { renderHook, waitFor } from '@testing-library/react';
import useCoveringScroll from './useCoveringScroll';
import { fetchJson } from '../../config/api';

jest.mock('../../config/api');

beforeEach(() => fetchJson.mockReset());

describe('useCoveringScroll', () => {
    test('fetches the covering scroll for the position when enabled', async () => {
        fetchJson.mockResolvedValue({ scroll: { id: 4 } });
        const { result } = renderHook(() => useCoveringScroll({ bookId: 43, chapter: 3 }, true));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(fetchJson).toHaveBeenCalledWith('/scrolls/covering?book=43&chapter=3', expect.objectContaining({ signal: expect.anything() }));
        expect(result.current.scroll).toEqual({ id: 4 });
        expect(result.current.error).toBe('');
    });

    test('scroll is null when nothing covers the chapter', async () => {
        fetchJson.mockResolvedValue({ scroll: null });
        const { result } = renderHook(() => useCoveringScroll({ bookId: 43, chapter: 3 }, true));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.scroll).toBeNull();
    });

    test('makes no request while disabled, and fetches once enabled', async () => {
        fetchJson.mockResolvedValue({ scroll: null });
        const { result, rerender } = renderHook(
            ({ on }) => useCoveringScroll({ bookId: 43, chapter: 3 }, on),
            { initialProps: { on: false } }
        );
        expect(fetchJson).not.toHaveBeenCalled();
        expect(result.current.isLoading).toBe(false);
        rerender({ on: true });
        await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(1));
    });

    test('refetches on chapter change and aborts the old request', async () => {
        fetchJson.mockReturnValue(new Promise(() => {}));
        const { rerender } = renderHook(
            ({ pos }) => useCoveringScroll(pos, true),
            { initialProps: { pos: { bookId: 43, chapter: 3 } } }
        );
        const firstSignal = fetchJson.mock.calls[0][1].signal;
        expect(firstSignal.aborted).toBe(false);
        rerender({ pos: { bookId: 43, chapter: 4 } });
        expect(firstSignal.aborted).toBe(true);
        expect(fetchJson).toHaveBeenLastCalledWith('/scrolls/covering?book=43&chapter=4', expect.anything());
    });

    test('does not refetch when only the position object identity changes', async () => {
        fetchJson.mockResolvedValue({ scroll: null });
        const { result, rerender } = renderHook(
            ({ pos }) => useCoveringScroll(pos, true),
            { initialProps: { pos: { bookId: 1, chapter: 1 } } }
        );
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        rerender({ pos: { bookId: 1, chapter: 1 } });
        expect(fetchJson).toHaveBeenCalledTimes(1);
    });

    test('reports its own error wording on failure, and ignores an abort', async () => {
        fetchJson.mockRejectedValue(new Error('We could not find that.'));
        const { result } = renderHook(() => useCoveringScroll({ bookId: 43, chapter: 3 }, true));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.error).toBe('Could not check for a scroll on this chapter.');
        expect(result.current.scroll).toBeNull();
    });
});
