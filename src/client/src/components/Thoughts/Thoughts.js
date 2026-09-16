import React, { useCallback, useEffect, useState } from 'react';
import Navbar from '../Navbar';
import TopBar from './TopBar';
import TopicIdeaField from '../Bubbles/TopicIdeaField';
import IdeaOrbit from './IdeaOrbit';
import PinnedPanel from './PinnedPanel';
import CreateModal from './CreateModal';
import useThoughtsData from './useThoughtsData';
import usePins from './usePins';
import useThoughtsView from './useThoughtsView';
import useBooks from '../Analyze/useBooks';
import useBookScope from './useBookScope';
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
    const { books } = useBooks();
    const { bookId, isResolving, showBook } = useBookScope(ideaId);
    // Which create form is open: 'topic', 'idea', or nothing.
    const [creatingKind, setCreatingKind] = useState(null);
    // Set only by createAndPin's own belt-and-braces guard below — see there.
    const [scopeError, setScopeError] = useState('');
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
        passagesByTopicId,
        loadPassagesFor,
    } = useThoughtsData(bookId, ideaId);
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
        // Belt-and-braces, and genuinely unreachable from the UI today: the
        // create buttons are disabled by this same `isResolving` (see the
        // prop passed to TopBar below), so no press a reader can make gets
        // here with bookId still null — that is the one guarantee Fix 1 made
        // instead of two independent ones that could drift. This guards a
        // caller nothing here has been written to anticipate — a future
        // control, a race — refusing rather than posting a create the server
        // is guaranteed to 400 on. It reports through the same banner a
        // failed write already uses, so a refusal is never silent even
        // though this path is not exercised by a test: there is no way to
        // reach it through this app's own UI to write one against, short of
        // mocking the hook this component trusts for the scope, which is
        // machinery this codebase's tests do not otherwise use. The effect
        // below is what would keep this message from outliving the window it
        // describes, if this were ever reached.
        if (bookId === null) {
            setScopeError("Still finding which book you're in. Please try again in a moment.");
            return null;
        }

        const create = creatingKind === 'topic' ? createTopic : createIdea;
        // The scope, not a field on the form. The title block above the modal
        // already says which book this is, and a second control saying the
        // same thing is a second control that can disagree with it.
        const created = await create({ ...fields, bookId });

        if (!created) return null;

        await togglePin(creatingKind, created.id, TITLE_OF[creatingKind](created));

        return created;
    }, [bookId, creatingKind, createTopic, createIdea, togglePin]);

    // The guard's message is only ever true while the scope is unresolved, so
    // it has no reason to survive past that moment — without this, a banner
    // set by a create attempted in that window would go on telling the reader
    // we are "still finding which book you're in" long after we found it.
    useEffect(() => {
        if (!isResolving) setScopeError('');
    }, [isResolving]);

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

    // Changing book clears the pinned set. Pins are temporary by design and
    // are cleared constantly by hand already, so there is no confirmation —
    // and a pinned panel carried across a book change would be an editing
    // surface for items no longer on the canvas behind it.
    //
    // Wired here rather than inside either hook, so useBookScope and usePins
    // go on knowing nothing about each other. Joining them is this component's
    // job, as it already is for the two write dispatchers above.
    //
    // The navigation is not conditional on the clear succeeding, and does not
    // wait on it either — more literally so than an awaited call would be.
    // clearPins' own optimistic update empties the list synchronously, before
    // its request is even sent, so firing both here lets React batch them into
    // one render: the new book and the cleared panel land together, with no
    // beat where the reader sees the old pins against the new book. If the
    // request itself fails, usePins' own action error says so over a page
    // that is otherwise correct.
    const changeBook = useCallback((nextBookId) => {
        showBook(nextBookId);
        clearPins();
    }, [clearPins, showBook]);

    const error = loadError || pinsError;
    const actionError = dataActionError || pinsActionError || scopeError;

    // The same check BookTitle makes before it will print a name: a `null`
    // here means the canon has not arrived yet, or named a book that is not in
    // it. Nothing on this page spells a book until this is non-null.
    const book = books.find(candidate => candidate.id === bookId) || null;

    const isReady = !isResolving && !isLoading && !error;
    const showTopicsView = isReady && ideaId === null;

    // Handed to the field rather than drawn beside it: the field already says
    // when it is empty, and a second message saying the same thing one line
    // lower is the page disagreeing with itself about whose job that is. It
    // falls back to the field's own wording until the canon has arrived, for
    // the reason BookTitle draws nothing then — `this book` is not a name.
    const emptyMessage = book === null
        ? undefined
        : `No topics in ${book.name} yet. Press + Topic to start one.`;

    // ── The panel may only ever hold what the canvas is showing ────────────
    //
    // changeBook clears the pinned set, but that only covers a book changed
    // ON this page. Pins are per-user and carry no book of their own — see
    // findPins in src/lib/pins.js, which returns every pin across every book —
    // so a topic pinned in Matthew is still on the server when the reader next
    // ENTERS Thoughts in Mark, whether by a `?book=` link, an `?idea=` that
    // adopts its own book, or the seed from the saved location. Left in the
    // panel it is selectable beside a Mark idea, and Link would file that idea
    // under a topic Mark's field does not draw: the idea then hangs off a topic
    // on no canvas at all, and this page can no longer undo it.
    //
    // Filtered rather than cleared on entry, and one rule rather than a second
    // clearing path beside changeBook's. Clearing would need to know which book
    // yesterday's pins were placed in, which nothing records, and clearing
    // unconditionally would throw a pinned set away on a plain reload. The
    // page's own scoped lists already say which items are in this book, so the
    // scope is read off them — the same arrays the canvas draws, which is what
    // makes the panel and the canvas agree by construction rather than by
    // agreement. The pins themselves are left alone: come back to that book and
    // they are still there. The panel's Clear is the one exception, and says so
    // in its own words — it unpins every book at once, because that is the only
    // clear the API has.
    //
    // A note passes through whatever the scope is. A note has no book by
    // design — its book is its anchor — and filing one under another book's
    // topic is a thing this app deliberately offers.
    const pinsInBook = pins.filter(pin => {
        if (pin.itemType === 'note') return true;

        const inBook = pin.itemType === 'topic' ? topics : ideas;
        return inBook.some(item => item.id === pin.itemId);
    });

    // What the panel holds is `pins` read through the corpus, so until the
    // corpus is in hand the panel cannot tell what it holds — and "Nothing
    // pinned yet" over a pinned set it simply has not placed yet is the page
    // stating something false. A bare /thoughts guarantees that window: the
    // scope has to be seeded before `/topics` and `/ideas` are even asked for,
    // and `/pins` has answered long before then. A corpus that failed to load
    // is the same ignorance by another route — the lists are emptied, and the
    // banner above already says why.
    const arePinsUnknown = arePinsLoading || isLoading || Boolean(error);

    return (
        <div className="thoughts-page">
            <Navbar />

            <main className="thoughts-main">
                <TopBar
                    books={books}
                    bookId={bookId}
                    isResolving={isResolving}
                    onChangeBook={changeBook}
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
                    {/* Slot one: TopicIdeaField in the topics view, IdeaOrbit
                        in the idea view. The canvas keeps its size either way,
                        so the cards animate between the two rather than the
                        page resizing under them. */}
                    <section className="thoughts-canvas" aria-label="Thoughts canvas">
                        {(isResolving || isLoading) && <p className="thoughts-message">Loading your thoughts…</p>}
                        {showTopicsView && (
                            <TopicIdeaField
                                topics={topics}
                                ideas={ideas}
                                emptyMessage={emptyMessage}
                                onSelectIdea={showIdea}
                                isPinned={isPinned}
                                onTogglePin={togglePin}
                                passagesByTopicId={passagesByTopicId}
                                onTopicOpen={loadPassagesFor}
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
                        pins={pinsInBook}
                        pinnedElsewhere={pins.length - pinsInBook.length}
                        isLoading={arePinsUnknown}
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
