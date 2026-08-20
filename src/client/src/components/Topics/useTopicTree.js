import { useCallback, useEffect, useRef, useState } from 'react';
import {
    TOPIC,
    ROOT_KEY,
    childNodesOf,
    destinationFor,
    moveWithin,
    topicNode,
} from './treeModel';
import { fetchChildren, fetchTopics, moveNode, reorderChildren, reorderTopics } from './treeApi';
import useTreeFocus from './useTreeFocus';

// The tree's state: what is loaded, what is open, and what a drop does to it.
//
// Unlike Library/useCollection, which holds one list, this holds a branch per
// expanded row — keyed by the row's path, since the same idea under two topics
// is two rows that open and close independently.

export const LOADING = 'loading';
export const READY = 'ready';
export const FAILED = 'failed';

const EMPTY_BRANCH = { status: LOADING, items: [], error: '' };

const useTopicTree = () => {
    const [topics, setTopics] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionError, setActionError] = useState('');

    // key -> { status, items, error }. `items` are rows, already shaped.
    const [branches, setBranches] = useState({});
    // key -> the row itself, for every open row. The row is kept, not just its
    // key, because reloading a branch needs the node that knows what to fetch.
    const [expanded, setExpanded] = useState({});

    // A refresh has to reload whatever is open at the moment it runs, and it is
    // called from event handlers that closed over an older render. The refs are
    // the current values; the state is what renders.
    const expandedRef = useRef(expanded);
    useEffect(() => { expandedRef.current = expanded; }, [expanded]);

    const branchesRef = useRef(branches);
    useEffect(() => { branchesRef.current = branches; }, [branches]);

    const loadRoot = useCallback(async (signal) => {
        setIsLoading(true);
        try {
            const loaded = await fetchTopics({ signal });
            setTopics(loaded);
            setError('');
        } catch (err) {
            if (err.name === 'AbortError') return;
            setTopics([]);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        loadRoot(controller.signal);
        return () => controller.abort();
    }, [loadRoot]);

    // Loads one branch, keeping whatever it already held on screen while the
    // request is in flight — a reload after a drop must not blank the list the
    // reader is looking at.
    const loadBranch = useCallback(async (node) => {
        setBranches(previous => ({
            ...previous,
            [node.key]: {
                ...(previous[node.key] || EMPTY_BRANCH),
                status: LOADING,
                error: '',
            },
        }));

        try {
            const items = await fetchChildren(node);
            setBranches(previous => ({
                ...previous,
                [node.key]: { status: READY, items: childNodesOf(node, items), error: '' },
            }));
        } catch (err) {
            setBranches(previous => ({
                ...previous,
                [node.key]: { status: FAILED, items: [], error: err.message },
            }));
        }
    }, []);

    // Reloads the root and every open branch.
    //
    // Deliberately not a surgical patch of the two branches a drop touched. A
    // single move changes rows the response never mentions — a topic's idea and
    // note counts, an idea's note count, both unfiled buckets — and only the
    // server can be right about those. It is the same reasoning behind
    // useCollection's refetch-don't-guess rule, with more rows to be wrong
    // about; at the plan's scale a handful of open branches is a cheap reload.
    const refresh = useCallback(async () => {
        const open = Object.values(expandedRef.current);
        await Promise.all([loadRoot(), ...open.map(loadBranch)]);
    }, [loadRoot, loadBranch]);

    // Opening is its own callback rather than half of toggle: a link arriving
    // with a row to focus has to open it whether or not it is already open, and
    // "toggle it unless it is open" is a different thing said twice.
    const expand = useCallback((node) => {
        if (expandedRef.current[node.key]) {
            return;
        }

        setExpanded(previous => ({ ...previous, [node.key]: node }));

        // Cached children are shown straight away; a branch opened for the
        // first time, or one whose last load failed, is fetched now.
        const branch = branchesRef.current[node.key];
        if (!branch || branch.status === FAILED) {
            loadBranch(node);
        }
    }, [loadBranch]);

    const collapse = useCallback((node) => {
        setExpanded(previous => {
            const { [node.key]: closed, ...rest } = previous;
            return rest;
        });
    }, []);

    const toggle = useCallback((node) => {
        const isOpen = Boolean(expandedRef.current[node.key]);
        return isOpen ? collapse(node) : expand(node);
    }, [collapse, expand]);

    // Every write runs the same way: perform it, then reload. The reload also
    // happens on failure — a refused drop means the tree is showing a move the
    // server did not make, and a 409 in particular means this client's copy of
    // some branch has fallen behind.
    const runMutation = useCallback(async (operation) => {
        try {
            await operation();
            setActionError('');
            await refresh();
            return true;
        } catch (err) {
            setActionError(err.message);
            await refresh();
            return false;
        }
    }, [refresh]);

    // Resolves one drop into exactly one of the three writes.
    const handleDrop = useCallback((dragged, target) => {
        const destination = destinationFor(dragged, target);
        if (!destination) {
            return false;
        }

        // A topic has no link row above it, so its position is its own
        // sort_order and the whole root list is sent.
        if (dragged.kind === TOPIC) {
            const ordered = moveWithin(
                topics.map(topic => topic.id),
                dragged.index,
                destination.position
            );
            return runMutation(() => reorderTopics(ordered));
        }

        // Dropped among its own siblings: nothing changes parents, so this is an
        // ordering of one container rather than a move.
        const isSameContainer = destination.containerId === dragged.containerId;
        const isPlaced = destination.position !== null;

        if (isSameContainer && isPlaced && destination.containerId !== null) {
            const siblings = (branchesRef.current[dragged.containerKey] || EMPTY_BRANCH).items;
            const ordered = moveWithin(
                siblings.map(sibling => sibling.id),
                dragged.index,
                destination.position
            );
            return runMutation(
                () => reorderChildren(dragged.kind, destination.containerId, ordered)
            );
        }

        return runMutation(() => moveNode(dragged, destination));
    }, [topics, runMutation]);

    const dismissActionError = useCallback(() => setActionError(''), []);

    // Named rather than built inline in the return, because the focus hook
    // below reads both: it finds a topic among the root rows and an idea among
    // the rows of whatever branch holds it.
    const rootNodes = topics.map(topicNode);
    const branchFor = useCallback((key) => branches[key] || null, [branches]);

    // A link may name a row to bring into view (/topics-tree?topic=3&idea=7).
    // It lives here rather than in the page so that a row can ask the tree
    // whether it is the focused one, the same way it asks whether it is open.
    const focusedKey = useTreeFocus({ rootNodes, branchFor, expand });

    return {
        rootKey: ROOT_KEY,
        rootNodes,
        isLoading,
        error,
        actionError,
        dismissActionError,
        branchFor,
        isExpanded: (key) => Boolean(expanded[key]),
        isFocused: (key) => focusedKey !== null && key === focusedKey,
        toggle,
        handleDrop,
    };
};

export default useTopicTree;
