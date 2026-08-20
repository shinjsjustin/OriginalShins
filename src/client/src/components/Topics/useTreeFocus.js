import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UNFILED_IDEAS_KEY, bucketNodeFor } from './treeModel';
import { focusFromParams } from './treeFocus';

// Brings the row a link asked for into view: opens whatever holds it and
// reports its key, so the row can mark itself.
//
// It is a second, smaller concern than the branch cache next door, so it is its
// own hook rather than another hundred lines in useTopicTree — that one is
// about what is loaded and what a drop does, this one is about one row a URL
// named.
//
// The work is unavoidably two-step. A topic's ideas are lazily loaded, so
// focusing an idea means expanding its topic, waiting for that branch, and only
// then finding the row. This runs as an effect over what has actually arrived
// rather than as a chain of awaits, which is also what makes it correct when
// the branch was already open.
const useTreeFocus = ({ rootNodes, branchFor, expand }) => {
    const [searchParams] = useSearchParams();
    const { topicId, ideaId } = focusFromParams(searchParams);

    // The row holding what we are focusing: the topic named, or the unfiled
    // bucket when an idea was named without one. Focusing a topic alone still
    // opens it — "show me this topic" means its ideas, not just its name.
    const container = useMemo(() => {
        if (topicId !== null) {
            return rootNodes.find(node => node.id === topicId) || null;
        }
        if (ideaId !== null) {
            return bucketNodeFor(UNFILED_IDEAS_KEY);
        }
        return null;
    }, [topicId, ideaId, rootNodes]);

    // Expanded once per container, and never again. Without this the reader
    // could not collapse the row the link opened: every render would reopen it
    // while the params are still in the URL, and they stay there — like
    // Analyze's ?note=, this is an instruction that has been carried out, not
    // state the page maintains.
    const openedKeys = useRef(new Set());

    useEffect(() => {
        if (!container || openedKeys.current.has(container.key)) {
            return;
        }
        openedKeys.current.add(container.key);
        expand(container);
    }, [container, expand]);

    const branch = container ? branchFor(container.key) : null;

    // The idea's row exists only once its container's branch has loaded; until
    // then nothing is focused, which is the honest answer.
    const focusedKey = useMemo(() => {
        if (ideaId !== null) {
            const items = branch ? branch.items : [];
            const row = items.find(item => item.id === ideaId);
            return row ? row.key : null;
        }
        return container ? container.key : null;
    }, [ideaId, branch, container]);

    return focusedKey;
};

export default useTreeFocus;
