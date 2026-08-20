import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '../../config/api';

// The pinned set: what the right-docked panel lists, and the only items on the
// page that can be edited at all.
//
// ── Why this one is optimistic when nothing else on the page is ────────────
//
// Every other write here goes through useThoughtsData's `revision`, which
// refetches rather than guessing, because a link write changes counts on rows
// the response never mentions. A pin changes nothing but itself. It has no
// counts, no cascade and no derived state anywhere — GET /api/pins would come
// back saying exactly what was just sent — so the refetch would buy nothing and
// cost the reader a visible lag on a toggle they expect to be instantaneous.
//
// So the toggle is applied locally first and the request follows. If it fails,
// the previous list goes back and the banner says why. That rollback is the
// entire justification for the optimism: it is safe precisely because the state
// being guessed at is one boolean the server cannot disagree with in any way
// more interesting than "no".
//
// ── Why the list is mirrored in a ref ──────────────────────────────────────
//
// Rolling back needs the list as it was before the write, and every callback
// here is stable across renders (the panel and every card hold them). Reading
// `pins` out of a closure would read whichever render created the callback, so
// the current list is kept in a ref beside the state and both are written
// through one setter.

const PINS_PATH = '/pins';

const matches = (pin, itemType, itemId) => pin.itemType === itemType && pin.itemId === itemId;

// The pointer half of a pin, which is all the API accepts. Sending a whole
// hydrated row back — title and timestamp included — would be sending the
// server its own data to ignore.
const targetOf = ({ itemType, itemId }) => ({ itemType, itemId });

const usePins = () => {
    const [pins, setPins] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionError, setActionError] = useState('');

    const pinsRef = useRef([]);

    const setPinList = useCallback((next) => {
        pinsRef.current = next;
        setPins(next);
    }, []);

    // On mount, and only on mount. Nothing invalidates this list but the writes
    // below, and each of those already knows what it did.
    useEffect(() => {
        const controller = new AbortController();

        fetchJson(PINS_PATH, { signal: controller.signal })
            .then(data => {
                pinsRef.current = data.pins || [];
                setPins(pinsRef.current);
                setError('');
            })
            .catch(err => {
                if (err.name === 'AbortError') return;
                pinsRef.current = [];
                setPins([]);
                setError(err.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            });

        return () => controller.abort();
    }, []);

    /**
     * Show `next` now, send `request`, and put the old list back if it fails.
     *
     * @returns whether the write landed
     */
    const runOptimistic = useCallback(async (next, request) => {
        const previous = pinsRef.current;
        setPinList(next);

        try {
            await request();
            setActionError('');
            return true;
        } catch (err) {
            setPinList(previous);
            setActionError(err.message);
            return false;
        }
    }, [setPinList]);

    const isPinned = useCallback(
        (itemType, itemId) => pins.some(pin => matches(pin, itemType, itemId)),
        [pins]
    );

    /**
     * Pin an unpinned item, unpin a pinned one.
     *
     * `title` is what the optimistic row shows until the next load replaces it
     * with the server's. The caller is a card that is displaying that title at
     * the moment it is clicked, so it always has one; unpinning ignores it, and
     * so the two-argument call in the panel is correct as it stands.
     */
    const togglePin = useCallback((itemType, itemId, title = '') => {
        const current = pinsRef.current;

        if (current.some(pin => matches(pin, itemType, itemId))) {
            return runOptimistic(
                current.filter(pin => !matches(pin, itemType, itemId)),
                () => fetchJson(PINS_PATH, {
                    method: 'DELETE',
                    body: { items: [{ itemType, itemId }] },
                })
            );
        }

        // Appended, because the server orders pins oldest first and this one is
        // the newest. `createdAt` is the client's clock only until the next
        // load; nothing sorts on it here, it is carried so an optimistic row
        // has the same shape as a real one.
        return runOptimistic(
            [...current, { itemType, itemId, title, createdAt: new Date().toISOString() }],
            () => fetchJson(PINS_PATH, { method: 'POST', body: { itemType, itemId } })
        );
    }, [runOptimistic]);

    /** Unpin a selection. A single-card unpin is a list of one. */
    const unpinMany = useCallback((items) => {
        const targets = (items || []).filter(Boolean).map(targetOf);
        if (targets.length === 0) {
            // Nothing selected is not a failed write, and the API refuses an
            // empty list rather than treating it as "clear".
            return Promise.resolve(true);
        }

        const current = pinsRef.current;
        const remaining = current.filter(
            pin => !targets.some(target => matches(pin, target.itemType, target.itemId))
        );

        return runOptimistic(
            remaining,
            () => fetchJson(PINS_PATH, { method: 'DELETE', body: { items: targets } })
        );
    }, [runOptimistic]);

    /** The panel's Clear. The confirm prompt belongs to the button, not here. */
    const clearPins = useCallback(
        () => runOptimistic([], () => fetchJson(`${PINS_PATH}/all`, { method: 'DELETE' })),
        [runOptimistic]
    );

    const dismissActionError = useCallback(() => setActionError(''), []);

    return {
        pins,
        isLoading,
        error,
        actionError,
        dismissActionError,
        isPinned,
        togglePin,
        unpinMany,
        clearPins,
    };
};

export default usePins;
