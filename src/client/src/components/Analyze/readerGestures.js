// Judges a finished touch. Vertical scrolling stays native (touch-action: pan-y),
// so nothing here tracks a touch in progress except the long-press cancel.
export const TAP_SLOP_PX = 10;
export const TAP_MAX_MS = 350;
export const SWIPE_MIN_PX = 60;
export const LONG_PRESS_MS = 500;
export const EDGE_FRACTION = 0.2;

// True once either axis has moved past what a tap allows.
export function exceedsSlop({ dx, dy }) {
    return Math.abs(dx) > TAP_SLOP_PX || Math.abs(dy) > TAP_SLOP_PX;
}

export function classifyTouch({ dx, dy, ms }) {
    if (!exceedsSlop({ dx, dy }) && ms <= TAP_MAX_MS) return 'tap';
    const isHorizontal = Math.abs(dx) >= 2 * Math.abs(dy);
    if (dx <= -SWIPE_MIN_PX && isHorizontal) return 'swipeNext';
    if (dx >= SWIPE_MIN_PX && isHorizontal) return 'swipePrev';
    return 'none';
}

export function tapZone(x, width) {
    if (x < width * EDGE_FRACTION) return 'prev';
    if (x > width * (1 - EDGE_FRACTION)) return 'next';
    return 'middle';
}
