import { classifyTouch, exceedsSlop, tapZone } from './readerGestures';

describe('classifyTouch', () => {
    test.each([
        [{ dx: 0, dy: 0, ms: 100 }, 'tap'],
        [{ dx: 10, dy: -10, ms: 350 }, 'tap'],
        [{ dx: 11, dy: 0, ms: 100 }, 'none'],
        [{ dx: 0, dy: 11, ms: 100 }, 'none'],
        [{ dx: 0, dy: 0, ms: 351 }, 'none'],
        [{ dx: -60, dy: 0, ms: 200 }, 'swipeNext'],
        [{ dx: -60, dy: 30, ms: 900 }, 'swipeNext'],
        [{ dx: -59, dy: 0, ms: 200 }, 'none'],
        [{ dx: 60, dy: 0, ms: 200 }, 'swipePrev'],
        [{ dx: 60, dy: -30, ms: 200 }, 'swipePrev'],
        [{ dx: 59, dy: 0, ms: 200 }, 'none'],
        [{ dx: -80, dy: 41, ms: 200 }, 'none'],
        [{ dx: 80, dy: -41, ms: 200 }, 'none'],
        [{ dx: -30, dy: 200, ms: 200 }, 'none'],
    ])('%j is %s', (touch, expected) => {
        expect(classifyTouch(touch)).toBe(expected);
    });
});

describe('exceedsSlop', () => {
    test.each([
        [{ dx: 10, dy: 10 }, false],
        [{ dx: -10, dy: 0 }, false],
        [{ dx: 11, dy: 0 }, true],
        [{ dx: 0, dy: -11 }, true],
    ])('%j is %s', (move, expected) => {
        expect(exceedsSlop(move)).toBe(expected);
    });
});

describe('tapZone', () => {
    test.each([
        [0, 100, 'prev'],
        [19, 100, 'prev'],
        [20, 100, 'middle'],
        [50, 100, 'middle'],
        [80, 100, 'middle'],
        [81, 100, 'next'],
        [100, 100, 'next'],
    ])('x=%d of %d is %s', (x, width, expected) => {
        expect(tapZone(x, width)).toBe(expected);
    });
});
