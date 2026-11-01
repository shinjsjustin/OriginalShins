import {
    TEXT_SIZES,
    DEFAULT_TEXT_SIZE_STEP,
    stepTextSize,
    parseStoredStep,
} from './readerTextSize';

describe('stepTextSize', () => {
    test.each([
        [1, 1, 2],
        [1, -1, 0],
        [4, 1, 4],
        [0, -1, 0],
        [3, 5, 4],
        [3, -9, 0],
    ])('step %d by %d is %d', (step, delta, expected) => {
        expect(stepTextSize(step, delta)).toBe(expected);
    });
});

describe('parseStoredStep', () => {
    test.each([
        ['0', 0],
        ['3', 3],
        ['4', 4],
        [2, 2],
    ])('%j is %d', (value, expected) => {
        expect(parseStoredStep(value)).toBe(expected);
    });

    test.each([null, undefined, '', 'abc', '1.5', '-1', '5', '99', 1.5, NaN])(
        '%j falls back to the default',
        (value) => {
            expect(parseStoredStep(value)).toBe(DEFAULT_TEXT_SIZE_STEP);
        }
    );
});

test('the sizes and default are the specified ones', () => {
    expect(TEXT_SIZES).toEqual([18, 20, 22, 25, 28]);
    expect(TEXT_SIZES[DEFAULT_TEXT_SIZE_STEP]).toBe(20);
});
