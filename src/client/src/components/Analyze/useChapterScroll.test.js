import { renderHook } from '@testing-library/react';
import useChapterScroll, { resetScrollMemory } from './useChapterScroll';

beforeEach(() => resetScrollMemory());

function setup(initial) {
    const el = document.createElement('div');
    el.scrollTop = 0;
    const ref = { current: el };
    const hook = renderHook((props) => useChapterScroll(ref, props.key_, props.ready), {
        initialProps: initial,
    });
    return { el, hook };
}

test('starts an unseen chapter at 0 once ready', () => {
    const { el } = setup({ key_: '1.1', ready: true });
    expect(el.scrollTop).toBe(0);
});

test('waits for isReady before restoring', () => {
    const { el, hook } = setup({ key_: '1.1', ready: false });
    el.scrollTop = 40;
    hook.rerender({ key_: '1.1', ready: false });
    expect(el.scrollTop).toBe(40);
    hook.rerender({ key_: '1.1', ready: true });
    expect(el.scrollTop).toBe(0);
});

test('restores a chapter saved scrollTop when returning to it', () => {
    const { el, hook } = setup({ key_: '1.1', ready: true });
    el.scrollTop = 300;
    hook.rerender({ key_: '1.2', ready: false });
    hook.rerender({ key_: '1.2', ready: true });
    expect(el.scrollTop).toBe(0);
    el.scrollTop = 50;
    hook.rerender({ key_: '1.1', ready: false });
    hook.rerender({ key_: '1.1', ready: true });
    expect(el.scrollTop).toBe(300);
    hook.rerender({ key_: '1.2', ready: true });
    expect(el.scrollTop).toBe(50);
});

test('saves on unmount, kept for a later mount', () => {
    const first = setup({ key_: '2.5', ready: true });
    first.el.scrollTop = 120;
    first.hook.unmount();
    const second = setup({ key_: '2.5', ready: true });
    expect(second.el.scrollTop).toBe(120);
});

test('resetScrollMemory forgets saved positions', () => {
    const first = setup({ key_: '2.5', ready: true });
    first.el.scrollTop = 120;
    first.hook.unmount();
    resetScrollMemory();
    expect(setup({ key_: '2.5', ready: true }).el.scrollTop).toBe(0);
});
