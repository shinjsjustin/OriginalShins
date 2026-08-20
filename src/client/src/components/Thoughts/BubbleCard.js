import React, { useState } from 'react';

// One card on the Thoughts canvas: a topic, an idea, a note, or the unfiled
// pseudo-bubble. Every card on this page is this component.
//
// ── Why one component and not four ─────────────────────────────────────────
//
// The three tiers differ in what they say and how they are coloured, and in
// nothing else. They are the same box at the same radius, they are positioned
// the same way — absolutely, from a layout function, in canvas coordinates —
// and every one of them carries the same pin toggle in the same corner, which
// the spec asks for by name. Four components would be four copies of the pin
// and four chances for the corner to drift; `kind` is a class name, and the
// differences live in CSS where they are one rule each.
//
// ── Rounded rectangles ─────────────────────────────────────────────────────
//
// "Bubble" is the metaphor, not the shape. These cards carry a phrase and a
// count, and a circle wastes its corners on a card whose content is a line of
// text — a title inside a circle either wraps at four words or overflows it.
// The radius is generous enough that the field still reads as a cluster of
// bubbles rather than a table.
//
// ── The pin appears, rather than being always drawn ────────────────────────
//
// A pin on every card at all times is thirty pins on a field of thirty topics,
// and the field is meant to read as topics. So the toggle is mounted when the
// card is under the cursor, when it holds focus, or when the item is already
// pinned — the third being the marker the spec asks to stay visible, and the
// second being the reason a keyboard can reach a control that a mouse reveals.
//
// It is mounted and unmounted rather than faded with opacity, because a
// zero-opacity button is still a button: it is in the tab order, it is in the
// accessibility tree, and a screen reader would read out a pin toggle for
// every card on the canvas. "On hover" has to mean it is not there yet.

export const PIN_MARKER = '📌';

// What the pin's label calls a card nobody titled. The button is the one place
// the title is spoken rather than read, and "Pin " with nothing after it names
// nothing at all.
export const UNTITLED_CARD_LABEL = 'this card';

/**
 * The accessible name of the pin toggle.
 *
 * It carries the card's own title because the page can show a dozen of these
 * at once, and a list of twelve buttons all called "Pin" is a list of twelve
 * buttons that cannot be told apart.
 */
export const pinLabelFor = (title, isPinned) =>
    `${isPinned ? 'Unpin' : 'Pin'} ${title || UNTITLED_CARD_LABEL}`;

/**
 * One card.
 *
 * @param kind        'topic' | 'idea' | 'note' | 'unfiled' — styling only
 * @param title       the card's line of text; the pin's label uses it too
 * @param subtitle    the quieter second line, if the card has one
 * @param body        a node to put under the title instead of a subtitle, for
 *                    a card whose second half is not a line of text — the idea
 *                    at the centre of the orbit renders its markdown body here.
 *                    A card given one must not also be given `onActivate`: the
 *                    face is a button when it activates, and rendered markdown
 *                    inside a button is markup no browser agrees on
 * @param position    { x, y, width, height } from a layout function, in the
 *                    coordinates of whatever this card is rendered inside
 * @param scale       how big this card is relative to its full size, which is
 *                    what its text sizes itself from — the box comes from
 *                    `position`, already scaled, so this must not resize it
 * @param isSelected  the card the reader is on: the spotlight's centre
 * @param isFaded     a card the spotlight has left behind
 * @param isPinned    whether the item is in the pinned set
 * @param onActivate  what clicking the card's face does; without it the face
 *                    is not a button, because a control that does nothing is
 *                    worse than no control
 * @param onTogglePin without it no pin is drawn at all
 * @param children    anything that belongs inside this card's box — the fan's
 *                    overflow chip is drawn this way
 */
const BubbleCard = ({
    kind = 'idea',
    title = '',
    subtitle = '',
    body = null,
    position,
    scale = 1,
    isSelected = false,
    isFaded = false,
    isPinned = false,
    onActivate = null,
    onTogglePin = null,
    className = '',
    style = null,
    children = null,
}) => {
    const [isPointerOver, setIsPointerOver] = useState(false);
    const [hasFocus, setHasFocus] = useState(false);

    const showPin = Boolean(onTogglePin) && (isPointerOver || hasFocus || isPinned);

    const classes = [
        'thoughts-bubble',
        `thoughts-bubble--${kind}`,
        isSelected ? 'is-selected' : '',
        isFaded ? 'is-faded' : '',
        isPinned ? 'is-pinned' : '',
        className,
    ].filter(Boolean).join(' ');

    // The box is inline because it is data — it changes with the canvas size
    // and with which topic is open, and there is no stylesheet that could
    // know it. Everything a stylesheet CAN know stays in Thoughts.css.
    const boxStyle = {
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${position.width}px`,
        height: `${position.height}px`,
        '--bubble-scale': scale,
        ...style,
    };

    // Written once and rendered into whichever element the face turns out to
    // be, so the two branches below cannot drift apart.
    const faceContent = (
        <>
            <span className="thoughts-bubble-title">{title}</span>
            {body || (subtitle
                ? <span className="thoughts-bubble-subtitle">{subtitle}</span>
                : null)}
        </>
    );

    // onFocus and onBlur rather than :focus-within, because the pin has to be
    // MOUNTED by the time focus reaches the card — a CSS rule can only reveal
    // an element that is already there. React's focus events bubble, so this
    // catches focus landing on the face or on the pin itself.
    //
    // The blur is filtered on where focus went, and that filter is load-
    // bearing: tabbing from the face to the pin blurs the face first, and an
    // unconditional handler would unmount the pin in the instant between the
    // two events — leaving the keyboard with a control it can see and never
    // reach. Enter/leave are used for the pointer for the same reason: they
    // are the pair that ignores moves between a card's own children.
    return (
        <div
            className={classes}
            style={boxStyle}
            onMouseEnter={() => setIsPointerOver(true)}
            onMouseLeave={() => setIsPointerOver(false)}
            onFocus={() => setHasFocus(true)}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setHasFocus(false);
            }}
        >
            {onActivate ? (
                <button type="button" className="thoughts-bubble-face" onClick={onActivate}>
                    {faceContent}
                </button>
            ) : (
                <div className="thoughts-bubble-face">{faceContent}</div>
            )}

            {/* A sibling of the face, never a child of it: the face is a
                button whenever it does anything, and a button inside a button
                is markup no browser agrees on. */}
            {showPin && (
                <button
                    type="button"
                    className="thoughts-bubble-pin"
                    aria-pressed={isPinned}
                    aria-label={pinLabelFor(title, isPinned)}
                    onClick={onTogglePin}
                >
                    <span aria-hidden="true">{PIN_MARKER}</span>
                </button>
            )}

            {children}
        </div>
    );
};

export default BubbleCard;
