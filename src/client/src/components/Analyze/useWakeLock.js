import { useEffect } from 'react';

// Unsupported browsers and refused requests just skip the lock, so every rejection is dropped.
export default function useWakeLock(isActive) {
    useEffect(() => {
        if (!isActive || !navigator.wakeLock) return undefined;

        let sentinel = null;
        let isStopped = false;

        const acquire = async () => {
            if (document.visibilityState !== 'visible') return;
            try {
                const lock = await navigator.wakeLock.request('screen');
                if (isStopped) {
                    lock.release().catch(() => {});
                    return;
                }
                sentinel = lock;
            } catch (e) {
                // unsupported or refused: the screen simply may dim
            }
        };

        // iOS drops the lock whenever the app is hidden, so ask again on return.
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') acquire();
        };

        acquire();
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
            isStopped = true;
            document.removeEventListener('visibilitychange', onVisibilityChange);
            if (sentinel) sentinel.release().catch(() => {});
        };
    }, [isActive]);
}
