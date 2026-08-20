// Turns a chapter's note references into per-verse highlight data.
//
// Highlights are not stored — they are rendered from references, so this is the
// only place that decides what a verse looks like. Nothing here touches React
// or the DOM.

// Class names for the two tint depths. The tints themselves are CSS custom
// properties (--note-tint-*) so the palette lives with the rest of the tokens.
const TINT_SINGLE_CLASS = 'analyze-verse--tint-1';
const TINT_MULTIPLE_CLASS = 'analyze-verse--tint-2';

// Builds verseIndex -> the references covering that verse, expanding each
// reference across its range once rather than re-scanning the list per verse.
//
// The input array is never modified; the map holds the same reference objects
// the caller passed in, so identity comparisons still work downstream.
export const buildHighlightIndex = (references = []) => {
    const index = new Map();

    references.forEach(reference => {
        for (let verseIndex = reference.startIndex; verseIndex <= reference.endIndex; verseIndex += 1) {
            index.set(verseIndex, [...(index.get(verseIndex) || []), reference]);
        }
    });

    return index;
};

export const referencesAt = (index, verseIndex) => index.get(verseIndex) || [];

// 0 refs plain, 1 ref a light tint, 2+ a deeper one. The depth says "more than
// one note is looking at this verse" at a glance, before any marker is read.
export const tintClassName = (referenceCount) => {
    if (referenceCount >= 2) {
        return TINT_MULTIPLE_CLASS;
    }
    if (referenceCount === 1) {
        return TINT_SINGLE_CLASS;
    }
    return '';
};

// Whether a verse should light up because its note is being hovered elsewhere.
// `noteId` is null whenever nothing is hovered, which must not match anything.
export const coversNote = (references, noteId) =>
    noteId !== null && noteId !== undefined
    && references.some(reference => reference.noteId === noteId);
