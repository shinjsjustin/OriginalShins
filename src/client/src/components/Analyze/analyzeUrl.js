// Every link into the Analyze page, built in one place.
//
// The page's state is its query string — `?l=<book>.<chapter>` positions the
// primary scripture panel and `?note=<id>` opens the editor on one note — so any
// other page that wants to send a reader there has to know that format. Three
// pages now do (the topic tree, and both halves of search), which is exactly
// when the format stops being one page's private business.
//
// Pure strings: nothing here reads the canon or the router, so a caller with an
// id and a chapter can build a link without loading anything first.

import { PRIMARY_PARAM, NOTE_PARAM } from './panelParams';

// The primary (centre) panel, pointed at one chapter. The compare panel is
// deliberately left out — usePanelPositions fills in whichever param the URL
// omits, and a link that pinned both would overwrite a position the reader
// chose. Pointing the primary panel is also what brings the notes panel along,
// since it follows that one.
export const analyzeUrlForChapter = (bookId, chapter) =>
    `/analyze?${PRIMARY_PARAM}=${bookId}.${chapter}`;

// One note, opened in the editor at the chapter of its first anchor.
//
// A note with no anchor keeps the `note` param and lets Analyze default its
// panels: such a note is in that page's `unreferenced` list, which is the same
// whatever chapter is on screen, so the editor still opens on it.
export const analyzeUrlForNote = ({ id, firstReference }) => {
    const position = firstReference
        ? `${PRIMARY_PARAM}=${firstReference.bookId}.${firstReference.chapter}&`
        : '';
    return `/analyze?${position}${NOTE_PARAM}=${id}`;
};
