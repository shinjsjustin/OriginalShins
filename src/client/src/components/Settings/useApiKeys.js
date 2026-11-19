import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../../config/api';

// The scroll API keys. Errors are worded here, not taken from fetchJson, whose
// 409/422 copy is about topics.
const useApiKeys = () => {
    const [keys, setKeys] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    // The secret lives only here, and only until the reader dismisses it.
    const [newKey, setNewKey] = useState(null);

    const load = useCallback(async () => {
        const data = await fetchJson('/keys');
        setKeys(data.keys);
    }, []);

    useEffect(() => {
        let isCurrent = true;
        load()
            .catch(() => { if (isCurrent) setError('Could not load your keys.'); })
            .finally(() => { if (isCurrent) setIsLoading(false); });
        return () => { isCurrent = false; };
    }, [load]);

    const create = useCallback(async (name) => {
        const trimmed = name.trim();
        setError(null);
        try {
            const { secret } = await fetchJson('/keys', { method: 'POST', body: { name: trimmed } });
            setNewKey({ secret, name: trimmed });
        } catch {
            setError('Could not create the key.');
            return;
        }
        try {
            await load();
        } catch {
            setError('Could not load your keys.');
        }
    }, [load]);

    const revoke = useCallback(async (id) => {
        setError(null);
        try {
            await fetchJson(`/keys/${id}`, { method: 'DELETE' });
            setKeys((current) => current.filter((key) => key.id !== id));
        } catch {
            setError('Could not revoke the key.');
        }
    }, []);

    const dismissNewKey = useCallback(() => setNewKey(null), []);

    return { keys, isLoading, error, newKey, create, revoke, dismissNewKey };
};

export default useApiKeys;
