// Every link into the Thoughts page, built in one place.
//
// The page's state is its query string — `?idea=<id>` centres one idea with its
// notes orbiting, and its absence is the field of topic cards — so any other
// page that wants to send a reader there has to know that format. Two now do
// (search results, and the Overview drawer), which is exactly when the format
// stops being one page's private business.
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

// The topics view — the whole field of topic cards, nothing opened.
//
// A topic has no param of its own because it has no view of its own: the field
// IS every topic, and a card fans its ideas out under the pointer. So a link to
// one topic can only be a link to the field it is on, and adding a param that
// merely scrolled would be a second contract for a hover's worth of state.
export const thoughtsUrl = () => THOUGHTS_PATH;

// One idea, centred, with its notes around it.
//
// No topic is named alongside it, unlike the tree this replaced: the idea view
// is reached by id and stands on its own, so an idea filed under several topics
// — or under none — is one link either way.
export const thoughtsUrlForIdea = (ideaId) => `${THOUGHTS_PATH}?${IDEA_PARAM}=${ideaId}`;
