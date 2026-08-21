import { countLabel } from './format';

describe('countLabel', () => {
    test('keeps the noun singular for exactly one', () => {
        expect(countLabel(1, 'idea')).toBe('1 idea');
    });

    test('pluralizes anything else', () => {
        expect(countLabel(2, 'idea')).toBe('2 ideas');
    });

    test('prints zero rather than hiding it — an empty topic is a real state', () => {
        expect(countLabel(0, 'note')).toBe('0 notes');
    });
});
