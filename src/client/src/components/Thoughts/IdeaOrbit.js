import React, { useEffect, useMemo, useRef, useState } from 'react';
import BubbleCard from '../Bubbles/BubbleCard';
import BloomCluster from '../Bubbles/BloomCluster';
import useBloom from '../Bubbles/useBloom';
import buildFan from '../Bubbles/fanLayout';
import buildOrbit, { NOTE_CARD, ORBIT_CENTRE_CLEARANCE } from './orbitLayout';
import useCanvasSize from '../Bubbles/useCanvasSize';
import { centreOf, collapseOnto } from '../Bubbles/cardGeometry';
import { UNTITLED_IDEA_LABEL } from './TopBar';
import { renderMarkdown } from '../Analyze/markdown';
import { describeChapterVerses } from '../Analyze/navigation';

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
// ── A note opens its passages, and nothing else ────────────────────────────
//
// There is nowhere for a note to GO — this ring is the only place notes are
// shown, and its cards already carry their body — so clicking one does not
// navigate. What it does is bloom: a note card is anchored to scripture, and
// the passages behind those anchors are drawn nowhere else on this page, so
// each note opens into a fan of them exactly as a topic opens into its ideas.
// Same hover, same fading of everything else, same click to hold it open.
//
// That is why the fan is BloomCluster's and not this file's: two canvases, one
// interaction, one implementation. What differs is only what a petal contains
// — a title there, a passage of scripture here — and how much room it needs,
// which is the whole of PASSAGE_FAN below.
//
// A note with no anchors blooms nothing and is not clickable. An empty
// spotlight — the ring faded out around a card with nothing beside it — would
// be the page answering a click with a worse view than the one before it.
//
// The pin is unchanged, on every card, and is still the route to editing a
// note in the panel.

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

// A passage card holds scripture rather than a phrase, so it is the widest
// card the page draws and the only one on a fan with a body. Tall enough for
// four or five lines of verse; anything longer scrolls inside it, because a
// card sized for the longest passage in the canon would be a panel.
export const PASSAGE_CARD = Object.freeze({ width: 232, height: 156 });

// What that size costs the arc, gathered as an override of FAN_STYLE.
//
// Every number here follows from the card being ~1.6× the width of a fanned
// idea card. It needs a longer radius to clear the note it came out of, a
// wider angular step so that neighbours do not lie on top of each other, and
// it fills one arc after five rather than fifteen.
//
// These four are named apart from PASSAGE_FAN because the RADIUS is derived
// from them rather than chosen beside them — see radiusClearing below.
const PASSAGE_SCALES = Object.freeze({ full: 1, tight: 0.86 });
const PASSAGE_TIGHTEN_THRESHOLD = 3;
const PASSAGE_ROW_CAPACITY = 5;
const PASSAGE_SPREAD = Object.freeze({ perCard: Math.PI / 3, max: Math.PI * 1.15 });

/**
 * The shortest first-arc radius on which `count` passage cards clear each other.
 *
 * ── Why the diagonal, and not the width ────────────────────────────────────
 *
 * What separates two cards on the arc is the CHORD between their centres:
 * 2·r·sin(step/2). The tempting test is to ask that the chord clear the card's
 * WIDTH, and it is wrong in a way that looks right — it was the reasoning here
 * until an overlap sweep contradicted it.
 *
 * Two axis-aligned boxes miss each other when their centres are apart by a
 * full width in x OR a full height in y; either alone is enough. A chord that
 * runs nearly horizontally therefore only needs the width, and a nearly
 * vertical one only the height — but a chord running DIAGONALLY is short of
 * the width in x and short of the height in y at once, and the two cards
 * overlap while the width test still passes. Since the fan turns to face the
 * middle of the canvas, its chords run in every direction and that diagonal
 * case is not hypothetical: at the old 260 it drew passages over each other at
 * about one anchor position in nine.
 *
 * The one length that clears a box from every direction is its DIAGONAL, so
 * that is what the chord is asked to beat.
 *
 * ── Why it is a maximum over the counts, and not one sum ───────────────────
 *
 * Neither of the arc's two "worst cases" contains the other:
 *
 *   • Two or three passages sit at the full `perCard` step, but the card is at
 *     FULL size, so the diagonal to clear is the long one.
 *   • Five sit at a card that has dropped to `tight`, but the opening has hit
 *     `spread.max` and the STEP is what gave — so they are packed closer than
 *     `perCard` ever asks for.
 *
 * The step tightens faster than the card shrinks, and the two land within a
 * few pixels of each other, so the radius is the larger of what each demands
 * rather than either one alone.
 */
const radiusClearing = (count) => {
    if (count < 2) return 0;

    const opening = Math.min(PASSAGE_SPREAD.max, (count - 1) * PASSAGE_SPREAD.perCard);
    const step = opening / (count - 1);
    const scale = count > PASSAGE_TIGHTEN_THRESHOLD
        ? PASSAGE_SCALES.tight
        : PASSAGE_SCALES.full;
    const diagonal = Math.hypot(PASSAGE_CARD.width, PASSAGE_CARD.height) * scale;

    return diagonal / (2 * Math.sin(step / 2));
};

// Long enough for every count the arc holds, which is what makes this a
// derivation rather than a number to re-tune by eye each time the card, the
// spread or the capacity above is touched.
const PASSAGE_RADIUS_FIRST = Math.max(
    ...Array.from({ length: PASSAGE_ROW_CAPACITY }, (unused, index) => radiusClearing(index + 1))
);

// How much further out the second arc sits. Carried over unchanged from when
// both radii were literals, so widening the first does not quietly close the
// gap between them.
//
// NOTE: this gap is smaller than a passage card, so a note with more than
// PASSAGE_ROW_CAPACITY passages draws a second arc that overlaps the first.
// That is a pre-existing shortcoming of a second arc for cards this large, not
// something the derivation above addresses — see AGENTS.md.
const PASSAGE_ROW_GAP = 144;

export const PASSAGE_FAN = Object.freeze({
    card: PASSAGE_CARD,
    scales: PASSAGE_SCALES,
    tightenThreshold: PASSAGE_TIGHTEN_THRESHOLD,
    rowCapacity: PASSAGE_ROW_CAPACITY,
    radius: Object.freeze({
        first: PASSAGE_RADIUS_FIRST,
        second: PASSAGE_RADIUS_FIRST + PASSAGE_ROW_GAP,
    }),
    spread: PASSAGE_SPREAD,
});

export const UNTITLED_NOTE_LABEL = 'Untitled note';

export const NO_NOTES_MESSAGE = 'No notes on this idea yet.';

/**
 * "Genesis 1:3–5" — what a passage card is called.
 *
 * The book name rides in on the payload rather than being looked up from the
 * canon, so this page needs no book catalogue of its own; the fallback is the
 * one describeReference uses, so a passage is never a card with a blank title.
 */
export const passageLabel = (passage) =>
    `${passage.bookName || `Book ${passage.bookId}`} ${describeChapterVerses(passage)}`;

/**
 * The verses themselves, verse number then text, one paragraph each.
 *
 * Not markdown and not run through renderMarkdown: this is scripture out of
 * the `verses` table, it is plain text, and it is the one body on this page
 * that was not written by the reader.
 */
export const PassageText = ({ verses }) => (
    <div className="thoughts-passage-text">
        {verses.map(verse => (
            <p key={verse.verseIndex} className="thoughts-passage-verse">
                <span className="thoughts-passage-number">{verse.verse}</span>
                {verse.text}
            </p>
        ))}
    </div>
);

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

// An id no note can hold, so that `isFaded(CENTRE)` answers exactly one
// question: is a bloom open at all? The centred idea is never the card that
// blooms, and it recedes whenever a note does — otherwise the one card the fan
// opens over would be the one card the fan could not dim.
const CENTRE = Symbol('the centred idea');

const passagesOf = (note) => (note && note.passages) || [];

/** One note, the passages it is anchored to, and the region holding the two. */
const NoteCluster = ({ note, card, ideaCentre, fan, bloom, isPinned, onTogglePin }) => {
    const title = note.title || UNTITLED_NOTE_LABEL;
    const passages = passagesOf(note);

    // A note anchored to nothing has nothing to open, so it is not a control:
    // no click handler, and no hover that would fade the ring around a card
    // with nothing beside it.
    const canBloom = passages.length > 0;

    return (
        <BloomCluster
            anchorBox={card}
            fan={fan}
            isActive={bloom.isActive(note.id)}
            isExpanded={bloom.isExpanded(note.id)}
            onEnter={canBloom ? () => bloom.onEnter(note.id) : undefined}
            onLeave={canBloom ? () => bloom.onLeave(note.id) : undefined}
            onChipClick={() => bloom.onChipClick(note.id)}
            renderAnchor={(position) => (
                <BubbleCard
                    kind="note"
                    title={title}
                    // The raw markdown, clamped by the stylesheet rather than
                    // cut here: the spec asks for three lines and a "…", and
                    // only the browser knows where three lines of this card's
                    // width actually end.
                    subtitle={note.body}
                    position={position}
                    scale={card.width / NOTE_CARD.width}
                    isSelected={bloom.isActive(note.id)}
                    isFaded={bloom.isFaded(note.id)}
                    isPinned={isPinned('note', note.id)}
                    onTogglePin={() => onTogglePin('note', note.id, title)}
                    onActivate={canBloom ? () => bloom.onAnchorClick(note.id) : null}
                    className="thoughts-orbit-note"
                    style={{
                        ...collapseOnto(ideaCentre, card),
                        '--card-delay': `${card.index * NOTE_STAGGER_MS}ms`,
                    }}
                />
            )}
            renderPetal={(petalCard, petal) => {
                const passage = passages[petalCard.index];
                if (!passage) return null;

                return (
                    <BubbleCard
                        key={passage.id}
                        kind="passage"
                        title={passageLabel(passage)}
                        // `body` rather than `subtitle`, which is also why this
                        // card gets no `onActivate`: BubbleCard's face is a
                        // button whenever it activates, and paragraphs inside a
                        // button are markup no browser agrees on. There is
                        // nowhere for a passage to go from here anyway.
                        body={<PassageText verses={passage.verses} />}
                        {...petal}
                    />
                );
            }}
        />
    );
};

/** The ring itself, mounted only when there is an idea to put at its centre. */
const OrbitCanvas = ({ shown, isClosing, isPinned, onTogglePin }) => {
    const canvasRef = useRef(null);
    const canvas = useCanvasSize(canvasRef);
    const bloom = useBloom();

    const notes = shown.notes;
    const orbit = useMemo(() => buildOrbit(notes.length, canvas), [notes.length, canvas]);

    // Every note's fan, not only the open one: a petal needs a closed state
    // that was actually rendered before it has anything to animate out of.
    // Same reason the topics field builds all of its fans — see the note at the
    // top of TopicIdeaField.
    const fans = useMemo(() => orbit.cards.map(card => buildFan(
        passagesOf(notes[card.index]).length,
        centreOf(card),
        canvas,
        PASSAGE_FAN
    )), [orbit, notes, canvas]);

    // Sanitized by DOMPurify inside renderMarkdown — the app's one renderer,
    // shared with the note editor and the overview drawer, so a body is
    // rendered the same way wherever it is read.
    const renderedBody = useMemo(() => renderMarkdown(shown.idea.body), [shown.idea.body]);

    const ideaBox = ideaBoxFor(canvas);
    const ideaCentre = centreOf(ideaBox);
    const title = shown.idea.title || UNTITLED_IDEA_LABEL;

    // A lock is held against one note of one idea. This component is not
    // remounted when the reader moves to another idea — it is the same canvas
    // redrawn — so without this the new ring would open with an old note's
    // spotlight on it, or with every card faded around a note that is no longer
    // there.
    const ideaId = shown.idea.id;
    const { reset } = bloom;
    useEffect(() => { reset(); }, [ideaId, reset]);

    return (
        <div className={`thoughts-orbit${isClosing ? ' is-closing' : ''}`} ref={canvasRef}>
            <BubbleCard
                kind="idea"
                title={title}
                position={ideaBox}
                scale={ideaBox.width / IDEA_CARD.width}
                isSelected
                isFaded={bloom.isFaded(CENTRE)}
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

            {orbit.cards.map((card, index) => {
                const note = notes[card.index];
                if (!note) return null;

                return (
                    <NoteCluster
                        key={note.id}
                        note={note}
                        card={card}
                        ideaCentre={ideaCentre}
                        fan={fans[index]}
                        bloom={bloom}
                        isPinned={isPinned}
                        onTogglePin={onTogglePin}
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
