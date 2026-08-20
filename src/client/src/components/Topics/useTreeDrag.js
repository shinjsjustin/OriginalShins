import { useCallback, useState } from 'react';
import { dropIntentFor } from './treeModel';

// Drag and drop for the tree, on the browser's own HTML5 drag events.
//
// ── Why native DnD and not a library ────────────────────────────────────────
//
// @dnd-kit and react-dnd are both well maintained and both solve problems this
// page does not have: dragging between virtualised lists, custom collision
// detection, animated reordering. What is actually needed here is "pick up a
// row, drop it on another row", which is the one gesture HTML5 DnD does well
// out of the box — the browser supplies the drag image, the cursor feedback and
// the autoscroll for free.
//
// Against that: a dependency whose sensors synthesise pointer events, which
// jsdom models poorly, so the drop rules would have to be tested through a
// harness instead of directly. The rules are the part worth testing, and here
// they are already a pure function (treeModel.dropIntentFor) that this hook only
// wires up.
//
// The cost of the choice is real and worth naming: HTML5 DnD is a pointer
// gesture with no keyboard equivalent, so filing by drag is mouse-only. Nothing
// is *only* reachable that way — an idea's topics and a note's ideas are both
// still editable from the multi-selects on /ideas and in the note editor — but
// ordering currently is, and a keyboard affordance is the first thing to add
// here if this page grows.
const useTreeDrag = ({ onDrop }) => {
    const [dragged, setDragged] = useState(null);
    const [dropTargetKey, setDropTargetKey] = useState(null);

    const end = useCallback(() => {
        setDragged(null);
        setDropTargetKey(null);
    }, []);

    // The handlers for one row. Built per row rather than read off the event
    // target, so a handler always has the row it belongs to and never has to
    // find it again from the DOM.
    const handlersFor = useCallback((node) => ({
        draggable: true,

        onDragStart: (event) => {
            setDragged(node);
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
                // Firefox refuses to start a drag unless some data is set. The
                // key is what goes in, but nothing reads it back: the dragged
                // row is held in state, where it is an object rather than a
                // string that would have to be resolved again on every dragover.
                event.dataTransfer.setData('text/plain', node.key);
            }
        },

        onDragEnd: end,

        onDragOver: (event) => {
            if (dropIntentFor(dragged, node) === null) {
                return;
            }
            // preventDefault is what marks this row as a drop target at all; a
            // row the drop rules refuse simply never calls it, so the browser
            // shows the "no drop" cursor without any styling of ours.
            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'move';
            }
            setDropTargetKey(node.key);
        },

        onDragLeave: () => {
            setDropTargetKey(current => (current === node.key ? null : current));
        },

        onDrop: (event) => {
            event.preventDefault();
            const source = dragged;
            end();
            if (source) {
                onDrop(source, node);
            }
        },
    }), [dragged, end, onDrop]);

    return {
        draggedKey: dragged ? dragged.key : null,
        dropTargetKey,
        handlersFor,
    };
};

export default useTreeDrag;
