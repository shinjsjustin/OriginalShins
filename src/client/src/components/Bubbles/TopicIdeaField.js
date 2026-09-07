import React, { useMemo, useRef } from 'react';
import BubbleCard from './BubbleCard';
import BloomCluster from './BloomCluster';
import useBloom from './useBloom';
import buildField, { TOPIC_CARD } from './fieldLayout';
import buildFan from './fanLayout';
import useCanvasSize from './useCanvasSize';
import { centreOf } from './cardGeometry';
import { UNTITLED_IDEA_LABEL } from '../Thoughts/TopBar';
import {
    UNTITLED_NOTE_LABEL,
    PASSAGE_FAN,
    PassageText,
    passageLabel,
} from '../Thoughts/IdeaOrbit';
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
    isPicked,
    isPinned,
    onTogglePin,
    onEnter,
    onLeave,
    onTopicClick,
    onChipClick,
    onSelectIdea,
    pickedIdeaId,
    bloomableNoteIds,
    isNoteBlooming,
    onNoteClick,
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
                    isPicked={isPicked}
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
                    // A note anchored to nothing has nothing to open, so it is
                    // not a control — the same rule the idea orbit's notes
                    // follow. Its pin still works; only the face goes inert.
                    const canBloom = bloomableNoteIds.includes(note.id);

                    return (
                        <BubbleCard
                            key={`note-${note.id}`}
                            kind="note"
                            title={noteTitle}
                            // The raw markdown, clamped by the stylesheet rather
                            // than cut here — the same treatment the idea view's
                            // note cards get.
                            subtitle={note.body}
                            isSelected={isNoteBlooming(note.id)}
                            onActivate={canBloom ? () => onNoteClick(note.id) : null}
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
                        isPicked={pickedIdeaId === idea.id}
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
 * @param pick          { kind: 'idea' | 'topic', id } | null — which card is
 *                      drawn as picked. It carries the KIND as well as the id
 *                      because the two tiers number independently, and an id
 *                      alone would light an idea and a topic together
 * @param onPickTopic   (topicId) -> void. Optional: without it a topic card is
 *                      not selectable and a click merely opens its fan, which
 *                      is what the Thoughts page wants
 * @param isPinned      (itemType, itemId) -> boolean, from usePins. Optional,
 *                      and only meaningful alongside onTogglePin
 * @param onTogglePin   (itemType, itemId, title) -> void, from usePins.
 *                      Omit it and the field draws no pins at all
 * @param passagesByTopicId { [topicId]: [passage, ...] } — the scripture behind
 *                      a topic's own notes, each passage carrying the `noteId`
 *                      it belongs to. Absent until that topic's fan has been
 *                      opened once; a topic with none simply blooms nothing
 * @param onTopicOpen   (topicId) -> void, fired the first time a fan opens, so
 *                      the caller can fetch that topic's passages then rather
 *                      than fetching every topic's on entry
 */
const TopicIdeaField = ({
    topics = [],
    ideas = [],
    onSelectIdea = () => {},
    pick = null,
    onPickTopic = null,
    isPinned = () => false,
    onTogglePin = null,
    passagesByTopicId = {},
    onTopicOpen = () => {},
}) => {
    const canvasRef = useRef(null);
    const canvas = useCanvasSize(canvasRef);

    const bloom = useBloom();
    // A second bloom, over notes rather than topics. They are independent
    // subjects — a topic is open OR closed regardless of which of its notes is
    // showing its passages — so two hooks rather than one keyed on both.
    const noteBloom = useBloom();

    const clusters = useMemo(() => buildClusters(topics, ideas), [topics, ideas]);
    const field = useMemo(() => buildField(clusters, canvas), [clusters, canvas]);

    // Every fan, not just the open one — see the note at the top of the file.
    // Sized to ideas + notes, because both fan out of the same topic on one arc.
    const fans = useMemo(() => field.map(
        (box, index) => buildFan(clusterMembers(clusters[index]).length, centreOf(box), canvas)
    ), [field, clusters, canvas]);

    // One entry per note that HAS passages, carrying the arc they sit on.
    //
    // ── Why these are built here and not inside the petal ──────────────────
    //
    // A BloomCluster positions itself in canvas coordinates, and a petal is
    // already rendered inside its parent cluster's offset region — so a
    // BloomCluster nested in a petal would be offset twice and land nowhere
    // near its note. The passage cards are therefore siblings of the clusters,
    // drawn straight onto the field, off the canvas box the fan gave the note.
    // `fans[i].cards[j]` are canvas boxes for exactly that reason: BloomCluster
    // converts them with relativeTo() on the way in.
    const passageFans = useMemo(() => clusters.flatMap((cluster, index) => {
        const byNoteId = (passagesByTopicId[cluster.id] || []).reduce((acc, passage) => ({
            ...acc,
            [passage.noteId]: [...(acc[passage.noteId] || []), passage],
        }), {});

        return clusterMembers(cluster).flatMap((member, memberIndex) => {
            if (member.kind !== 'note') return [];

            const passages = byNoteId[member.item.id] || [];
            const card = fans[index] && fans[index].cards[memberIndex];
            if (passages.length === 0 || !card) return [];

            return [{
                key: `${cluster.id}:${member.item.id}`,
                clusterId: cluster.id,
                noteId: member.item.id,
                passages,
                fan: buildFan(passages.length, centreOf(card), canvas, PASSAGE_FAN),
            }];
        });
    }), [clusters, fans, passagesByTopicId, canvas]);

    // Which of a cluster's notes could bloom at all, so a note anchored to
    // nothing is not dressed up as a control.
    const bloomableIdsByClusterId = useMemo(() => passageFans.reduce((acc, noteFan) => ({
        ...acc,
        [noteFan.clusterId]: [...(acc[noteFan.clusterId] || []), noteFan.noteId],
    }), {}), [passageFans]);

    const openFans = passageFans.filter(noteFan => noteBloom.isActive(noteFan.noteId));

    // A topic whose note is showing its passages stays open, even though the
    // cursor has left its region to reach them. Without this the fan closes the
    // moment the pointer crosses onto a passage card, taking the passages with
    // it — the same journey the topic lock exists to protect, one tier down.
    const heldOpenClusterId = openFans.length > 0 ? openFans[0].clusterId : null;

    return (
        <div className="thoughts-field" ref={canvasRef}>
            {clusters.length === 0 && (
                <p className="thoughts-message">
                    No topics yet — start one with + Topic.
                </p>
            )}

            {field.map((box, index) => {
                const clusterId = clusters[index].id;
                const isHeldOpen = heldOpenClusterId === clusterId;

                return (
                    <TopicCluster
                        key={clusterId}
                        cluster={clusters[index]}
                        topicBox={box}
                        fan={fans[index]}
                        isActive={bloom.isActive(clusterId) || isHeldOpen}
                        isFaded={bloom.isFaded(clusterId) && !isHeldOpen}
                        isExpanded={bloom.isExpanded(clusterId)}
                        isPicked={Boolean(pick) && pick.kind === 'topic' && pick.id === clusterId}
                        pickedIdeaId={pick && pick.kind === 'idea' ? pick.id : null}
                        isPinned={isPinned}
                        onTogglePin={onTogglePin}
                        onEnter={(id) => {
                            // The passages this fan may need, asked for once.
                            // The unfiled bubble's id is a string, which the
                            // caller rejects — the intended no-op, not an
                            // accident.
                            onTopicOpen(id);
                            bloom.onEnter(id);
                        }}
                        onLeave={bloom.onLeave}
                        onTopicClick={(id) => {
                            // Both, and in this order. Picking is the caller's
                            // business and opening is the field's, and a topic
                            // that only did one of them would either be
                            // unpickable or unopenable.
                            if (onPickTopic) onPickTopic(id);
                            bloom.onAnchorClick(id);
                        }}
                        onChipClick={bloom.onChipClick}
                        onSelectIdea={onSelectIdea}
                        bloomableNoteIds={bloomableIdsByClusterId[clusterId] || []}
                        isNoteBlooming={noteBloom.isActive}
                        onNoteClick={noteBloom.onAnchorClick}
                    />
                );
            })}

            {/* Only the open one is mounted, unlike the topic fans above. Those
                are all mounted so a CSS transition has a closed state to animate
                out of; a passage fan has no such entrance — it appears when its
                note is clicked — and mounting every note's passages on every
                card of the field would be hundreds of cards holding scripture. */}
            {openFans.map((noteFan) => {
                const isExpanded = noteBloom.isExpanded(noteFan.noteId);

                return (
                    <div className="thoughts-passage-fan" key={noteFan.key}>
                        {noteFan.fan.cards.map(card => {
                            const passage = noteFan.passages[card.index];
                            if (!passage) return null;

                            // Everything past one arc is placed on a second,
                            // wider one — but for cards this size that arc is
                            // nearer the first than a card is tall, so drawing
                            // it straight away lays these over the passages
                            // already on show. They wait under the chip, which
                            // is what BloomCluster does for a topic's ideas and
                            // what this fan has to do for itself: it is drawn
                            // outside any cluster, for the offset reason above.
                            const isStowed = card.row === 1 && !isExpanded;

                            return (
                                <BubbleCard
                                    key={passage.id}
                                    kind="passage"
                                    className={isStowed ? 'is-stowed' : ''}
                                    title={passageLabel(passage)}
                                    // `body` rather than `subtitle`, which is
                                    // also why this card gets no `onActivate`:
                                    // BubbleCard's face is a button whenever it
                                    // activates, and paragraphs inside a button
                                    // are markup no browser agrees on.
                                    body={<PassageText verses={passage.verses} />}
                                    position={card}
                                    scale={noteFan.fan.scale}
                                />
                            );
                        })}

                        {noteFan.fan.overflow && (
                            <button
                                type="button"
                                className="thoughts-fan-chip"
                                aria-expanded={isExpanded}
                                style={{
                                    left: `${noteFan.fan.overflow.x}px`,
                                    top: `${noteFan.fan.overflow.y}px`,
                                    width: `${noteFan.fan.overflow.width}px`,
                                    height: `${noteFan.fan.overflow.height}px`,
                                }}
                                onClick={() => noteBloom.onChipClick(noteFan.noteId)}
                            >
                                +{noteFan.fan.overflow.count} more
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default TopicIdeaField;
