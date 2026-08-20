// A topic's slug: the stable, URL-safe half of its identity.
//
// The client derives it from the name as you type, but it is derived again here
// and never trusted: it ends up in a UNIQUE (user_id, slug) key and eventually
// in a URL, so its shape is the server's decision. `topics.name` stays free
// text — renaming a topic does not have to rewrite its slug.
const MAX_SLUG_LENGTH = 255;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// "Faith & Works!" -> "faith-works". Accented letters decompose first
// (NFKD splits "é" into "e" + a combining mark) so that "Fé" slugs as "fe"
// rather than losing the letter entirely.
const slugify = (value) => String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    // The slice can leave a trailing separator behind; strip it again.
    .replace(/-+$/, '');

const isValidSlug = (value) =>
    typeof value === 'string' && value.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(value);

module.exports = { MAX_SLUG_LENGTH, slugify, isValidSlug };
