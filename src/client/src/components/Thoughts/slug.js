// The client half of a topic's slug rule.
//
// It is generated as you type so the field is never empty when you submit, and
// the server derives it again from the name it receives — this is a convenience
// for the form, not the authority. Keep it in step with src/lib/slug.js; the
// two cannot share a module because Create React App will not import from
// outside src/client/src.
export const MAX_SLUG_LENGTH = 255;

// "Faith & Works!" -> "faith-works". Accents decompose first (NFKD splits "é"
// into "e" plus a combining mark) so "Fé" slugs as "fe" rather than losing the
// letter entirely.
export const slugify = (value) => String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    // The slice can leave a trailing separator behind; strip it again.
    .replace(/-+$/, '');
