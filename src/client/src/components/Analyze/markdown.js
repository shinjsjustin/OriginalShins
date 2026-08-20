import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Renders a note body for read mode.
//
// `notes.body` is markdown — the plan is explicit that it stays markdown until
// there is a reason for structured blocks, so this is a renderer and not an
// editor.
//
// marked emits HTML, which means the output is only ever handed to
// dangerouslySetInnerHTML. It goes through DOMPurify first: the author is the
// only reader today, but markdown permits raw HTML, and a body pasted in from
// somewhere else must not be able to run script just because the app trusts its
// own user.

marked.setOptions({
    gfm: true,
    breaks: true,
    // A note is a fragment inside a panel, not a document — heading anchors
    // would collide across notes and mean nothing.
    headerIds: false,
    mangle: false,
});

export const renderMarkdown = (source) => {
    if (typeof source !== 'string' || source.trim() === '') {
        return '';
    }

    return DOMPurify.sanitize(marked.parse(source));
};

// Leading block markers — heading hashes, blockquote arrows, bullet and
// numbered list markers — and the inline emphasis/code characters that would
// otherwise show up as punctuation in a one-line preview.
// Each alternative ends at whitespace or at the end of the line, so a line that
// is nothing but a marker reduces to an empty excerpt rather than to "#".
const LEADING_BLOCK_MARKER = /^(?:#{1,6}(?:\s+|$)|>\s*|[-*+](?:\s+|$)|\d+\.(?:\s+|$))/;
const INLINE_EMPHASIS = /[*_`~]/g;

// The first non-empty line, for the one-line preview in the notes list. Read
// off the raw markdown rather than the rendered HTML so the list never has to
// build a DOM per note — which does mean stripping the syntax by hand, since
// "## The first day" as a preview is worse than no preview at all.
export const excerptOf = (source, maxLength) => {
    if (typeof source !== 'string') {
        return '';
    }

    const firstLine = source
        .split('\n')
        .map(line => line.trim())
        .find(line => line.length > 0);

    if (!firstLine) {
        return '';
    }

    const plain = firstLine
        .replace(LEADING_BLOCK_MARKER, '')
        .replace(INLINE_EMPHASIS, '')
        .trim();

    return plain.length > maxLength
        ? `${plain.slice(0, maxLength).trimEnd()}…`
        : plain;
};
