import React from 'react';
import Navbar from '../Navbar';
import TopBar from './TopBar';
import TopicsField from './TopicsField';
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
// regions the rest of the page fills, and the banners. The topics view draws
// itself now; IdeaOrbit and the panel's rows and edit forms arrive next, into
// the same two slots. The shell decides where the state lives, and every piece
// that follows reads it from here rather than fetching again.
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
// handed the same arrays from the same two hooks.
//
// ── Two kinds of failure, two banners ─────────────────────────────────────
//
// A load error means the page has nothing to draw; an action error means a
// write the reader asked for did not land, over a page that is still correct.
// They are separate lines because they are separate facts and either can be
// true without the other — see the spec's error-handling section. Each hook
// reports both, and the page shows whichever spoke: two hooks failing the same
// way at the same time is one server being down, and one banner says that.

// The create modal is the next step's work. Until then the two buttons exist
// so the bar is the bar, and press to nothing.
const noop = () => {};

const Thoughts = () => {
    const { ideaId, showIdea, resetView } = useThoughtsView();
    const {
        topics,
        ideas,
        isLoading,
        error: loadError,
        actionError: dataActionError,
    } = useThoughtsData(ideaId);
    const {
        pins,
        error: pinsError,
        actionError: pinsActionError,
        isPinned,
        togglePin,
    } = usePins();

    // The open idea comes out of the list the page already holds rather than a
    // request of its own: GET /api/ideas carries every idea with its topics,
    // which is exactly what the crumb needs. Null while that list is in flight,
    // and null for an id naming an idea that is no longer there — the banner
    // covers the second case, because the load is what 404s.
    const openIdea = ideaId === null
        ? null
        : ideas.find(idea => idea.id === ideaId) || null;

    const error = loadError || pinsError;
    const actionError = dataActionError || pinsActionError;

    return (
        <div className="thoughts-page">
            <Navbar />

            <main className="thoughts-main">
                <TopBar
                    idea={openIdea}
                    onResetView={resetView}
                    onCreateTopic={noop}
                    onCreateIdea={noop}
                />

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
                        {!isLoading && !error && ideaId !== null && (
                            <p className="thoughts-message">
                                The idea view is not drawn yet.
                            </p>
                        )}
                    </section>

                    {/* Slot two: the pinned panel — the page's editing surface,
                        and the only place an item can be changed. */}
                    <aside className="thoughts-panel" aria-label="Pinned">
                        <header className="thoughts-panel-header">
                            <h2 className="thoughts-panel-title">Pinned ({pins.length})</h2>
                        </header>
                    </aside>
                </div>
            </main>
        </div>
    );
};

export default Thoughts;
