import React, { useMemo, useRef } from 'react';
import BubbleCard from './BubbleCard';
import BloomCluster from './BloomCluster';
import useBloom from './useBloom';
import buildField, { TOPIC_CARD } from './fieldLayout';
import buildFan from './fanLayout';
import useCanvasSize from './useCanvasSize';
import { centreOf } from './cardGeometry';
import { UNTITLED_IDEA_LABEL } from '../Thoughts/TopBar';
import { UNTITLED_NOTE_LABEL } from '../Thoughts/IdeaOrbit';
import { countLabel } from '../Thoughts/format';
// The cards' own styles, which Thoughts.css owns. Imported here rather than by
// each page, because a page that used this field and forgot the stylesheet
// would get a field of unpositioned boxes — the field carries its own look
// wherever it is drawn, exactly as BubbleOverlay carries Bubbles.css.
import '../Styling/Thoughts.css';

// A field of topic cards, each opening a hover fan of the ideas filed under
// it. Thoughts draws its topics view with this; the Analyze importer draws the
// same field to pick an idea out of.
//
// ── The actions come from the caller ───────────────────────────────────────
//
// The two pages agree completely about what this field LOOKS like and not at
// all about what its cards DO: on Thoughts a fanned idea opens the idea view
// and every card carries a pin, and in the importer the same card files the
// idea against a chapter and there is nothing to pin. So the field owns the
// layout, the spotlight and the lock, and takes the rest as props —
// `onSelectIdea` for the fan, `isPinned`/`onTogglePin` for the pins. The pin
// props are optional together: without them no pin is drawn on any card,
// which is a page's way of saying this field has no pinning in it rather than
// a page having to pass two no-ops.
//
// ── The hover region, the lock, and the fan are not this file's ────────────
//
// A topic, its fan and the gaps between them are one hit region that grows
// when it opens, and which topic is open is hover-plus-a-lock. Both of those
// are shared with the idea orbit, which blooms a note into its passages the
// same way, so they live in BloomCluster and useBloom — read those two for why
// the region is shaped the way it is, and why a click has to hold it open
// before a petal can be reached.
//
// What stays here is everything about topics and ideas in particular: which
// clusters there are, where they sit, and what their cards do.
//
// ── Every fan is mounted, all the time ─────────────────────────────────────
//
// Mounting a fan on hover would mean its cards' first computed style is the
// open one, and a CSS transition has nothing to animate from. So all of them
// are in the DOM in their closed state — collapsed onto their topic's centre
// at zero opacity — and hovering flips a class. That is what makes the whole
// animation a stylesheet's business, which is what the spec asks for.
//
// They are hidden with `visibility` rather than opacity alone, because a card
// at zero opacity is still a button a screen reader reads out and a tab stop a
// keyboard lands on. `visibility` takes them out of both, and transitioning it
// with a delay lets the closing animation finish before they go.

export const UNFILED_ID = 'unfiled';
export const UNFILED_TITLE = 'Unfiled ideas';

/**
 * The clusters the field draws: one per topic, plus the unfiled pseudo-bubble.
 *
 * Each carries its own ideas rather than the topic row's `ideaCount`, because
 * the fan is built from this array and the count is printed from it — taking
 * them from two sources is how a card comes to say "4 ideas" over a fan of
 * three. One source, one answer.
 *
 * The unfiled bubble is appended last so it lands in the field's final cell,
 * and only when it has something in it: a permanent "0 unfiled" card would be
 * a cell of the field spent on nothing.
 *
 * Each cluster carries both what fans out of it: the ideas filed under the
 * topic, and the notes filed DIRECTLY under it. A note reached through one of
 * those ideas is not here — it belongs to the idea's orbit, and repeating it
 * would draw the same note twice on one screen.
 */
export const buildClusters = (topics, ideas) => {
    const safeIdeas = Array.isArray(ideas) ? ideas : [];
    const byTopic = new Map();

    safeIdeas.forEach(idea => {
        (idea.topics || []).forEach(topic => {
            const already = byTopic.get(topic.id);
            if (already) already.push(idea);
            else byTopic.set(topic.id, [idea]);
        });
    });

    const clusters = (Array.isArray(topics) ? topics : []).map(topic => ({
        id: topic.id,
        kind: 'topic',
        title: topic.name,
        ideas: byTopic.get(topic.id) || [],
        // Straight off the topic row: GET /api/topics carries them, so unlike
        // ideas — which are regrouped from the flat list because that is where
        // an idea's topic membership lives — there is nothing to regroup.
        notes: Array.isArray(topic.notes) ? topic.notes : [],
    }));

    const unfiled = safeIdeas.filter(idea => (idea.topics || []).length === 0);

    return unfiled.length === 0
        ? clusters
        : [...clusters, {
            id: UNFILED_ID,
            kind: 'unfiled',
            title: UNFILED_TITLE,
            ideas: unfiled,
            // Always empty. A note with no topic is not surfaced on this view at
            // all — it is reachable through its idea, /analyze and /search — so
            // the bubble means "unfiled ideas" exactly as its title says.
            notes: [],
        }];
};

/**
 * A cluster's fan, in the order it is drawn: every idea, then every note.
 *
 * The fan is one arc over two kinds of thing, so the petal renderer needs one
 * indexable list rather than two and some arithmetic. Ideas come first so a
 * topic's ideas keep the positions they have today — filing a note under a
 * topic must not reshuffle the fan the reader already knows.
 */
export const clusterMembers = (cluster) => [
    ...cluster.ideas.map(item => ({ kind: 'idea', item })),
    ...cluster.notes.map(item => ({ kind: 'note', item })),
];

/** One topic, its fan, and the region that holds the two together. */
const TopicCluster = ({
    cluster,
    topicBox,
    fan,
    isActive,
    isFaded,
    isExpanded,
    isPinned,
    onTogglePin,
    onEnter,
    onLeave,
    onTopicClick,
    onChipClick,
    onSelectIdea,
}) => {
    // Nothing at all when the page did not ask for pinning, rather than a pin
    // wired to a no-op: BubbleCard draws no toggle unless it is handed one, so
    // the absent props have to stay absent all the way down.
    const pinPropsFor = (itemType, itemId, title) => (onTogglePin
        ? {
            isPinned: isPinned(itemType, itemId),
            onTogglePin: () => onTogglePin(itemType, itemId, title),
        }
        : {});

    return (
        <BloomCluster
            anchorBox={topicBox}
            fan={fan}
            isActive={isActive}
            isExpanded={isExpanded}
            onEnter={() => onEnter(cluster.id)}
            onLeave={() => onLeave(cluster.id)}
            onChipClick={() => onChipClick(cluster.id)}
            renderAnchor={(position) => (
                <BubbleCard
                    kind={cluster.kind}
                    title={cluster.title}
                    subtitle={countLabel(cluster.ideas.length, 'idea')}
                    position={position}
                    scale={topicBox.width / TOPIC_CARD.width}
                    isSelected={isActive}
                    isFaded={isFaded}
                    onActivate={() => onTopicClick(cluster.id)}
                    {...(cluster.kind === 'topic'
                        ? pinPropsFor('topic', cluster.id, cluster.title)
                        : {})}
                />
            )}
            renderPetal={(card, petal) => {
                const member = clusterMembers(cluster)[card.index];
                if (!member) return null;

                if (member.kind === 'note') {
                    const note = member.item;
                    const noteTitle = note.title || UNTITLED_NOTE_LABEL;

                    return (
                        <BubbleCard
                            key={`note-${note.id}`}
                            kind="note"
                            title={noteTitle}
                            // The raw markdown, clamped by the stylesheet rather
                            // than cut here — the same treatment the idea view's
                            // note cards get.
                            subtitle={note.body}
                            {...pinPropsFor('note', note.id, noteTitle)}
                            {...petal}
                        />
                    );
                }

                const idea = member.item;
                const ideaTitle = idea.title || UNTITLED_IDEA_LABEL;

                return (
                    <BubbleCard
                        key={`idea-${idea.id}`}
                        kind="idea"
                        title={ideaTitle}
                        onActivate={() => onSelectIdea(idea.id)}
                        {...pinPropsFor('idea', idea.id, ideaTitle)}
                        {...petal}
                    />
                );
            }}
        />
    );
};

/**
 * @param topics        every topic the reader has
 * @param ideas         every idea, each carrying the topics it is filed under
 * @param onSelectIdea  (ideaId) -> void; what clicking a fanned idea card
 *                      does. Thoughts opens the idea view with it, the
 *                      importer files the idea against the open chapter
 * @param isPinned      (itemType, itemId) -> boolean, from usePins. Optional,
 *                      and only meaningful alongside onTogglePin
 * @param onTogglePin   (itemType, itemId, title) -> void, from usePins.
 *                      Omit it and the field draws no pins at all
 */
const TopicIdeaField = ({
    topics = [],
    ideas = [],
    onSelectIdea = () => {},
    isPinned = () => false,
    onTogglePin = null,
}) => {
    const canvasRef = useRef(null);
    const canvas = useCanvasSize(canvasRef);

    const bloom = useBloom();

    const clusters = useMemo(() => buildClusters(topics, ideas), [topics, ideas]);
    const field = useMemo(() => buildField(clusters, canvas), [clusters, canvas]);

    // Every fan, not just the open one — see the note at the top of the file.
    // Sized to ideas + notes, because both fan out of the same topic on one arc.
    const fans = useMemo(() => field.map(
        (box, index) => buildFan(clusterMembers(clusters[index]).length, centreOf(box), canvas)
    ), [field, clusters, canvas]);

    return (
        <div className="thoughts-field" ref={canvasRef}>
            {clusters.length === 0 && (
                <p className="thoughts-message">
                    No topics yet — start one with + Topic.
                </p>
            )}

            {field.map((box, index) => (
                <TopicCluster
                    key={clusters[index].id}
                    cluster={clusters[index]}
                    topicBox={box}
                    fan={fans[index]}
                    isActive={bloom.isActive(clusters[index].id)}
                    isFaded={bloom.isFaded(clusters[index].id)}
                    isExpanded={bloom.isExpanded(clusters[index].id)}
                    isPinned={isPinned}
                    onTogglePin={onTogglePin}
                    onEnter={bloom.onEnter}
                    onLeave={bloom.onLeave}
                    onTopicClick={bloom.onAnchorClick}
                    onChipClick={bloom.onChipClick}
                    onSelectIdea={onSelectIdea}
                />
            ))}
        </div>
    );
};

export default TopicIdeaField;
