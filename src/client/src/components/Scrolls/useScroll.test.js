import { renderHook, act, waitFor } from '@testing-library/react';
import useScrolls from './useScrolls';
import useScroll from './useScroll';

const reply = (status, body) => Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
});

const SUMMARY = (id, createdAt) => ({ id, title: `S${id}`, createdAt });
const Q = { id: 9, kind: 'question', body: 'Why?', answer: null };

describe('useScrolls', () => {
    let calls;
    let handler;

    beforeEach(() => {
        process.env.REACT_APP_URL = 'http://api';
        localStorage.setItem('token', 't');
        calls = [];
        handler = () => reply(200, {});
        global.fetch = jest.fn((url, opts) => {
            calls.push({ url, method: opts.method, body: opts.body });
            return handler(url, opts);
        });
    });

    it('useScrolls loads GET /scrolls newest first', async () => {
        handler = () => reply(200, { scrolls: [SUMMARY(1, '2026-01-01'), SUMMARY(2, '2026-02-01')] });
        const { result } = renderHook(() => useScrolls());
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(calls[0]).toMatchObject({ url: 'http://api/scrolls', method: 'GET' });
        expect(result.current.scrolls.map((s) => s.id)).toEqual([2, 1]);
    });

    it('useScrolls deleteScroll DELETEs then drops the scroll', async () => {
        handler = (url, opts) => (opts.method === 'DELETE'
            ? reply(204, null)
            : reply(200, { scrolls: [SUMMARY(1, '2026-01-01'), SUMMARY(2, '2026-02-01')] }));
        const { result } = renderHook(() => useScrolls());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => { await result.current.deleteScroll(2); });

        expect(calls.find((c) => c.method === 'DELETE').url).toBe('http://api/scrolls/2');
        expect(result.current.scrolls.map((s) => s.id)).toEqual([1]);
    });

    it('useScrolls keeps the scroll and words its own error when delete fails', async () => {
        handler = (url, opts) => (opts.method === 'DELETE'
            ? reply(409, {})
            : reply(200, { scrolls: [SUMMARY(1, '2026-01-01')] }));
        const { result } = renderHook(() => useScrolls());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => { await result.current.deleteScroll(1); });

        expect(result.current.scrolls).toHaveLength(1);
        expect(result.current.error).toBe('Could not delete the scroll.');
    });

    it('useScrolls reports its own error when the load fails', async () => {
        handler = () => reply(500, {});
        const { result } = renderHook(() => useScrolls());
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.error).toBe('Could not load your scrolls.');
    });
});

describe('useScroll', () => {
    let calls;
    let handler;

    beforeEach(() => {
        process.env.REACT_APP_URL = 'http://api';
        localStorage.setItem('token', 't');
        calls = [];
        handler = () => reply(200, { scroll: { id: 4, blocks: [Q] } });
        global.fetch = jest.fn((url, opts) => {
            calls.push({ url, method: opts.method, body: opts.body, signal: opts.signal });
            return handler(url, opts);
        });
    });

    it('useScroll loads GET /scrolls/:id', async () => {
        const { result } = renderHook(() => useScroll(4));
        await waitFor(() => expect(result.current.scroll).not.toBeNull());
        expect(calls[0]).toMatchObject({ url: 'http://api/scrolls/4', method: 'GET' });
        expect(result.current.isLoading).toBe(false);
    });

    it('useScroll saveAnswer PUTs exactly { answer } and replaces that block from the reply', async () => {
        const saved = { ...Q, answer: { text: 'Because' } };
        handler = (url, opts) => (opts.method === 'PUT'
            ? reply(200, { block: saved })
            : reply(200, { scroll: { id: 4, blocks: [Q, { id: 10, kind: 'note' }] } }));
        const { result } = renderHook(() => useScroll(4));
        await waitFor(() => expect(result.current.scroll).not.toBeNull());

        let ok;
        await act(async () => { ok = await result.current.saveAnswer(9, 'Because'); });

        const put = calls.find((c) => c.method === 'PUT');
        expect(put.url).toBe('http://api/scrolls/4/blocks/9/answer');
        expect(put.body).toBe(JSON.stringify({ answer: 'Because' }));
        expect(ok).toBe(true);
        expect(result.current.scroll.blocks).toEqual([saved, { id: 10, kind: 'note' }]);
    });

    it('useScroll saveAnswer resolves false with its own error and leaves the block', async () => {
        handler = (url, opts) => (opts.method === 'PUT'
            ? reply(422, {})
            : reply(200, { scroll: { id: 4, blocks: [Q] } }));
        const { result } = renderHook(() => useScroll(4));
        await waitFor(() => expect(result.current.scroll).not.toBeNull());

        let ok;
        await act(async () => { ok = await result.current.saveAnswer(9, 'x'); });

        expect(ok).toBe(false);
        expect(result.current.error).toBe('Could not save your answer.');
        expect(result.current.scroll.blocks).toEqual([Q]);
    });

    it('useScroll aborts the in-flight load when the id changes', async () => {
        handler = () => new Promise(() => {});
        const { rerender } = renderHook(({ id }) => useScroll(id), { initialProps: { id: 4 } });
        const first = calls[0].signal;
        rerender({ id: 5 });
        expect(first.aborted).toBe(true);
        expect(calls[1].url).toBe('http://api/scrolls/5');
    });
});
