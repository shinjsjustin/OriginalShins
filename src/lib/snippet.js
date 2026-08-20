// The excerpt a search result shows under its title.
//
// One module because all four result groups want the same thing: a short,
// single-line window of the text that shows WHY the row matched. A note that
// matched on its body and a verse that matched on its text are the same problem
// — find the term, show enough around it to read, and mark where the text was
// cut.
//
// Pure and free of any database or request shape, so the search queries stay
// about SQL and this stays about strings.

// Long enough for a clause either side of the term, short enough that twenty
// results still read as a list rather than as a page of prose.
const SNIPPET_LENGTH = 160;

const ELLIPSIS = '…';

// Note bodies are markdown and verses carry no newlines of their own, but both
// arrive with whatever whitespace the writer left. A snippet is one line.
const collapseWhitespace = (text) => String(text == null ? '' : text).replace(/\s+/g, ' ').trim();

// Where to start the window so `term` sits in the middle of it, clamped so the
// window never runs off either end of the text.
const windowStartFor = (text, at, term, maxLength) => {
    const padding = Math.max(0, Math.floor((maxLength - term.length) / 2));
    return Math.max(0, Math.min(at - padding, text.length - maxLength));
};

// A one-line excerpt of `text` centred on `term`, at most `maxLength`
// characters, with an ellipsis on whichever side was cut.
//
// A term the text does not contain is not an error: scripture matching is
// MATCH ... AGAINST, which matches on whole words the way MySQL tokenized them
// and not on the substring the caller typed, so a row can legitimately come
// back without the literal term in it. Those get the head of the text, which is
// still the useful thing to show.
const buildSnippet = (text, term, maxLength = SNIPPET_LENGTH) => {
    const collapsed = collapseWhitespace(text);
    if (collapsed.length <= maxLength) {
        return collapsed;
    }

    const needle = collapseWhitespace(term).toLowerCase();
    const at = needle.length === 0 ? -1 : collapsed.toLowerCase().indexOf(needle);

    if (at < 0) {
        return `${collapsed.slice(0, maxLength).trimEnd()}${ELLIPSIS}`;
    }

    const start = windowStartFor(collapsed, at, needle, maxLength);
    const end = start + maxLength;

    return [
        start > 0 ? ELLIPSIS : '',
        collapsed.slice(start, end).trim(),
        end < collapsed.length ? ELLIPSIS : '',
    ].join('');
};

module.exports = {
    SNIPPET_LENGTH,
    buildSnippet,
};
