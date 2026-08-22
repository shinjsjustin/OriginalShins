import React, { useEffect, useRef } from 'react';
import './Bubbles.css';

// A full-screen shell for a field of bubbles to float in.
//
// ── Why not Analyze's Modal ────────────────────────────────────────────────
//
// The dismissal is the same dance and is copied from it deliberately: Escape,
// a click on the backdrop, and clicks inside that do not bubble up to it. What
// differs is everything the reader sees. Modal.js puts a white card in the
// middle of the dim and pours its children into it, and a card is exactly what
// a field of bubbles must not be given — the field measures the box it is
// rendered in and lays its cards out across the whole of it, so a centred
// panel would squeeze thirty topics into a dialog's worth of canvas. This one
// is edge to edge and paints nothing of its own, so the bubbles are the only
// thing on screen and read as floating over the page they came from.
//
// The backdrop is blurred as well as dimmed for the same reason: with no card
// to sit on, the cards' own edges are all that separates them from the page
// behind, and a page merely dimmed still shows its columns of text through the
// gaps. Blur turns it into a ground.
//
// ── Focus ──────────────────────────────────────────────────────────────────
//
// Focus is moved onto the overlay when it opens, because a dialog that leaves
// focus behind it is a dialog a keyboard is not in: Escape would go to
// whatever was focused before, and Tab would walk the page under the blur. On
// close it goes back to the element that was focused when the overlay opened,
// which is nearly always the control that opened it — the reader ends up where
// they were rather than at the top of the document.

/**
 * @param label     the dialog's accessible name; it has no visible heading of
 *                  its own, so this is the only name it has
 * @param onClose   what Escape and a backdrop click do
 * @param children  the field, drawn edge to edge over the blur
 */
const BubbleOverlay = ({ label, onClose, children }) => {
    const surfaceRef = useRef(null);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Read on the way in and restored on the way out. The cleanup runs on
    // unmount, which for this component is the close, so the two halves of the
    // trip are one effect that runs once.
    useEffect(() => {
        const openedFrom = document.activeElement;

        if (surfaceRef.current) surfaceRef.current.focus();

        return () => {
            if (openedFrom && typeof openedFrom.focus === 'function') openedFrom.focus();
        };
    }, []);

    return (
        <div
            className="bubble-overlay-backdrop"
            onClick={onClose}
            role="presentation"
        >
            <div
                className="bubble-overlay-surface"
                role="dialog"
                aria-modal="true"
                aria-label={label}
                // Focusable but not a tab stop: -1 is what lets the effect
                // above move focus here without adding a stop of its own to
                // the order the reader tabs through.
                tabIndex={-1}
                ref={surfaceRef}
                // The backdrop closes on click; without this every click on a
                // bubble would bubble up and close it too.
                onClick={event => event.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );
};

export default BubbleOverlay;
