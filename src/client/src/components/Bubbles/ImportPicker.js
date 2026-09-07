import React, { useState } from 'react';
import BubbleOverlay from './BubbleOverlay';
import TopicIdeaField from './TopicIdeaField';
import { UNTITLED_IDEA_LABEL } from '../Thoughts/TopBar';

// Picking one thing out of the field of bubbles, and confirming it.
//
// ── Why the confirm step exists ────────────────────────────────────────────
//
// The field used to commit on the click: press an idea and it was filed. That
// works while there is one kind of thing to press and one place for it to go.
// It stops working the moment a TOPIC is also pressable, because the two are
// stored in different tables through different endpoints — so a mis-aimed
// click is no longer "the wrong idea", it is a write to somewhere else
// entirely. Holding the pick and confirming it makes the reader's intent
// explicit at the one point where it became ambiguous.
//
// ── One pick, and it carries its kind ──────────────────────────────────────
//
// The pick is a single { kind, id } and picking again replaces it. Not a
// multi-select: importing is one thing at a time, and the bar has to be able
// to name what will happen in one line.
//
// The kind travels WITH the id because ideas and topics number independently —
// idea 1 and topic 1 both exist — so an id alone would be ambiguous both to
// the field, which decides which card to light, and to the caller, which
// decides which endpoint to write.
//
// ── What may be picked is the caller's decision ────────────────────────────
//
// `selectableKinds` exists because the two callers can store different things.
// A note has both an idea membership and a topic membership; a chapter has
// only an idea one, and there is nowhere for a picked topic to go. A kind left
// out is not merely un-clickable — no pick of that kind is ever formed, so the
// card cannot end up picked by any route.
//
// Notes are never selectable. A topic's fan holds its notes beside its ideas
// (see buildClusters), and a note is not importable into anything.

const PROMPT = 'Pick a topic or an idea to import.';

/**
 * The line the confirm bar shows.
 *
 * A function rather than JSX inline, because the phrasing is the whole point
 * of the bar: it has to name WHICH KIND as well as which thing, and the empty
 * case is a prompt rather than a blank. Exported so a caller wanting a
 * different wording has something to read; the tests reach it through the
 * bar's own `role="status"`, which is where a reader meets it.
 */
export const describePick = (pick, topics, ideas) => {
    if (!pick) return PROMPT;

    if (pick.kind === 'topic') {
        const topic = topics.find(item => item.id === pick.id);
        return `Selected: topic “${topic ? topic.name : ''}”`;
    }

    const idea = ideas.find(item => item.id === pick.id);
    return `Selected: idea “${idea ? (idea.title || UNTITLED_IDEA_LABEL) : ''}”`;
};

/**
 * @param label            the dialog's accessible name
 * @param topics           every topic, for the field
 * @param ideas            every idea, each carrying its topics
 * @param selectableKinds  which tiers may be picked: ['idea'] or ['idea','topic']
 * @param onImport         ({ kind, id }) -> void. Does NOT close the picker —
 *                         the caller owns the write, so the caller owns the close
 * @param onClose          what Cancel, Escape and the backdrop do
 */
const ImportPicker = ({
    label,
    topics = [],
    ideas = [],
    selectableKinds = ['idea'],
    onImport,
    onClose,
}) => {
    const [pick, setPick] = useState(null);

    const canPick = (kind) => selectableKinds.includes(kind);

    // Guarded at the point the pick is FORMED rather than where it is drawn, so
    // a kind the caller did not offer cannot become picked by any route.
    const pickIdea = (id) => {
        if (canPick('idea')) setPick({ kind: 'idea', id });
    };

    const pickTopic = (id) => {
        if (canPick('topic')) setPick({ kind: 'topic', id });
    };

    return (
        <BubbleOverlay label={label} onClose={onClose}>
            <div className="bubble-picker">
                <div className="bubble-picker-field">
                    <TopicIdeaField
                        topics={topics}
                        ideas={ideas}
                        pick={pick}
                        onSelectIdea={pickIdea}
                        // Always handed over, so a topic click opens its fan
                        // through the same path whether or not topics are
                        // pickable here; the guard is inside pickTopic.
                        onPickTopic={pickTopic}
                    />
                </div>

                {/* Its own strip rather than a bar floating over the canvas:
                    the field measures the box it is rendered in and lays cards
                    across all of it, so anything overlapping it would cover
                    them. */}
                <div className="bubble-picker-bar">
                    <p className="bubble-picker-pick" role="status">
                        {describePick(pick, topics, ideas)}
                    </p>

                    <div className="bubble-picker-actions">
                        <button
                            type="button"
                            className="bubble-picker-button"
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                        {/* Disabled with nothing picked: a confirm button that
                            confirms nothing teaches the reader it does
                            nothing. */}
                        <button
                            type="button"
                            className="bubble-picker-button bubble-picker-button--primary"
                            disabled={!pick}
                            onClick={() => onImport(pick)}
                        >
                            Import
                        </button>
                    </div>
                </div>
            </div>
        </BubbleOverlay>
    );
};

export default ImportPicker;
