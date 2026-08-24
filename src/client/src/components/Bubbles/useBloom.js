import { useCallback, useEffect, useState } from 'react';

// Which card on a canvas is blooming, and why that is one hook rather than two
// copies of three `useState`s.
//
// Both canvases on the Thoughts page open a card into a fan of the tier below
// it: a topic into its ideas, a note into the passages it is anchored to. The
// content differs completely and the interaction does not — hover to open,
// click to hold open, Esc to let go, a chip for the overflow — so the state
// behind that interaction lives here and both canvases read it.
//
// ── Why a lock, on top of the hover ────────────────────────────────────────
//
// Hovering is enough to READ a fan and not enough to REACH one of its cards.
// The petals sit on an arc wide enough to overlap their neighbours, and those
// neighbours paint above the open cluster's empty region by design (see
// Thoughts.css), so the cursor's trip out to a petal crosses cards belonging to
// other clusters. Clicking the anchor locks its fan open so that trip can be
// made, and while the lock is held no amount of hovering elsewhere disturbs it.
//
// `hoveredId` is still tracked underneath while a lock is held, so releasing
// the lock hands the spotlight to whatever the cursor is actually on rather
// than closing everything.

/**
 * @returns {
 *   isActive, isFaded, isExpanded  // (id) -> boolean, for one card
 *   onEnter, onLeave,              // (id) -> void, for the cluster region
 *   onAnchorClick, onChipClick,    // (id) -> void, for the two controls
 *   reset,                         // let everything go — a new subject arrived
 * }
 */
const useBloom = () => {
    const [hoveredId, setHoveredId] = useState(null);
    const [lockedId, setLockedId] = useState(null);
    const [expandedId, setExpandedId] = useState(null);

    // A lock outranks the pointer: that is what "locks the fan open" means.
    const activeId = lockedId !== null ? lockedId : hoveredId;

    // A hover is recorded whatever else is going on, but it does not touch the
    // lock. It used to: hovering another anchor was a third way to unlock,
    // alongside a second click and Esc — and it defeated the lock's whole
    // purpose, because the journey out to a petal crosses other cards. Ending
    // it is now a deliberate act and nothing else.
    const onEnter = useCallback((id) => {
        setHoveredId(id);
    }, []);

    const onLeave = useCallback((id) => {
        setHoveredId(hovered => (hovered === id ? null : hovered));
    }, []);

    // Click to stick, click again to unstick — and clicking a different anchor
    // moves the lock rather than adding a second one, so there is never more
    // than one fan held open.
    const onAnchorClick = useCallback((id) => {
        setLockedId(locked => (locked === id ? null : id));
    }, []);

    const onChipClick = useCallback((id) => {
        setExpandedId(expanded => (expanded === id ? null : id));
    }, []);

    const reset = useCallback(() => {
        setHoveredId(null);
        setLockedId(null);
        setExpandedId(null);
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

    return {
        isActive: useCallback((id) => activeId === id, [activeId]),
        // Near-invisible rather than gone, so the canvas keeps its shape while
        // one card is lit — see .thoughts-bubble.is-faded.
        isFaded: useCallback((id) => activeId !== null && activeId !== id, [activeId]),
        // Only ever true for the card that is also active: an expanded chip on
        // a closed cluster would be a second arc drawn under nothing.
        isExpanded: useCallback(
            (id) => expandedId === id && activeId === id,
            [expandedId, activeId]
        ),
        onEnter,
        onLeave,
        onAnchorClick,
        onChipClick,
        reset,
    };
};

export default useBloom;
