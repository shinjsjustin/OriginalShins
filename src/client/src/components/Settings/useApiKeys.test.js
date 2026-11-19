import { renderHook, act, waitFor } from '@testing-library/react';
import useApiKeys from './useApiKeys';

const KEY = { id: 5, name: 'Phone', hint: 'beef', createdAt: '2026-01-02T00:00:00.000Z', lastUsedAt: null };

const reply = (status, body) => Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
});

describe('useApiKeys', () => {
    let calls;
    let handler;

    beforeEach(() => {
        process.env.REACT_APP_URL = 'http://api';
        localStorage.setItem('token', 't');
        calls = [];
        handler = () => reply(200, { keys: [] });
        global.fetch = jest.fn((url, opts) => {
            calls.push({ url, method: opts.method, body: opts.body });
            return handler(url, opts);
        });
    });

    it('useApiKeys loads GET /keys on mount', async () => {
        handler = () => reply(200, { keys: [KEY] });
        const { result } = renderHook(() => useApiKeys());
        await waitFor(() => expect(result.current.keys).toEqual([KEY]));
        expect(calls[0]).toMatchObject({ url: 'http://api/keys', method: 'GET' });
        expect(result.current.isLoading).toBe(false);
    });

    it('useApiKeys create POSTs exactly the trimmed name and holds the secret until dismissed', async () => {
        let created = false;
        handler = (url, opts) => {
            if (opts.method === 'POST') { created = true; return reply(201, { key: KEY, secret: 'scr_beef' }); }
            return reply(200, { keys: created ? [KEY] : [] });
        };
        const { result } = renderHook(() => useApiKeys());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => { await result.current.create('  Phone '); });

        const post = calls.find((c) => c.method === 'POST');
        expect(post.url).toBe('http://api/keys');
        expect(post.body).toBe(JSON.stringify({ name: 'Phone' }));
        expect(result.current.newKey).toEqual({ secret: 'scr_beef', name: 'Phone' });
        expect(result.current.keys).toEqual([KEY]);

        act(() => result.current.dismissNewKey());
        expect(result.current.newKey).toBeNull();
    });

    it('useApiKeys create failure sets key-worded error and no newKey', async () => {
        handler = (url, opts) => (opts.method === 'POST' ? reply(409, {}) : reply(200, { keys: [] }));
        const { result } = renderHook(() => useApiKeys());
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        await act(async () => { await result.current.create('Phone'); });
        expect(result.current.error).toBe('Could not create the key.');
        expect(result.current.newKey).toBeNull();
    });

    it('useApiKeys revoke DELETEs /keys/:id and drops that key', async () => {
        const other = { ...KEY, id: 6, name: 'Laptop' };
        handler = (url, opts) => (opts.method === 'DELETE' ? reply(204) : reply(200, { keys: [KEY, other] }));
        const { result } = renderHook(() => useApiKeys());
        await waitFor(() => expect(result.current.keys).toHaveLength(2));

        await act(async () => { await result.current.revoke(5); });

        expect(calls.find((c) => c.method === 'DELETE').url).toBe('http://api/keys/5');
        expect(result.current.keys).toEqual([other]);
    });

    it('useApiKeys revoke failure keeps the key and sets key-worded error', async () => {
        handler = (url, opts) => (opts.method === 'DELETE' ? reply(404, {}) : reply(200, { keys: [KEY] }));
        const { result } = renderHook(() => useApiKeys());
        await waitFor(() => expect(result.current.keys).toHaveLength(1));
        await act(async () => { await result.current.revoke(5); });
        expect(result.current.keys).toEqual([KEY]);
        expect(result.current.error).toBe('Could not revoke the key.');
    });
});
