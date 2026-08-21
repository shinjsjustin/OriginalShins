import { slugify, MAX_SLUG_LENGTH } from './slug';

describe('slugify', () => {
    test('lowercases and joins words with hyphens', () => {
        expect(slugify('The Kingdom of God')).toBe('the-kingdom-of-god');
    });

    test('drops punctuation rather than encoding it', () => {
        expect(slugify('Faith & Works!')).toBe('faith-works');
    });

    test('strips accents instead of dropping the letter', () => {
        expect(slugify('Fé')).toBe('fe');
    });

    test('trims separators from both ends', () => {
        expect(slugify('  --Grace--  ')).toBe('grace');
    });

    test('returns an empty string when a name has nothing sluggable', () => {
        expect(slugify('***')).toBe('');
    });

    test('never exceeds the column width, and never ends on a separator', () => {
        const slug = slugify('word '.repeat(200));

        expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
        expect(slug.endsWith('-')).toBe(false);
    });
});
