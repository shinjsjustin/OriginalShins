import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import useOpenScroll, { parseScrollId } from './useOpenScroll';

const setup = (url) => renderHook(
    () => ({ view: useOpenScroll(), location: useLocation() }),
    { wrapper: ({ children }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter> }
);

describe('useOpenScroll', () => {
    it.each([
        ['/scrolls?scroll=12', 12],
        ['/scrolls', null],
        ['/scrolls?scroll=abc', null],
        ['/scrolls?scroll=0', null],
        ['/scrolls?scroll=-3', null],
        ['/scrolls?scroll=1.5', null],
        ['/scrolls?scroll=', null],
    ])('reads %s as %s', (url, expected) => {
        const { result } = setup(url);
        expect(result.current.view.scrollId).toBe(expected);
    });

    it('open sets the param and close drops it, keeping other params', () => {
        const { result } = setup('/scrolls?x=1');
        act(() => result.current.view.open(7));
        expect(result.current.view.scrollId).toBe(7);
        expect(result.current.location.search).toBe('?x=1&scroll=7');
        act(() => result.current.view.close());
        expect(result.current.view.scrollId).toBeNull();
        expect(result.current.location.search).toBe('?x=1');
    });

    it('open pushes a history entry', () => {
        const { result } = setup('/scrolls');
        act(() => result.current.view.open(7));
        expect(result.current.location.search).toBe('?scroll=7');
        expect(parseScrollId('7')).toBe(7);
    });

    it('open with a malformed id drops the param', () => {
        const { result } = setup('/scrolls?scroll=3');
        act(() => result.current.view.open('abc'));
        expect(result.current.view.scrollId).toBeNull();
    });
});
