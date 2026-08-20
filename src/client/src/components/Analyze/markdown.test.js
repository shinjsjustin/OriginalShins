import { excerptOf, renderMarkdown } from './markdown';

const EXCERPT_LENGTH = 80;

describe('renderMarkdown', () => {
    test('turns markdown into HTML', () => {
        const html = renderMarkdown('# Heading\n\nAnd God **said**.');

        expect(html).toContain('<h1');
        expect(html).toContain('<strong>said</strong>');
    });

    test('renders lists and blockquotes', () => {
        const html = renderMarkdown('- light\n- darkness\n\n> and there was light');

        expect(html).toContain('<li>light</li>');
        expect(html).toContain('<blockquote>');
    });

    test('returns nothing for an empty or missing body', () => {
        // A note created from a selection has no body yet; the editor shows a
        // placeholder rather than an empty rendered block.
        expect(renderMarkdown('')).toBe('');
        expect(renderMarkdown('   \n  ')).toBe('');
        expect(renderMarkdown(undefined)).toBe('');
        expect(renderMarkdown(null)).toBe('');
    });

    test('strips script tags a pasted body might carry', () => {
        // Markdown permits raw HTML, and the output goes to
        // dangerouslySetInnerHTML — so the sanitizer is load-bearing.
        const html = renderMarkdown('Before\n\n<script>window.stolen = 1;</script>\n\nAfter');

        expect(html).not.toContain('<script');
        expect(html).toContain('Before');
        expect(html).toContain('After');
    });

    test('strips inline event handlers', () => {
        const html = renderMarkdown('<img src="x" onerror="window.stolen = 1">');

        expect(html).not.toContain('onerror');
    });

    test('keeps ordinary links', () => {
        const html = renderMarkdown('[the plan](https://example.test/plan)');

        expect(html).toContain('href="https://example.test/plan"');
    });
});

describe('excerptOf', () => {
    test('takes the first non-empty line', () => {
        expect(excerptOf('\n\nFirst line\nSecond line', EXCERPT_LENGTH)).toBe('First line');
    });

    test('strips a leading heading marker', () => {
        // "## The first day" as a list preview reads as punctuation, not prose.
        expect(excerptOf('## The first day', EXCERPT_LENGTH)).toBe('The first day');
        expect(excerptOf('###### Deep heading', EXCERPT_LENGTH)).toBe('Deep heading');
    });

    test('strips leading list and quote markers', () => {
        expect(excerptOf('- light: Day', EXCERPT_LENGTH)).toBe('light: Day');
        expect(excerptOf('* darkness', EXCERPT_LENGTH)).toBe('darkness');
        expect(excerptOf('1. first', EXCERPT_LENGTH)).toBe('first');
        expect(excerptOf('> a quotation', EXCERPT_LENGTH)).toBe('a quotation');
    });

    test('strips inline emphasis characters', () => {
        expect(excerptOf('God **separated** the light', EXCERPT_LENGTH))
            .toBe('God separated the light');
    });

    test('truncates a long line with an ellipsis', () => {
        const excerpt = excerptOf('x'.repeat(200), 10);

        expect(excerpt).toBe(`${'x'.repeat(10)}…`);
    });

    test('leaves a line at the limit untruncated', () => {
        expect(excerptOf('x'.repeat(10), 10)).toBe('x'.repeat(10));
    });

    test('returns nothing for an empty or missing body', () => {
        expect(excerptOf('', EXCERPT_LENGTH)).toBe('');
        expect(excerptOf('\n\n  \n', EXCERPT_LENGTH)).toBe('');
        expect(excerptOf(undefined, EXCERPT_LENGTH)).toBe('');
    });

    test('does not leave a bare marker as the whole excerpt', () => {
        // A line that is only syntax reduces to nothing rather than to "#".
        expect(excerptOf('#  ', EXCERPT_LENGTH)).toBe('');
    });
});
