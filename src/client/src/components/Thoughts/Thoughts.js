import React, { useCallback, useState } from 'react';
import Navbar from '../Navbar';
import TopBar from './TopBar';
import TopicsField from './TopicsField';
import IdeaOrbit from './IdeaOrbit';
import PinnedPanel from './PinnedPanel';
import CreateModal from './CreateModal';
import useThoughtsData from './useThoughtsData';
import usePins from './usePins';
import useThoughtsView from './useThoughtsView';
import '../Styling/Thoughts.css';

// /thoughts — topics, ideas and notes as one canvas, with the pinned panel
// beside it.
//
// ── What is here, and what is deliberately not ────────────────────────────
//
// This is the shell: the three hooks wired together, the top bar, the two
// regions the rest of the page fills, and the banners. Both views draw
// themselves, and the pinned panel fills the second region. The shell decides
// where the state lives, and every piece reads it from here rather than
// fetching again.
//
// ── Why the canvas is not a plain either/or ───────────────────────────────
//
// The topics field is mounted only in the topics view, but IdeaOrbit is
// mounted in both and draws nothing when it has nothing to draw. That is the
// one concession the reverse animation asks for: leaving an idea is a change
// to the query string, and a view that were swapped out on that change would
// disappear rather than close. IdeaOrbit holds the idea it was last given for
// as long as its exit takes and then renders null, so "which view" stays a
// question about the URL and never about a timer this component has to keep.
//
// ── Three hooks, and why the page composes them rather than one of them ────
//
// useThoughtsView holds which view is showing (the query string), and the
// other two answer to it: useThoughtsData takes the open idea's id, because
// that is what decides whether any notes are loaded at all. usePins knows
// nothing about the view — the pinned set is the same list in both — so it
// takes no arguments and never reloads when the view changes.
//
// None of the three knows about the others. Joining them is this component's
// entire job, and it is why the panel and the canvas cannot disagree: they are
// handed the same arrays from the same two hooks. An edit saved in the panel
// bumps useThoughtsData's revision and the whole page reloads from the server,
// so a renamed topic changes on the card behind the panel in the same beat.
//
// ── Three tiers, three pairs of writes, one panel ──────────────────────────
//
// The panel edits whatever is pinned, and what is pinned may be any of the
// three kinds — but the API has a separate endpoint per kind, and so does
// useThoughtsData. The two dispatchers below are where a pin's `itemType`
// becomes a call. They are here rather than in the panel because this is the
// component that holds the hook: the panel is handed two functions and never
// learns that there are six.
//
// ── Two kinds of failure, two banners ─────────────────────────────────────
//
// A load error means the page has nothing to draw; an action error means a
// write the reader asked for did not land, over a page that is still correct.
// They are separate lines because they are separate facts and either can be
// true without the other — see the spec's error-handling section. Each hook
// reports both, and the page shows whichever spoke: two hooks failing the same
// way at the same time is one server being down, and one banner says that.

// ── Creating means pinning ────────────────────────────────────────────────
//
// A created item is pinned the moment it exists, because the pinned panel is
// the only place on this page an item can be edited. Without the pin, "+ Topic"
// would produce a card the reader had just named and could no longer touch —
// they would have to find it on the canvas and pin it by hand before they could
// write its description. The pin is what makes the create button finish the job
// it starts.

// How each kind names itself. The pin carries a title so the new row reads
// correctly before the next load replaces it with the server's own.
const TITLE_OF = Object.freeze({
    topic: (item) => item.name,
    idea: (item) => item.title,
});

const Thoughts = () => {
    const { ideaId, showIdea, resetView } = useThoughtsView();
    // Which create form is open: 'topic', 'idea', or nothing.
    const [creatingKind, setCreatingKind] = useState(null);
    const {
        topics,
        ideas,
        notes,
        isLoading,
        error: loadError,
        actionError: dataActionError,
        createTopic,
        createIdea,
        updateTopic,
        updateIdea,
        updateNote,
        removeTopic,
        removeIdea,
        removeNote,
        linkPairs,
    } = useThoughtsData(ideaId);
    const {
        pins,
        isLoading: arePinsLoading,
        error: pinsError,
        actionError: pinsActionError,
        isPinned,
        togglePin,
        unpinMany,
        clearPins,
    } = usePins();

    // The open idea comes out of the list the page already holds rather than a
    // request of its own: GET /api/ideas carries every idea with its topics,
    // which is exactly what the crumb needs. Null while that list is in flight,
    // and null for an id naming an idea that is no longer there — the banner
    // covers the second case, because the load is what 404s.
    const openIdea = ideaId === null
        ? null
        : ideas.find(idea => idea.id === ideaId) || null;

    // Create, then pin what came back. The pin is a second request and can fail
    // on its own; when it does, the item is still made and the banner says why
    // it is not in the panel, which is the honest report of what happened.
    // `togglePin` is a toggle in name only here: an id the server has just
    // minted cannot already be in the pinned list.
    const createAndPin = useCallback(async (fields) => {
        const create = creatingKind === 'topic' ? createTopic : createIdea;
        const created = await create(fields);

        if (!created) return null;

        await togglePin(creatingKind, created.id, TITLE_OF[creatingKind](created));

        return created;
    }, [creatingKind, createTopic, createIdea, togglePin]);

    const saveItem = useCallback((pin, changes) => {
        if (pin.itemType === 'topic') return updateTopic(pin.itemId, changes);
        if (pin.itemType === 'idea') return updateIdea(pin.itemId, changes);
        return updateNote(pin.itemId, changes);
    }, [updateTopic, updateIdea, updateNote]);

    // The item goes, and its pin goes with it. The server already dropped the
    // pin row inside the delete's transaction, so the unpin that follows
    // removes nothing there — it is sent so that usePins' list, which is held
    // on the client and reloads only on demand, does not go on showing a row
    // pointing at something that is gone.
    const deleteItem = useCallback(async (pin) => {
        const remove = { topic: removeTopic, idea: removeIdea, note: removeNote }[pin.itemType];
        const removed = await remove(pin.itemId);

        if (removed) {
            await unpinMany([pin]);
        }

        return removed;
    }, [removeTopic, removeIdea, removeNote, unpinMany]);

    const error = loadError || pinsError;
    const actionError = dataActionError || pinsActionError;

    return (
        <div className="thoughts-page">
            <Navbar />

            <main className="thoughts-main">
                <TopBar
                    idea={openIdea}
                    onResetView={resetView}
                    onCreateTopic={() => setCreatingKind('topic')}
                    onCreateIdea={() => setCreatingKind('idea')}
                />

                {creatingKind && (
                    <CreateModal
                        kind={creatingKind}
                        onCreate={createAndPin}
                        onClose={() => setCreatingKind(null)}
                    />
                )}

                {error && (
                    <p className="thoughts-message thoughts-message--error" role="alert">{error}</p>
                )}

                {actionError && (
                    <p className="thoughts-message thoughts-message--error" role="alert">{actionError}</p>
                )}

                <div className="thoughts-body">
                    {/* Slot one: TopicsField in the topics view, IdeaOrbit in
                        the idea view. The canvas keeps its size either way, so
                        the cards animate between the two rather than the page
                        resizing under them. */}
                    <section className="thoughts-canvas" aria-label="Thoughts canvas">
                        {isLoading && <p className="thoughts-message">Loading your thoughts…</p>}
                        {!isLoading && !error && ideaId === null && (
                            <TopicsField
                                topics={topics}
                                ideas={ideas}
                                isPinned={isPinned}
                                onTogglePin={togglePin}
                                onShowIdea={showIdea}
                            />
                        )}

                        {/* Outside the guards above on purpose: an orbit that
                            is closing has already lost its idea, and a load
                            error is not a reason to yank a view out from under
                            the reader mid-animation. It draws nothing at all
                            unless it has an idea in hand. */}
                        <IdeaOrbit
                            idea={error ? null : openIdea}
                            notes={notes}
                            isPinned={isPinned}
                            onTogglePin={togglePin}
                        />
                    </section>

                    {/* Slot two: the pinned panel — the page's editing surface,
                        and the only place an item can be changed. */}
                    <PinnedPanel
                        pins={pins}
                        isLoading={arePinsLoading}
                        onUnpin={unpinMany}
                        onClear={clearPins}
                        onLink={linkPairs}
                        onSave={saveItem}
                        onDelete={deleteItem}
                    />
                </div>
            </main>
        </div>
    );
};

export default Thoughts;
