import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../../config/api';
import { LINK_HINTS } from './linkRules';

// The Thoughts page's corpus — topics, ideas, and the notes of whichever idea
// is open — plus every write the canvas and the pinned panel can make.
//
// ── One hook for three tiers, and why it is not three hooks ────────────────
//
// Analyze/useCollection holds ONE list, which suited the two pages that used to
// own these tiers — /ideas and /topics were separate, and a write on one of
// them was nothing to the other. This page is one canvas over all three tiers
// with one editing panel beside it, and a write to any tier changes what the
// others display: filing an idea under a topic changes that topic's idea count, and
// deleting an idea changes the note counts above it. Three hooks would mean
// three revisions, three loading flags and three error banners for what the
// reader experiences as one picture, and — worse — a write through one of them
// would leave the other two showing counts that are quietly wrong. So the
// `revision` trick from useCollection is kept and applied once: every
// successful write bumps a counter this effect depends on, and the whole page
// reloads from the server rather than from a guess about what the write did.
//
// ── Which notes are loaded, and why not all of them ────────────────────────
//
// The API has no whole-corpus note endpoint — GET /api/notes answers about one
// chapter — and the page needs none. Notes are drawn only in the idea view,
// ringing the one idea that is open, so `ideaId` decides what is fetched: null
// loads no notes at all. The idea's own payload lists them (title and anchor,
// no body), and the orbit shows a clamped body, so each is then fetched in
// full. That is 1 + N requests on entering an idea, N being the spec's ~20
// notes per idea; it is the price of not adding an endpoint, it is paid once
// per idea opened, and the N are in flight together.
//
// The passages are the one thing that IS an endpoint of its own, and it is one
// request for the whole ring rather than one per note — see
// GET /api/ideas/:id/passages. A note carries WHERE it is anchored and never
// what the passage says, so the verses behind those anchors have to be asked
// for; asking per note would have doubled the N above for a payload the server
// gathers in two queries. They are attached to the notes here, so nothing
// downstream has to join two lists by hand.
const TOPICS_PATH = '/topics';
const IDEAS_PATH = '/ideas';

// Where each link lives, keyed by "<parent tier>:<child tier>".
//
// The child is the side that OWNS the set — `PUT /api/notes/:id/ideas` replaces
// a note's whole set of ideas — and it is the side that appears in the URL.
//
// Keyed by the pair rather than by the child alone, which is what it used to be.
// That worked while a child owned exactly one set; a note now owns two (its
// ideas and its topics), and keying by `note` would send both of them to
// whichever endpoint the map happened to name — a full-set replace against the
// wrong membership, which silently empties the other one.
const LINK_TARGETS = Object.freeze({
    'idea:note': Object.freeze({
        detailPath: (id) => `/notes/${id}`,
        detailKey: 'note',
        setKey: 'ideas',
        linkPath: (id) => `/notes/${id}/ideas`,
        idsKey: 'ideaIds',
    }),
    'topic:idea': Object.freeze({
        detailPath: (id) => `/ideas/${id}`,
        detailKey: 'idea',
        setKey: 'topics',
        linkPath: (id) => `/ideas/${id}/topics`,
        idsKey: 'topicIds',
    }),
    'topic:note': Object.freeze({
        detailPath: (id) => `/notes/${id}`,
        detailKey: 'note',
        setKey: 'topics',
        linkPath: (id) => `/notes/${id}/topics`,
        idsKey: 'topicIds',
    }),
});

const isItem = (item) =>
    Boolean(item) && typeof item.itemType === 'string' && Number.isInteger(item.itemId);

/**
 * evaluateLink's pairs -> one write per set-owning item.
 *
 * The pairs arrive child-major — every partner for one owner adjacent — so an
 * owner named three times is three appends to one set and must be one PUT, not
 * three that each overwrite the last. Grouping is what makes that true.
 *
 * Validated again here rather than trusted: these are ids from a selection the
 * reader made, and the writes are full-set replacements against their corpus.
 * The hints are linkRules' own, so a refusal reads the same wherever it
 * surfaces.
 *
 * @returns { error } or { groups: [{ target, itemType, itemId, partnerIds }] }
 */
export const groupPairs = (pairs) => {
    if (!Array.isArray(pairs) || pairs.length === 0) return { error: LINK_HINTS.empty };

    const groups = new Map();

    for (const pair of pairs) {
        if (!Array.isArray(pair) || pair.length !== 2) return { error: LINK_HINTS.unknownType };

        const [partner, owner] = pair;
        if (!isItem(partner) || !isItem(owner)) return { error: LINK_HINTS.unknownType };

        // An unknown key is any pair that is not a real downward edge —
        // including an upward one, which is why there is no separate check for
        // that direction.
        const targetKey = `${partner.itemType}:${owner.itemType}`;
        const target = LINK_TARGETS[targetKey];
        if (!target) return { error: LINK_HINTS.unknownType };

        // The set, not just the item: one note has an idea set and a topic set,
        // and they are two writes to two endpoints.
        const key = `${targetKey}#${owner.itemId}`;
        const group = groups.get(key);

        groups.set(key, group
            ? { ...group, partnerIds: [...new Set([...group.partnerIds, partner.itemId])] }
            : { target, itemType: owner.itemType, itemId: owner.itemId, partnerIds: [partner.itemId] });
    }

    return { groups: [...groups.values()] };
};

// The owner's current set, read back before it is replaced. The endpoint takes
// the whole membership, so appending means knowing what is already there.
const readSet = async ({ target, itemId }) => {
    const payload = await fetchJson(target.detailPath(itemId));
    const item = payload[target.detailKey] || {};

    return {
        title: item.title || '',
        ids: (item[target.setKey] || []).map(row => row.id),
    };
};

// Appends and writes back, or does nothing when the pair is already linked.
// Append is what makes a re-link idempotent; skipping the PUT when it adds
// nothing keeps a redundant Link press from being a write at all.
//
// @returns whether anything was actually sent
const writeSet = async ({ target, itemId, partnerIds }, current) => {
    const added = partnerIds.filter(id => !current.includes(id));
    if (added.length === 0) return false;

    await fetchJson(target.linkPath(itemId), {
        method: 'PUT',
        body: { [target.idsKey]: [...current, ...added] },
    });

    return true;
};

// A failed link names the thing that failed — by title when the read got far
// enough to learn it, and by id when it did not.
const labelFor = ({ itemType, itemId }, title) =>
    `${itemType} ${title ? `"${title}"` : `#${itemId}`}`;

// Said out loud because the links before the failure are real and stay: the
// reader has to be told the run stopped part-way, not just that something
// broke, or they will press Link again and wonder why nothing changed.
const linkFailureMessage = (group, title, done, total, err) => {
    const label = labelFor(group, title);

    return done === 0
        ? `Could not link the ${label}. ${err.message}`
        : `Linked ${done} of ${total}, then could not link the ${label}. ${err.message}`;
};

// Passages arrive as one flat list for the whole idea, each carrying the
// `noteId` it belongs to. Grouped in one pass here rather than filtered per
// note, which would be a scan of the list for every card on the ring.
const groupByNoteId = (passages) => passages.reduce((byNoteId, passage) => ({
    ...byNoteId,
    [passage.noteId]: [...(byNoteId[passage.noteId] || []), passage],
}), {});

const loadNotesForIdea = async (ideaId, signal) => {
    if (ideaId === null) return [];

    const payload = await fetchJson(`/ideas/${ideaId}`, { signal });
    const rows = (payload.idea && payload.idea.notes) || [];

    // Fetched in the order the idea listed them, which is their sort_order —
    // the orbit's ring order is the stored one (see the spec's out-of-scope
    // list), so it must survive the second round trip. The passages go out
    // alongside the bodies rather than after them: neither read depends on the
    // other, and the ring should not open a beat later than it has to.
    const [details, passagePayload] = await Promise.all([
        Promise.all(rows.map(row => fetchJson(`/notes/${row.id}`, { signal }))),
        fetchJson(`/ideas/${ideaId}/passages`, { signal }),
    ]);

    const passagesByNoteId = groupByNoteId(passagePayload.passages || []);

    return details.map(detail => ({
        ...detail.note,
        passages: passagesByNoteId[detail.note.id] || [],
    }));
};

const loadThoughts = async (ideaId, signal) => {
    const [topicsPayload, ideasPayload, notes] = await Promise.all([
        fetchJson(TOPICS_PATH, { signal }),
        fetchJson(IDEAS_PATH, { signal }),
        loadNotesForIdea(ideaId, signal),
    ]);

    return {
        topics: topicsPayload.topics || [],
        ideas: ideasPayload.ideas || [],
        notes,
    };
};

const EMPTY = Object.freeze({ topics: [], ideas: [], notes: [] });

/**
 * @param ideaId the idea whose notes to load, or null in the topics view
 */
const useThoughtsData = (ideaId = null) => {
    const [data, setData] = useState(EMPTY);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionError, setActionError] = useState('');
    const [revision, setRevision] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        setIsLoading(true);

        loadThoughts(ideaId, controller.signal)
            .then(loaded => {
                setData(loaded);
                setError('');
            })
            .catch(err => {
                if (err.name === 'AbortError') return;
                setData(EMPTY);
                setError(err.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            });

        return () => controller.abort();
    }, [ideaId, revision]);

    // Every single-request mutation is the same shape: run it, surface any
    // failure as a message the page can show, and on success bump the revision
    // so the whole picture reloads rather than being patched by hand.
    const run = useCallback(async (operation) => {
        try {
            const result = await operation();
            setActionError('');
            setRevision(previous => previous + 1);
            return result;
        } catch (err) {
            setActionError(err.message);
            return null;
        }
    }, []);

    const createTopic = useCallback((body = {}) => run(
        () => fetchJson(TOPICS_PATH, { method: 'POST', body }).then(payload => payload.topic)
    ), [run]);

    const createIdea = useCallback((body = {}) => run(
        () => fetchJson(IDEAS_PATH, { method: 'POST', body }).then(payload => payload.idea)
    ), [run]);

    const updateTopic = useCallback((topicId, changes) => run(
        () => fetchJson(`/topics/${topicId}`, { method: 'PATCH', body: changes })
            .then(payload => payload.topic)
    ), [run]);

    const updateIdea = useCallback((updatedIdeaId, changes) => run(
        () => fetchJson(`/ideas/${updatedIdeaId}`, { method: 'PATCH', body: changes })
            .then(payload => payload.idea)
    ), [run]);

    const updateNote = useCallback((noteId, changes) => run(
        () => fetchJson(`/notes/${noteId}`, { method: 'PATCH', body: changes })
            .then(payload => payload.note)
    ), [run]);

    const removeTopic = useCallback((topicId) => run(
        () => fetchJson(`/topics/${topicId}`, { method: 'DELETE' }).then(() => true)
    ), [run]);

    const removeIdea = useCallback((removedIdeaId) => run(
        () => fetchJson(`/ideas/${removedIdeaId}`, { method: 'DELETE' }).then(() => true)
    ), [run]);

    const removeNote = useCallback((noteId) => run(
        () => fetchJson(`/notes/${noteId}`, { method: 'DELETE' }).then(() => true)
    ), [run]);

    /**
     * The panel's Link action: evaluateLink's pairs, written.
     *
     * Not built on `run`, and that is the whole point of it being here. The
     * writes are sequential and independent, so a failure half way through is
     * not a failed operation to be reported and forgotten — the links already
     * written are real, they are in the database, and the page must reload to
     * show them even though the reader is also being shown an error. `run`'s
     * all-or-nothing shape (error, no revision bump) would leave the canvas
     * denying edges that exist.
     *
     * Sequential rather than parallel because two selected notes can share an
     * idea and the writes are full-set replacements: interleaved reads would
     * each miss what the other added.
     *
     * @returns how many sets were rewritten, or null if the run stopped early
     */
    const linkPairs = useCallback(async (pairs) => {
        const grouped = groupPairs(pairs);
        if (grouped.error) {
            setActionError(grouped.error);
            return null;
        }

        const { groups } = grouped;
        let done = 0;
        let written = 0;
        let failure = null;

        for (const group of groups) {
            let title = null;
            try {
                const set = await readSet(group);
                title = set.title;
                if (await writeSet(group, set.ids)) {
                    written += 1;
                }
                done += 1;
            } catch (err) {
                failure = linkFailureMessage(group, title, done, groups.length, err);
                break;
            }
        }

        if (written > 0) {
            setRevision(previous => previous + 1);
        }
        setActionError(failure || '');

        return failure === null ? written : null;
    }, []);

    const dismissActionError = useCallback(() => setActionError(''), []);

    return {
        topics: data.topics,
        ideas: data.ideas,
        notes: data.notes,
        isLoading,
        error,
        actionError,
        dismissActionError,
        revision,
        createTopic,
        createIdea,
        updateTopic,
        updateIdea,
        updateNote,
        removeTopic,
        removeIdea,
        removeNote,
        linkPairs,
    };
};

export default useThoughtsData;
