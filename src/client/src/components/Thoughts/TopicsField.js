import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BubbleCard from './BubbleCard';
import buildField, { TOPIC_CARD } from './fieldLayout';
import buildFan from './fanLayout';
import useCanvasSize from './useCanvasSize';
import { centreOf, collapseOnto, relativeTo } from './cardGeometry';
import { UNTITLED_IDEA_LABEL } from './TopBar';
import { countLabel } from './format';

// The topics view: every topic as a card on a field, and the spotlight that
// opens one of them.
//
// ── The cluster is the hover target, not the card ──────────────────────────
//
// The fan opens at a radius of 190px from the topic's centre, which means the
// reader's cursor has to cross ~90px of empty canvas to reach the idea it is
// aiming at. If the hover lived on the topic card, the fan would close halfway
// through that journey and the cards would be unreachable — the layout would
// be drawing a menu that nothing can select from.
//
// So a topic, its fan, and the gaps between them are ONE element with ONE pair
// of enter/leave handlers. At rest that element is exactly the topic's card, so
// thirty resting clusters do not overlap each other and empty canvas opens
// nothing. On activation it grows to the bounding box of everything the cluster
// is currently drawing, and the gaps become part of the target. That is the
// whole trick, and it is why there are no per-card hover handlers below.
//
// ── Why the grown cluster does not trap the cursor ─────────────────────────
//
// An open cluster's box is wide enough to cover its neighbours, and a hit
// region sitting on top of a neighbour is a topic the reader can no longer
// reach — hovering another topic moves the spotlight to it, and clicking one
// locks it open, so a box that swallowed its neighbours would take both away.
// The fix is stacking order rather than geometry: the
// cluster element takes no `z-index`, so it does not create a stacking context
// and does not paint above anything; the cards inside it declare their own,
// and they land in the canvas's stacking context alongside every other card.
// Neighbouring topic cards therefore sit ABOVE the open cluster's empty region
// and stay hoverable, while the open fan sits above them and stays clickable.
// Nothing on the cluster element may ever set `transform`, `opacity`, `filter`
// or `will-change` — any of those would make it a stacking context and put the
// dead zone back.
//
// ── Hover opens a fan; a click sticks it open ──────────────────────────────
//
// Hovering is enough to READ a topic's ideas and not enough to REACH one. The
// petals sit on an arc wide enough to overlap the neighbouring topic cards,
// which by the paragraph above paint on top of the open cluster's empty
// region — so the cursor's trip out to a petal crosses cards belonging to
// other clusters. Clicking the topic locks its fan open so that trip can be
// made, and while the lock is held no amount of hovering elsewhere disturbs
// it. Only a second click on the same topic, a click on a different one, or
// Esc lets it go.
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

// How much later each card leaves the topic than the one before it. Small on
// purpose: enough that the fan sweeps rather than appears, short enough that
// the last card of fifteen is not a quarter-second behind the first.
const FAN_STAGGER_MS = 16;

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
    }));

    const unfiled = safeIdeas.filter(idea => (idea.topics || []).length === 0);

    return unfiled.length === 0
        ? clusters
        : [...clusters, { id: UNFILED_ID, kind: 'unfiled', title: UNFILED_TITLE, ideas: unfiled }];
};

/**
 * The cluster's hit region: its topic card at rest, everything it is drawing
 * when it is open.
 *
 * Row-1 cards are counted only once the chip has been pressed, because until
 * then they are sitting under the chip — a region stretched to where they will
 * eventually be would be a large piece of empty canvas that keeps the fan open.
 */
const boundsFor = (topicBox, fan, isActive, isExpanded) => {
    if (!isActive) return topicBox;

    const boxes = [topicBox, ...fan.cards.filter(card => card.row === 0 || isExpanded)];
    if (fan.overflow) boxes.push(fan.overflow);

    const left = Math.min(...boxes.map(box => box.x));
    const top = Math.min(...boxes.map(box => box.y));
    const right = Math.max(...boxes.map(box => box.x + box.width));
    const bottom = Math.max(...boxes.map(box => box.y + box.height));

    return { x: left, y: top, width: right - left, height: bottom - top };
};

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
    onShowIdea,
}) => {
    const bounds = boundsFor(topicBox, fan, isActive, isExpanded);
    const topicCentre = centreOf(topicBox);
    const chipCentre = fan.overflow ? centreOf(fan.overflow) : topicCentre;

    const classes = [
        'thoughts-cluster',
        isActive ? 'is-active' : '',
        isExpanded ? 'is-expanded' : '',
    ].filter(Boolean).join(' ');

    return (
        <div
            className={classes}
            style={{
                left: `${bounds.x}px`,
                top: `${bounds.y}px`,
                width: `${bounds.width}px`,
                height: `${bounds.height}px`,
            }}
            onMouseEnter={() => onEnter(cluster.id)}
            onMouseLeave={() => onLeave(cluster.id)}
        >
            <BubbleCard
                kind={cluster.kind}
                title={cluster.title}
                subtitle={countLabel(cluster.ideas.length, 'idea')}
                position={relativeTo(bounds, topicBox)}
                scale={topicBox.width / TOPIC_CARD.width}
                isSelected={isActive}
                isFaded={isFaded}
                isPinned={cluster.kind === 'topic' && isPinned('topic', cluster.id)}
                onActivate={() => onTopicClick(cluster.id)}
                {...(cluster.kind === 'topic'
                    ? { onTogglePin: () => onTogglePin('topic', cluster.id, cluster.title) }
                    : {})}
            />

            <div className="thoughts-fan">
                {fan.cards.map(card => {
                    const idea = cluster.ideas[card.index];
                    if (!idea) return null;

                    const isStowed = card.row === 1 && !isExpanded;
                    const title = idea.title || UNTITLED_IDEA_LABEL;

                    return (
                        <BubbleCard
                            key={idea.id}
                            kind="idea"
                            title={title}
                            position={relativeTo(bounds, card)}
                            scale={fan.scale}
                            isPinned={isPinned('idea', idea.id)}
                            onActivate={() => onShowIdea(idea.id)}
                            onTogglePin={() => onTogglePin('idea', idea.id, title)}
                            className={`thoughts-fan-item${isStowed ? ' is-stowed' : ''}`}
                            style={{
                                ...collapseOnto(isStowed ? chipCentre : topicCentre, card),
                                // Cards nearest the start of the arc leave
                                // first, so the fan reads as one movement out
                                // of the topic rather than fifteen at once.
                                '--card-delay': `${card.index * FAN_STAGGER_MS}ms`,
                            }}
                        />
                    );
                })}

                {fan.overflow && (
                    <button
                        type="button"
                        className="thoughts-fan-chip"
                        aria-expanded={isExpanded}
                        style={{
                            left: `${fan.overflow.x - bounds.x}px`,
                            top: `${fan.overflow.y - bounds.y}px`,
                            width: `${fan.overflow.width}px`,
                            height: `${fan.overflow.height}px`,
                            ...collapseOnto(topicCentre, fan.overflow),
                        }}
                        onClick={() => onChipClick(cluster.id)}
                    >
                        +{fan.overflow.count} more
                    </button>
                )}
            </div>
        </div>
    );
};

/**
 * @param topics      every topic the reader has
 * @param ideas       every idea, each carrying the topics it is filed under
 * @param isPinned    (itemType, itemId) -> boolean, from usePins
 * @param onTogglePin (itemType, itemId, title) -> void, from usePins
 * @param onShowIdea  (ideaId) -> void; useThoughtsView.showIdea in the page
 */
const TopicsField = ({
    topics = [],
    ideas = [],
    isPinned = () => false,
    onTogglePin = () => {},
    onShowIdea = () => {},
}) => {
    const canvasRef = useRef(null);
    const canvas = useCanvasSize(canvasRef);

    const [hoveredId, setHoveredId] = useState(null);
    const [lockedId, setLockedId] = useState(null);
    const [expandedId, setExpandedId] = useState(null);

    // A lock outranks the pointer: that is what "locks the fan open" means. It
    // is why leaving a locked cluster leaves it open, and why hovering any
    // other one while a lock is held changes nothing on screen. `hoveredId` is
    // still tracked underneath, so that releasing the lock hands the spotlight
    // to whatever the cursor is actually on rather than closing everything.
    const activeId = lockedId !== null ? lockedId : hoveredId;

    const clusters = useMemo(() => buildClusters(topics, ideas), [topics, ideas]);
    const field = useMemo(() => buildField(clusters, canvas), [clusters, canvas]);

    // Every fan, not just the open one — see the note at the top of the file.
    const fans = useMemo(() => field.map(
        (box, index) => buildFan(clusters[index].ideas.length, centreOf(box), canvas)
    ), [field, clusters, canvas]);

    // A hover is recorded whatever else is going on, but it does not touch the
    // lock. It used to: hovering another topic was a third way to unlock,
    // alongside a second click and Esc — and it defeated the lock's whole
    // purpose. The fan's petals sit on an arc wide enough to overlap the
    // neighbouring topic cards, and those cards paint ABOVE the open cluster's
    // region by design, so the cursor's trip out to a petal crosses them. With
    // hover unlocking, that crossing shut the fan a card short of the one the
    // reader was reaching for, which is the exact journey the lock exists to
    // make possible. Ending it is now a deliberate act and nothing else: a
    // second click on the locked topic, a click on a different one, or Esc.
    const handleEnter = useCallback((id) => {
        setHoveredId(id);
    }, []);

    const handleLeave = useCallback((id) => {
        setHoveredId(hovered => (hovered === id ? null : hovered));
    }, []);

    // Click to stick, click again to unstick — and clicking a different topic
    // moves the lock rather than adding a second one, so there is never more
    // than one fan held open.
    const handleTopicClick = useCallback((id) => {
        setLockedId(locked => (locked === id ? null : id));
    }, []);

    const handleChipClick = useCallback((id) => {
        setExpandedId(expanded => (expanded === id ? null : id));
    }, []);

    // Esc unlocks, and only unlocks: if the cursor is still on the cluster the
    // fan stays open under it, because the pointer has not gone anywhere and
    // the page would be lying about where the reader is.
    useEffect(() => {
        if (lockedId === null) return undefined;

        const onKeyDown = (event) => {
            if (event.key === 'Escape') setLockedId(null);
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [lockedId]);

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
                    isActive={activeId === clusters[index].id}
                    // Near-invisible rather than gone: the spotlight is meant to
                    // read as the rest of the field receding, and a card that
                    // vanished would take the shape of the field with it.
                    isFaded={activeId !== null && activeId !== clusters[index].id}
                    isExpanded={expandedId === clusters[index].id && activeId === clusters[index].id}
                    isPinned={isPinned}
                    onTogglePin={onTogglePin}
                    onEnter={handleEnter}
                    onLeave={handleLeave}
                    onTopicClick={handleTopicClick}
                    onChipClick={handleChipClick}
                    onShowIdea={onShowIdea}
                />
            ))}
        </div>
    );
};

export default TopicsField;
