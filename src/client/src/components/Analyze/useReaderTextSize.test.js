import { renderHook, act } from '@testing-library/react';
import useReaderTextSize from './useReaderTextSize';
import { TEXT_SIZE_KEY, TEXT_SIZES, DEFAULT_TEXT_SIZE_STEP } from './readerTextSize';

beforeEach(() => localStorage.clear());

test('starts at the default step when nothing is stored', () => {
    const { result } = renderHook(() => useReaderTextSize());
    expect(result.current.step).toBe(DEFAULT_TEXT_SIZE_STEP);
    expect(result.current.size).toBe(TEXT_SIZES[DEFAULT_TEXT_SIZE_STEP]);
});

test('restores the stored step on mount', () => {
    localStorage.setItem(TEXT_SIZE_KEY, '3');
    const { result } = renderHook(() => useReaderTextSize());
    expect(result.current.step).toBe(3);
    expect(result.current.size).toBe(25);
});

test('falls back to the default for a garbage stored value', () => {
    localStorage.setItem(TEXT_SIZE_KEY, 'huge');
    const { result } = renderHook(() => useReaderTextSize());
    expect(result.current.step).toBe(DEFAULT_TEXT_SIZE_STEP);
});

test('grow and shrink move one step and write it to storage', () => {
    const { result } = renderHook(() => useReaderTextSize());
    act(() => result.current.grow());
    expect(result.current.step).toBe(2);
    expect(localStorage.getItem(TEXT_SIZE_KEY)).toBe('2');
    act(() => result.current.shrink());
    act(() => result.current.shrink());
    expect(result.current.step).toBe(0);
    expect(localStorage.getItem(TEXT_SIZE_KEY)).toBe('0');
});

test('reports canShrink and canGrow at both ends and clamps', () => {
    localStorage.setItem(TEXT_SIZE_KEY, '0');
    const { result } = renderHook(() => useReaderTextSize());
    expect(result.current.canShrink).toBe(false);
    expect(result.current.canGrow).toBe(true);
    act(() => result.current.shrink());
    expect(result.current.step).toBe(0);
    for (let i = 0; i < 10; i++) act(() => result.current.grow());
    expect(result.current.step).toBe(TEXT_SIZES.length - 1);
    expect(result.current.canGrow).toBe(false);
    expect(result.current.canShrink).toBe(true);
});
