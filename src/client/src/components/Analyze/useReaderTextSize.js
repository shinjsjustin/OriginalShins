import { useEffect, useState } from 'react';
import { TEXT_SIZES, TEXT_SIZE_KEY, parseStoredStep, stepTextSize } from './readerTextSize';

export default function useReaderTextSize() {
    const [step, setStep] = useState(() => parseStoredStep(localStorage.getItem(TEXT_SIZE_KEY)));

    useEffect(() => {
        localStorage.setItem(TEXT_SIZE_KEY, String(step));
    }, [step]);

    return {
        size: TEXT_SIZES[step],
        step,
        canShrink: step > 0,
        canGrow: step < TEXT_SIZES.length - 1,
        shrink: () => setStep((s) => stepTextSize(s, -1)),
        grow: () => setStep((s) => stepTextSize(s, 1)),
    };
}
