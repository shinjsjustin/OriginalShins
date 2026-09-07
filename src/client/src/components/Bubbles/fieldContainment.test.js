import fs from 'fs';
import path from 'path';

// ─── The one thing about this canvas that only a browser can see ────────────
//
// `.thoughts-field` is `position: absolute; inset: 0` — it takes its host's
// whole box, ignoring padding, because the layout functions measure that box
// and lay cards across all of it. Absolute means "the nearest POSITIONED
// ancestor", so the rule quietly carries a requirement with it: every box that
// renders the field has to establish a containing block, or the field escapes
// to whatever above it happens to be positioned.
//
// The import picker is where that went wrong. Its column is a field over a
// confirm bar, and `.bubble-picker-field` was written without `position`, so
// the field's `inset: 0` resolved against `.bubble-overlay-surface` — the whole
// overlay — and it stretched down over the bar. Nothing looked wrong: the field
// paints no background, so Cancel and Import were still perfectly visible,
// sitting under a transparent layer that swallowed every click on them.
//
// No test could have caught it. jsdom computes no layout, so the render tests
// see the same tree either way, and every unit test drives its clicks straight
// at an element rather than through a hit test. What is checkable is the CSS
// contract itself, so that is what this asserts: the field is absolute, and
// each of its two hosts is positioned.

const cssFile = (...segments) => fs.readFileSync(
    path.join(__dirname, ...segments),
    'utf8'
);

const BUBBLES_CSS = cssFile('Bubbles.css');
const THOUGHTS_CSS = cssFile('..', 'Styling', 'Thoughts.css');

/**
 * The declarations inside one rule block, comments stripped.
 *
 * Deliberately naive — one selector, its first block — because the point is to
 * read a property off a rule a human wrote, not to be a CSS parser. A selector
 * that stops matching returns null and fails on the `toBeTruthy` below, rather
 * than silently passing on an empty block.
 */
const ruleBody = (css, selector) => {
    const match = css.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`));
    return match ? match[1].replace(/\/\*[\s\S]*?\*\//g, '') : null;
};

const positionOf = (css, selector) => {
    const body = ruleBody(css, selector);
    expect(body).toBeTruthy();
    const match = body.match(/(?:^|;)\s*position\s*:\s*([a-z]+)/);
    return match ? match[1] : null;
};

// Anything but `static` establishes a containing block for an absolutely
// positioned child. `relative` is what both hosts use, but the assertion is
// about the property that matters rather than the value one of them happens
// to have picked.
const CONTAINING = ['relative', 'absolute', 'fixed', 'sticky'];

describe('the field and the boxes that host it', () => {
    test('the field is absolutely positioned, which is what makes its host matter', () => {
        expect(positionOf(THOUGHTS_CSS, '.thoughts-field')).toBe('absolute');
    });

    test('the picker\'s field box contains the canvas, so the bar below stays clickable', () => {
        expect(CONTAINING).toContain(positionOf(BUBBLES_CSS, '.bubble-picker-field'));
    });

    test('the Thoughts canvas contains the field it draws', () => {
        expect(CONTAINING).toContain(positionOf(THOUGHTS_CSS, '.thoughts-canvas'));
    });
});
