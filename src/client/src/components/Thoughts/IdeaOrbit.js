import React, { useEffect, useMemo, useRef, useState } from 'react';
import BubbleCard from './BubbleCard';
import buildOrbit, { NOTE_CARD, ORBIT_CENTRE_CLEARANCE } from './orbitLayout';
import useCanvasSize from './useCanvasSize';
import { centreOf, collapseOnto } from './cardGeometry';
import { UNTITLED_IDEA_LABEL } from './TopBar';
import { renderMarkdown } from '../Analyze/markdown';

// The idea view: one idea enlarged at the centre of the canvas, its notes
// ringing it.
//
// ── Why this component outlives the idea it is drawing ─────────────────────
//
// The spec asks that Reset View and the back button return to the topics view
// "with the reverse animation", and the reverse of a card growing to the centre
// is that card shrinking away. Nothing can shrink away after it has been
// unmounted: the moment the query string loses `?idea=`, the page's `openIdea`
// is null and its notes are on their way to being an empty array, so a
// component that rendered straight from those props would vanish rather than
// leave.
//
// So this one keeps the last idea it was given, and the notes that came with
// it, until the exit has been seen. `retained` is that copy. It is why the page
// mounts this component in both views rather than swapping it in — a component
// that only exists while the idea view is open cannot animate the idea view
// closing — and it is why this file, rather than Thoughts.js, owns the timer.
//
// ── Entering is an animation, leaving is a transition ──────────────────────
//
// The two halves are not symmetrical, and the reason is when the cards mount.
// The centred idea is in hand the instant the reader clicks it (the ideas list
// is already loaded), but its notes are a request away — `useThoughtsData`
// fetches the idea's notes one by one — so a note card mounts a beat after the
// view opens, at which point there is no class flip left for it to animate on.
// A CSS transition cannot animate an element that was not there for the
// from-state; a keyframe animation runs whenever the element appears. Hence
// `orbit-in`, which every card plays on mount, wherever in the sequence it
// arrives.
//
// Leaving is the opposite situation: every card is present and the class
// changes under it, which is exactly what a transition is for. `.is-closing`
// puts the notes back onto the centre and the centre back to nothing.
//
// ── Why the drawing half is its own component ─────────────────────────────
//
// Card positions come from a canvas size, and the canvas size is a measurement
// of the region the cards are drawn in — taken in a layout effect, before
// paint. A single component that decided presence AND drew would run that
// effect on its first render, when it has decided there is nothing to draw and
// the region does not exist yet, measure nothing, and then never measure again:
// the effect's dependencies are the ref, and a ref does not change when it is
// filled. The ring would be laid out for the fallback canvas for good, which is
// a ring in the wrong place and the wrong size.
//
// Splitting them fixes it by construction rather than by adding a dependency to
// chase. `OrbitCanvas` is mounted only when there is something to draw, so its
// element exists by the time its own layout effect runs, and it remeasures
// every time the view is opened.
//
// ── Notes do not open anything ─────────────────────────────────────────────
//
// A note card has no `onActivate`, because there is nowhere for a note to go:
// this ring is the only place notes are shown, and its cards already carry
// their body. What they do carry is the pin, the same one every other card on
// the page has, which is the route to editing them in the panel.

// How long the closing transition below takes, so the cards are still mounted
// while it plays. Must stay in step with `.thoughts-orbit .is-closing` in
// Thoughts.css — one number in two places, and this is the one that decides.
export const ORBIT_EXIT_MS = 320;

// A card wider than it is tall, because its content is prose and a line of
// prose wants width. Everything else on the page is close to this ratio too.
const IDEA_CARD_ASPECT = 4 / 3;

// The centred idea card at full size: the largest card on the page by a wide
// margin (a topic is 168×104, a fanned idea 148×52), which is what "enlarges"
// means here — it is the only card showing a whole body rather than a label.
//
// Its size is not a taste: ORBIT_CENTRE_CLEARANCE is the radius orbitLayout
// keeps free at the middle of the ring, and it keeps it free FOR THIS CARD. So
// the card is the largest 4:3 box that fits inside that circle — its diagonal
// is the circle's diameter — and the second ring, which is the one that comes
// close enough to matter, cannot end up underneath it. Written as the sum
// rather than as two numbers so that changing the clearance moves the card
// with it; a literal here would be a pair of constants that agree today and
// silently stop agreeing the first time either is touched.
const IDEA_CARD_HEIGHT = (2 * ORBIT_CENTRE_CLEARANCE) / Math.sqrt(IDEA_CARD_ASPECT ** 2 + 1);

export const IDEA_CARD = Object.freeze({
    width: IDEA_CARD_HEIGHT * IDEA_CARD_ASPECT,
    height: IDEA_CARD_HEIGHT,
});

// What the card is allowed to claim on a canvas too small even for that: never
// more than half the width, or three fifths of the height. Past those it is no
// longer a card at the centre of a ring, it is a panel with cards stuck to its
// edges.
const IDEA_CARD_MAX_SHARE = Object.freeze({ width: 0.5, height: 0.6 });

// How much later each note leaves the centre than the one before it. The fan
// uses the same figure for the same reason: the ring should sweep out rather
// than appear all at once, without the last card of twenty being half a second
// behind the first.
const NOTE_STAGGER_MS = 16;

export const UNTITLED_NOTE_LABEL = 'Untitled note';

export const NO_NOTES_MESSAGE = 'No notes on this idea yet.';

/** The centred card's box, in canvas coordinates. */
export const ideaBoxFor = (canvas) => {
    const width = Math.min(IDEA_CARD.width, canvas.width * IDEA_CARD_MAX_SHARE.width);
    const height = Math.min(IDEA_CARD.height, canvas.height * IDEA_CARD_MAX_SHARE.height);

    return {
        x: canvas.width / 2 - width / 2,
        y: canvas.height / 2 - height / 2,
        width,
        height,
    };
};

/**
 * The idea and notes this view is currently drawing, which is the ones it was
 * given until they are taken away and the last ones for a moment after that.
 *
 * @returns { shown, isClosing } — `shown` null once the exit has finished, at
 *          which point there is nothing left to draw and the view unmounts
 */
const useRetainedIdea = (idea, notes) => {
    const [retained, setRetained] = useState(null);

    // Kept current while there IS an idea, so an edit made in the pinned panel
    // reaches the canvas: the page reloads its corpus after every write, and
    // this copy has to follow it rather than freeze at whatever was first
    // opened.
    useEffect(() => {
        if (idea) setRetained({ idea, notes });
    }, [idea, notes]);

    // And dropped, once, when the exit has had its time. Depending on
    // `retained` as well as `idea` is what makes reopening during the exit
    // safe: the timer is cleared and never fires against the new idea.
    useEffect(() => {
        if (idea || !retained) return undefined;

        const timer = setTimeout(() => setRetained(null), ORBIT_EXIT_MS);
        return () => clearTimeout(timer);
    }, [idea, retained]);

    return { shown: retained, isClosing: !idea && Boolean(retained) };
};

/** The ring itself, mounted only when there is an idea to put at its centre. */
const OrbitCanvas = ({ shown, isClosing, isPinned, onTogglePin }) => {
    const canvasRef = useRef(null);
    const canvas = useCanvasSize(canvasRef);

    const notes = shown.notes;
    const orbit = useMemo(() => buildOrbit(notes.length, canvas), [notes.length, canvas]);

    // Sanitized by DOMPurify inside renderMarkdown — the app's one renderer,
    // shared with the note editor and the overview drawer, so a body is
    // rendered the same way wherever it is read.
    const renderedBody = useMemo(() => renderMarkdown(shown.idea.body), [shown.idea.body]);

    const ideaBox = ideaBoxFor(canvas);
    const ideaCentre = centreOf(ideaBox);
    const title = shown.idea.title || UNTITLED_IDEA_LABEL;

    return (
        <div className={`thoughts-orbit${isClosing ? ' is-closing' : ''}`} ref={canvasRef}>
            <BubbleCard
                kind="idea"
                title={title}
                position={ideaBox}
                scale={ideaBox.width / IDEA_CARD.width}
                isSelected
                isPinned={isPinned('idea', shown.idea.id)}
                onTogglePin={() => onTogglePin('idea', shown.idea.id, title)}
                className="thoughts-orbit-centre"
                body={renderedBody
                    ? (
                        <div
                            className="thoughts-orbit-body"
                            dangerouslySetInnerHTML={{ __html: renderedBody }}
                        />
                    )
                    : null}
            />

            {orbit.cards.map(card => {
                const note = notes[card.index];
                if (!note) return null;

                const noteTitle = note.title || UNTITLED_NOTE_LABEL;

                return (
                    <BubbleCard
                        key={note.id}
                        kind="note"
                        title={noteTitle}
                        // The raw markdown, clamped by the stylesheet rather
                        // than cut here: the spec asks for three lines and a
                        // "…", and only the browser knows where three lines of
                        // this card's width actually end.
                        subtitle={note.body}
                        position={card}
                        scale={card.width / NOTE_CARD.width}
                        isPinned={isPinned('note', note.id)}
                        onTogglePin={() => onTogglePin('note', note.id, noteTitle)}
                        className="thoughts-orbit-note"
                        style={{
                            ...collapseOnto(ideaCentre, card),
                            '--card-delay': `${card.index * NOTE_STAGGER_MS}ms`,
                        }}
                    />
                );
            })}

            {notes.length === 0 && (
                <p
                    className="thoughts-orbit-empty"
                    style={{ top: `${ideaBox.y + ideaBox.height}px` }}
                >
                    {NO_NOTES_MESSAGE}
                </p>
            )}
        </div>
    );
};

/**
 * @param idea        the open idea, or null in the topics view
 * @param notes       that idea's notes, each with its own body
 * @param isPinned    (itemType, itemId) -> boolean, from usePins
 * @param onTogglePin (itemType, itemId, title) -> void, from usePins
 */
const IdeaOrbit = ({
    idea = null,
    notes = [],
    isPinned = () => false,
    onTogglePin = () => {},
}) => {
    const { shown, isClosing } = useRetainedIdea(idea, notes);

    if (!shown) return null;

    return (
        <OrbitCanvas
            shown={shown}
            isClosing={isClosing}
            isPinned={isPinned}
            onTogglePin={onTogglePin}
        />
    );
};

export default IdeaOrbit;
