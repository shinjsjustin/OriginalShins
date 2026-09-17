// Every link into the Thoughts page, built in one place.
//
// The page's state is its query string — `?idea=<id>` centres one idea with its
// notes orbiting, and its absence is the field of topic cards — so any other
// page that wants to send a reader there has to know that format. One does
// (search results), which is exactly when the format stops being one page's
// private business.
//
// Split from useThoughtsView for the reason panelParams.js is split from
// usePanelPositions: a pure link builder should not have to pull in a hook, and
// React with it, just to spell 'idea'. The hook imports the param name from
// here, so the page that reads it and the pages that write it cannot drift.
//
// Pure strings: nothing here reads the corpus or the router, so a caller with
// an id can build a link without loading anything first.

export const THOUGHTS_PATH = '/thoughts';

export const IDEA_PARAM = 'idea';

// Which book's topics the field is showing.
//
// It is a param rather than a path segment for the same reason `idea` is: the
// back button leaves a scope, a reload stays in it, and "look at Mark's
// topics" is a link. It is also why a link INTO the page can name a book at
// all, which is what stops a search result for a Mark topic landing the reader
// on Matthew's field.
export const BOOK_PARAM = 'book';

// The topics view — the whole field of topic cards for one book.
//
// The one caller today names a book: search's topic results pass
// `topic.bookId` (searchModel.js), so a Mark topic's result lands on the field
// that actually holds it. The book stays optional as the fallback for a caller
// that has none to name — the page then seeds its own scope, exactly as a bare
// /thoughts does. Nothing inside the page builds its links here: Reset View
// edits the live query string in place (useThoughtsView) rather than composing
// a URL, which is what lets it drop `?idea=` while leaving `?book=` alone.
export const thoughtsUrl = (bookId = null) =>
    bookId === null ? THOUGHTS_PATH : `${THOUGHTS_PATH}?${BOOK_PARAM}=${bookId}`;

// One idea, centred, with its notes around it.
//
// No topic is named alongside it, unlike the tree this replaced: the idea view
// is reached by id and stands on its own, so an idea filed under several topics
// — or under none — is one link either way.
export const thoughtsUrlForIdea = (ideaId) => `${THOUGHTS_PATH}?${IDEA_PARAM}=${ideaId}`;
