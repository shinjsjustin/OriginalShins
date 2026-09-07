import React, { useState } from 'react';
import ImportPicker from '../Bubbles/ImportPicker';
import { withMember, withoutMember } from './noteFilingSets';

// What an open note is filed under, and the way to change it.
//
// ── Two memberships, not one list ──────────────────────────────────────────
//
// A note sits under ideas and, separately, under topics. They are different
// tables behind different endpoints, and either may be empty while the other
// is not. So the rows below say which kind each one is: the × on an idea row
// and the × on a topic row look identical and write to different places, and a
// list that hid the difference would be a list whose buttons cannot be told
// apart.
//
// ── Why a picker and not a checkbox list ───────────────────────────────────
//
// This section used to be every idea in the corpus as a checkbox, which is a
// list that grows without bound and cannot express topics at all. It is now
// the note's own filing — short, and only what is true — with the whole corpus
// one press of Import away, in the same field of bubbles the chapter importer
// opens.
//
// ── Adding is a whole-set write ────────────────────────────────────────────
//
// Both endpoints REPLACE the membership, so importing sends what the note
// already has plus the new id and unfiling sends it minus one. That arithmetic
// is in noteFilingSets.js, shared by all four paths through here. Importing
// something already held sends nothing at all: withMember returns the same
// array, and a PUT storing what is stored is a round trip for no change.

export const EMPTY_MESSAGE = 'Not filed under anything yet.';

/** The unfile button's accessible name. Carries the title, because the section draws several. */
export const unfileLabelFor = (title) => `Unfile ${title} from this note`;

/**
 * @param note          the open note, carrying `ideas` and `topics`
 * @param topics        every topic, for the picker's field
 * @param ideas         every idea, each carrying its topics
 * @param onSaveIdeas   (noteId, ideaIds) -> void; replaces the whole idea set
 * @param onSaveTopics  (noteId, topicIds) -> void; replaces the whole topic set
 */
const NoteFiling = ({ note, topics, ideas, onSaveIdeas, onSaveTopics }) => {
    // Whether the overlay is up is this section's business and leaves it —
    // the same rule NotesPanel follows for the chapter importer.
    const [isImporting, setIsImporting] = useState(false);

    // There is no optimistic update: a row stays on screen, closed over this
    // render's ideaIds/topicIds, until its write returns and a refreshed note
    // comes back down. Both endpoints replace the whole membership, so two
    // rows removed in quick succession send two whole-set writes racing on
    // stale copies of the same list — whichever lands second silently puts
    // back what the first one just removed. One flag rather than one per
    // tier: cross-tier writes (one idea, one topic) can't actually race, but
    // the window is milliseconds and "a filing write is in flight, wait" is
    // the simpler and more honest thing to hold the reader to than tracking
    // which tier is busy.
    const [isSaving, setIsSaving] = useState(false);

    const ideaIds = note.ideas.map(idea => idea.id);
    const topicIds = note.topics.map(topic => topic.id);

    // Runs one whole-set write while isSaving is held. handleSaveIdeas and
    // handleSaveTopics are async and resolve to the saved note — but they
    // resolve to null, rather than rejecting, when the underlying write
    // fails (useCollection.run catches it and returns null). Promise.resolve
    // plus finally clears the flag either way, so a failed save doesn't leave
    // this section frozen.
    const runWrite = (save) => {
        setIsSaving(true);
        Promise.resolve(save()).finally(() => setIsSaving(false));
    };

    // A plain function rather than a useCallback: both id lists above are
    // rebuilt by .map() on every render, so a memo keyed on them could never
    // hold — the same reason ImportPicker's three were taken out.
    const handleImport = (pick) => {
        setIsImporting(false);

        // A write from an unfile click, or an earlier import, is still in
        // flight — see isSaving above. Drop this one rather than race it.
        if (isSaving) return;

        if (pick.kind === 'topic') {
            const next = withMember(topicIds, pick.id);
            // Referentially equal means the note already holds it — see
            // withMember. Nothing to send.
            if (next !== topicIds) runWrite(() => onSaveTopics(note.id, next));
            return;
        }

        const next = withMember(ideaIds, pick.id);
        if (next !== ideaIds) runWrite(() => onSaveIdeas(note.id, next));
    };

    // Ideas first, then topics — the order the two memberships are written in
    // everywhere else on the page, and the order the editor used to offer them.
    const rows = [
        ...note.ideas.map(idea => ({
            key: `idea-${idea.id}`,
            kind: 'idea',
            title: idea.title,
            onUnfile: () => runWrite(() => onSaveIdeas(note.id, withoutMember(ideaIds, idea.id))),
        })),
        ...note.topics.map(topic => ({
            key: `topic-${topic.id}`,
            kind: 'topic',
            title: topic.name,
            onUnfile: () => runWrite(() => onSaveTopics(note.id, withoutMember(topicIds, topic.id))),
        })),
    ];

    return (
        <section className="analyze-editor-filing">
            <h4 className="analyze-picker-heading">Ideas &amp; topics</h4>

            {rows.length === 0 && <p className="analyze-message">{EMPTY_MESSAGE}</p>}

            <ul className="analyze-filing-list">
                {rows.map(row => (
                    <li key={row.key} className="analyze-filing-row">
                        <span className="analyze-filing-title">{row.title}</span>
                        {/* Only on topics. An unmarked row is an idea, which is
                            the common case and does not need saying twice. */}
                        {row.kind === 'topic' && (
                            <span className="analyze-filing-kind">topic</span>
                        )}
                        <button
                            type="button"
                            className="analyze-filing-remove"
                            onClick={row.onUnfile}
                            aria-label={unfileLabelFor(row.title)}
                            disabled={isSaving}
                        >
                            ×
                        </button>
                    </li>
                ))}
            </ul>

            <button
                type="button"
                className="analyze-editor-button"
                onClick={() => setIsImporting(true)}
            >
                Import
            </button>

            {/* Both kinds, unlike the chapter importer: a note has an idea
                membership AND a topic membership, and this is the only place
                on the page that can write the second. */}
            {isImporting && (
                <ImportPicker
                    label={`Import into ${note.title}`}
                    topics={topics}
                    ideas={ideas}
                    selectableKinds={['idea', 'topic']}
                    onImport={handleImport}
                    onClose={() => setIsImporting(false)}
                />
            )}
        </section>
    );
};

export default NoteFiling;
