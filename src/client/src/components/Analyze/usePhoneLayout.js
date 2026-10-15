import { useEffect, useState } from 'react';

export const PHONE_QUERY = '(max-width: 600px)';

// jsdom has no matchMedia; absence means desktop.
function matchPhone() {
    return typeof window.matchMedia === 'function'
        ? window.matchMedia(PHONE_QUERY)
        : null;
}

export default function usePhoneLayout() {
    const [isPhone, setIsPhone] = useState(() => matchPhone()?.matches ?? false);

    useEffect(() => {
        const mql = matchPhone();
        if (!mql) return undefined;
        const onChange = (e) => setIsPhone(e.matches);
        setIsPhone(mql.matches);
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, []);

    return isPhone;
}
