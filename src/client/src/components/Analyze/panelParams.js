// The names of the query params the Analyze page reads.
//
// Split out of usePanelPositions so that analyzeUrl.js — which other pages
// import to build links here — does not have to pull in a hook, and its React
// import with it, just to spell 'l'.
//
// The values are still 'l' and 'r' from when the two scripture panels were
// simply left and right. They keep those spellings so links already saved and
// shared still resolve; what the names say now is which panel is in charge.
// The primary panel is the centre one, and the notes panel follows it.
export const PRIMARY_PARAM = 'l';
export const COMPARE_PARAM = 'r';

// One-shot rather than state: it opens the editor on a note, and nothing writes
// it back. Closing the editor does not reopen the note even though the param is
// still in the URL.
export const NOTE_PARAM = 'note';
