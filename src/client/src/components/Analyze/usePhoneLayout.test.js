import { renderHook, act } from '@testing-library/react';
import usePhoneLayout, { PHONE_QUERY } from './usePhoneLayout';

function stubMatchMedia(initial) {
    const listeners = new Set();
    const mql = {
        matches: initial,
        addEventListener: jest.fn((type, fn) => listeners.add(fn)),
        removeEventListener: jest.fn((type, fn) => listeners.delete(fn)),
    };
    window.matchMedia = jest.fn(() => mql);
    return {
        mql,
        fire(matches) {
            mql.matches = matches;
            listeners.forEach((fn) => fn({ matches }));
        },
        listeners,
    };
}

describe('usePhoneLayout', () => {
    afterEach(() => {
        delete window.matchMedia;
    });

    it('uses the 600px query', () => {
        expect(PHONE_QUERY).toBe('(max-width: 600px)');
    });

    it('returns false when matchMedia is undefined', () => {
        delete window.matchMedia;
        const { result } = renderHook(() => usePhoneLayout());
        expect(result.current).toBe(false);
    });

    it('returns true when the query matches', () => {
        stubMatchMedia(true);
        const { result } = renderHook(() => usePhoneLayout());
        expect(window.matchMedia).toHaveBeenCalledWith(PHONE_QUERY);
        expect(result.current).toBe(true);
    });

    it('returns false when the query does not match', () => {
        stubMatchMedia(false);
        const { result } = renderHook(() => usePhoneLayout());
        expect(result.current).toBe(false);
    });

    it('follows change events and removes its listener on unmount', () => {
        const stub = stubMatchMedia(false);
        const { result, unmount } = renderHook(() => usePhoneLayout());
        act(() => stub.fire(true));
        expect(result.current).toBe(true);
        act(() => stub.fire(false));
        expect(result.current).toBe(false);
        unmount();
        expect(stub.listeners.size).toBe(0);
        expect(stub.mql.removeEventListener).toHaveBeenCalledTimes(1);
    });
});
