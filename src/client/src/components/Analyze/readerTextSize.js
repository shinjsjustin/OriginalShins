export const TEXT_SIZES = [18, 20, 22, 25, 28];
export const DEFAULT_TEXT_SIZE_STEP = 1;
export const TEXT_SIZE_KEY = 'analyze.reader.textSize';

export function stepTextSize(step, delta) {
    return Math.min(TEXT_SIZES.length - 1, Math.max(0, step + delta));
}

// localStorage hands back strings, and anything stored there may be stale or hand-edited.
export function parseStoredStep(value) {
    const step = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (!Number.isInteger(step) || step < 0 || step >= TEXT_SIZES.length) {
        return DEFAULT_TEXT_SIZE_STEP;
    }
    return step;
}
