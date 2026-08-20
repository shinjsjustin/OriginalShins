import { useCallback, useRef, useState } from 'react';

// Hover and click across all three tiers, delegated to one element and applied
// to the DOM rather than to React state.
//
// ── One listener, not one per arc ──────────────────────────────────────────
//
// Every handler below is attached to the <svg>, and finds what the pointer is
// over by walking up from the event target to the nearest `data-group-id` —
// which TierArcs puts on each chain's group and TierStems on each stem — and
// on again to the `data-rail` of the tier group containing it. The plan asks
// for delegation by name, and the reason is the obvious one: at a few thousand
// groups across three rails, per-element handlers are thousands of closures
// created on every render of components that exist precisely so they never
// re-render.
//
// ── Why a group is (rail, id) and not an id ────────────────────────────────
//
// Note 7, idea 7 and topic 7 are three different things, and with all three
// rails drawn they are three different chains on screen at once. An id alone
// would light one of them and open another. The rail is already on the tier
// group as `data-rail` — it is what colours the tier — so it is read from
// there rather than stamped onto every one of a few thousand elements.
//
// ── Why the highlight is not React state ───────────────────────────────────
//
// Hovering a group highlights all of its arcs and stems and dims everything
// else. Expressed as state, that is a prop change on every arc and every stem
// on the page — a full reconciliation of the drawing per pointer crossing, on
// the same page that goes to some length to avoid one per wheel notch.
//
// So the dimming is CSS. `data-focused` goes on the <svg> and turns every tier
// down; `data-active` goes on the handful of elements belonging to one group
// and turns those back up. Changing the highlight touches only the elements
// that enter or leave it, and the previous set is remembered so that clearing
// it costs no query at all.
//
// Dimming ALL three rails rather than only the hovered one is deliberate: the
// question a lit chain answers is "where does this land, and what else is
// there?", and leaving the other two rails at full strength would drown the
// answer in the thing it is being read against.
//
// React still runs once per hovered group — the tooltip is content, and content
// is React's job — but that commit reaches only the tooltip: TierArcs and
// TierStems are memoised on props that a pointer never changes.
//
// ── Why a click is not simply a click ──────────────────────────────────────
//
// usePanZoom captures the pointer on every pointerdown so a drag that runs off
// the <svg> keeps panning. Capture retargets the events that follow — including
// the click — at the capturing element, so by the time a click arrives its
// target is the <svg> and no longer the arc that was pressed. The press is
// therefore recorded on the way down, where the target is still real, and the
// click consults that instead.
//
// Which also answers the other half: a drag that happens to end over an arc
// must not open it. The press records where it started, and a click that landed
// further than a thumb's wobble from there was a pan.

// How far the pointer may travel between press and release and still count as a
// click rather than a pan. A few pixels of hand tremor on a press is normal.
const CLICK_SLOP_PX = 4;

// The tooltip is placed at the pointer and hangs down and to the right, so it
// needs this much room before the edge of the window or it is pushed back.
const TOOLTIP_CLEARANCE_PX = 340;

/** The (rail, groupId) an element belongs to, or null if it belongs to none. */
const groupFrom = (element) => {
    const node = element && element.closest ? element.closest('[data-group-id]') : null;
    if (!node) return null;

    const groupId = Number(node.getAttribute('data-group-id'));
    if (!Number.isInteger(groupId)) return null;

    const tier = node.closest('[data-rail]');
    const rail = tier ? tier.getAttribute('data-rail') : null;
    if (!rail) return null;

    return { rail, groupId };
};

// Two references to the same group, or two nothings. Compared field by field
// because `groupFrom` builds a fresh object per event, so identity would say
// "different" every time the pointer moved a pixel along one arc.
const isSameGroup = (a, b) =>
    a === b || (!!a && !!b && a.rail === b.rail && a.groupId === b.groupId);

const distanceBetween = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Hover and click over every tier drawn.
 *
 * @param toWorldY  usePanZoom's client-y -> world-y, for resolving where on a
 *                  chain the reader clicked. Optional; without it a click still
 *                  opens the group, at its first reference.
 * @returns { hover, selection, clearSelection, attachSvg, svgHandlers }
 */
const useArcInteraction = ({ toWorldY } = {}) => {
    // What the tooltip shows, and where. Null when the pointer is over nothing.
    const [hover, setHover] = useState(null);
    // What the drawer shows: { rail, groupId, worldY }. Null when it is closed.
    const [selection, setSelection] = useState(null);

    const svgRef = useRef(null);
    // The elements currently carrying data-active, so clearing the highlight is
    // a loop over four or five nodes rather than a query over a few thousand.
    const activeRef = useRef([]);
    const focusedRef = useRef(null);
    const pressRef = useRef(null);
    // Mirrors the selected group for the highlight, which is written outside
    // React and so cannot read state that has not committed yet.
    const selectedRef = useRef(null);

    /** Moves the highlight to `group`, or clears it when given null. */
    const focusGroup = useCallback((group) => {
        if (isSameGroup(focusedRef.current, group)) return;
        focusedRef.current = group;

        activeRef.current.forEach(element => element.removeAttribute('data-active'));
        activeRef.current = [];

        const root = svgRef.current;
        if (!root) return;

        if (group === null) {
            root.removeAttribute('data-focused');
            return;
        }

        // Both the arc group and the group's stems answer to this selector,
        // which is why they carry the same attribute under the same rail in
        // the first place.
        const elements = [...root.querySelectorAll(
            `[data-rail="${group.rail}"] [data-group-id="${group.groupId}"]`
        )];
        elements.forEach(element => element.setAttribute('data-active', ''));

        activeRef.current = elements;
        root.setAttribute('data-focused', '');
    }, []);

    // An open drawer keeps its group lit once the pointer has moved away, so
    // the reader can see what they are reading about. Hover wins while it
    // lasts.
    const applyFocus = useCallback((hovered) => {
        focusGroup(hovered === null ? selectedRef.current : hovered);
    }, [focusGroup]);

    const attachSvg = useCallback((node) => {
        svgRef.current = node;
        if (node) {
            focusedRef.current = null;
            activeRef.current = [];
            applyFocus(null);
        }
    }, [applyFocus]);

    const handlePointerOver = useCallback((event) => {
        const group = groupFrom(event.target);
        applyFocus(group);

        setHover(current => {
            if (group === null) return null;
            if (isSameGroup(current, group)) return current;

            return {
                ...group,
                // Clamped rather than measured: the tooltip is not in the tree
                // yet, so there is nothing to measure, and one comparison is
                // cheaper than a layout read on every hover.
                x: Math.min(event.clientX, window.innerWidth - TOOLTIP_CLEARANCE_PX),
                y: event.clientY,
            };
        });
    }, [applyFocus]);

    const handlePointerLeave = useCallback(() => {
        applyFocus(null);
        setHover(null);
    }, [applyFocus]);

    // Runs alongside usePanZoom's own pointerdown; see the note above on why
    // the press has to be recorded before capture moves the target.
    const handlePointerDown = useCallback((event) => {
        pressRef.current = {
            group: groupFrom(event.target),
            at: { x: event.clientX, y: event.clientY },
        };
    }, []);

    const handleClick = useCallback((event) => {
        const press = pressRef.current;
        pressRef.current = null;

        if (!press || press.group === null) return;
        if (distanceBetween(press.at, { x: event.clientX, y: event.clientY }) > CLICK_SLOP_PX) {
            return;
        }

        selectedRef.current = press.group;
        setSelection({
            ...press.group,
            // Where on the chain the press landed, so the drawer can open at
            // the reference nearest it rather than always at the first.
            worldY: toWorldY ? toWorldY(press.at.y) : null,
        });
    }, [toWorldY]);

    const clearSelection = useCallback(() => {
        selectedRef.current = null;
        setSelection(null);
        applyFocus(null);
    }, [applyFocus]);

    return {
        hover,
        selection,
        clearSelection,
        attachSvg,
        svgHandlers: {
            onPointerOver: handlePointerOver,
            onPointerLeave: handlePointerLeave,
            onPointerDown: handlePointerDown,
            onClick: handleClick,
        },
    };
};

export default useArcInteraction;
