import { renderHook, act } from '@testing-library/react';
import useWakeLock from './useWakeLock';

let visibility;
let request;
let sentinels;

function setVisibility(value) {
    visibility = value;
    document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    sentinels = [];
    request = jest.fn(() => {
        const sentinel = { release: jest.fn(() => Promise.resolve()) };
        sentinels.push(sentinel);
        return Promise.resolve(sentinel);
    });
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
});

afterEach(() => {
    delete navigator.wakeLock;
});

test('requests a screen lock while active', async () => {
    await act(async () => { renderHook(() => useWakeLock(true)); });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('screen');
});

test('requests nothing while inactive', async () => {
    await act(async () => { renderHook(() => useWakeLock(false)); });
    expect(request).not.toHaveBeenCalled();
});

test('requests nothing while the page is hidden', async () => {
    visibility = 'hidden';
    await act(async () => { renderHook(() => useWakeLock(true)); });
    expect(request).not.toHaveBeenCalled();
});

test('requests again when the page becomes visible', async () => {
    await act(async () => { renderHook(() => useWakeLock(true)); });
    await act(async () => { setVisibility('hidden'); });
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => { setVisibility('visible'); });
    expect(request).toHaveBeenCalledTimes(2);
});

test('releases the lock on deactivate', async () => {
    let hook;
    await act(async () => {
        hook = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } });
    });
    await act(async () => { hook.rerender({ on: false }); });
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
    await act(async () => { setVisibility('hidden'); setVisibility('visible'); });
    expect(request).toHaveBeenCalledTimes(1);
});

test('releases the lock on unmount and stops listening', async () => {
    let hook;
    await act(async () => { hook = renderHook(() => useWakeLock(true)); });
    hook.unmount();
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
    await act(async () => { setVisibility('hidden'); setVisibility('visible'); });
    expect(request).toHaveBeenCalledTimes(1);
});

test('does nothing and does not throw without navigator.wakeLock', async () => {
    delete navigator.wakeLock;
    await act(async () => { renderHook(() => useWakeLock(true)); });
    expect(request).not.toHaveBeenCalled();
});

test('a rejected request raises no error', async () => {
    request.mockImplementation(() => Promise.reject(new Error('NotAllowedError')));
    let hook;
    await act(async () => { hook = renderHook(() => useWakeLock(true)); });
    expect(hook.result.error).toBeUndefined();
    hook.unmount();
});

test('a lock granted after unmount is released', async () => {
    let resolve;
    request.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const hook = renderHook(() => useWakeLock(true));
    hook.unmount();
    const sentinel = { release: jest.fn(() => Promise.resolve()) };
    await act(async () => { resolve(sentinel); });
    expect(sentinel.release).toHaveBeenCalledTimes(1);
});
