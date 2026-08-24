import React from 'react';
import { centreOf, collapseOnto, relativeTo } from './cardGeometry';

// One anchor card, the fan it opens, and the region that holds the two
// together. The topics field blooms a topic into its ideas with this; the idea
// orbit blooms a note into its passages with the same component.
//
// ── The cluster is the hover target, not the card ──────────────────────────
//
// The fan opens at a radius well clear of the anchor, which means the reader's
// cursor has to cross a stretch of empty canvas to reach the card it is aiming
// at. If the hover lived on the anchor card, the fan would close halfway
// through that journey and the cards would be unreachable — the layout would be
// drawing a menu that nothing can select from.
//
// So an anchor, its fan, and the gaps between them are ONE element with ONE
// pair of enter/leave handlers. At rest that element is exactly the anchor's
// card, so resting clusters do not overlap each other and empty canvas opens
// nothing. On activation it grows to the bounding box of everything the cluster
// is currently drawing, and the gaps become part of the target. That is the
// whole trick, and it is why there are no per-card hover handlers here.
//
// ── Why the grown cluster does not trap the cursor ─────────────────────────
//
// An open cluster's box is wide enough to cover its neighbours, and a hit
// region sitting on top of a neighbour is a card the reader can no longer
// reach. The fix is stacking order rather than geometry: the cluster element
// takes no `z-index`, so it does not create a stacking context and does not
// paint above anything; the cards inside it declare their own, and they land in
// the canvas's stacking context alongside every other card. Nothing on the
// cluster element may ever set `transform`, `opacity`, `filter` or
// `will-change` — any of those would make it a stacking context and put the
// dead zone back. See the matching note in Thoughts.css.
//
// ── Why the caller draws the cards ─────────────────────────────────────────
//
// The two canvases agree completely about the SHAPE of a bloom and not at all
// about what is in it: a topic's petals are idea cards that open the idea view,
// a note's are passages of scripture that open nothing. So this component owns
// the region, the bounds, the collapse vectors and the chip, and hands each
// card back the props that place it — the caller supplies the card itself.

// How much later each card leaves the anchor than the one before it. Small on
// purpose: enough that the fan sweeps rather than appears, short enough that
// the last card of fifteen is not a quarter-second behind the first.
export const FAN_STAGGER_MS = 16;

/**
 * The cluster's hit region: its anchor card at rest, everything it is drawing
 * when it is open.
 *
 * Row-1 cards are counted only once the chip has been pressed, because until
 * then they are sitting under the chip — a region stretched to where they will
 * eventually be would be a large piece of empty canvas that keeps the fan open.
 */
export const boundsFor = (anchorBox, fan, isActive, isExpanded) => {
    if (!isActive) return anchorBox;

    const boxes = [anchorBox, ...fan.cards.filter(card => card.row === 0 || isExpanded)];
    if (fan.overflow) boxes.push(fan.overflow);

    const left = Math.min(...boxes.map(box => box.x));
    const top = Math.min(...boxes.map(box => box.y));
    const right = Math.max(...boxes.map(box => box.x + box.width));
    const bottom = Math.max(...boxes.map(box => box.y + box.height));

    return { x: left, y: top, width: right - left, height: bottom - top };
};

/**
 * @param anchorBox    the anchor card's box, in canvas coordinates
 * @param fan          buildFan's output for this anchor
 * @param isActive     whether this cluster is the one lit
 * @param isExpanded   whether its `+N more` chip has been pressed
 * @param onEnter      the pointer arrived on the region
 * @param onLeave      and left it
 * @param onChipClick  the chip was pressed; omit it and no chip is drawn even
 *                     when the fan asks for one
 * @param renderAnchor (position) -> the anchor card, positioned inside the region
 * @param renderPetal  (card, props) -> one fanned card. `props` carries
 *                     position, scale, className and style, all ready to spread
 *                     onto a BubbleCard; the caller supplies the key
 * @param className    anything the caller wants on the region itself, subject
 *                     to the stacking-context rule above
 */
const BloomCluster = ({
    anchorBox,
    fan,
    isActive = false,
    isExpanded = false,
    onEnter = () => {},
    onLeave = () => {},
    onChipClick = null,
    renderAnchor,
    renderPetal,
    className = '',
}) => {
    const bounds = boundsFor(anchorBox, fan, isActive, isExpanded);
    const anchorCentre = centreOf(anchorBox);
    const chipCentre = fan.overflow ? centreOf(fan.overflow) : anchorCentre;

    const classes = [
        'thoughts-cluster',
        isActive ? 'is-active' : '',
        isExpanded ? 'is-expanded' : '',
        className,
    ].filter(Boolean).join(' ');

    return (
        <div
            className={classes}
            style={{
                left: `${bounds.x}px`,
                top: `${bounds.y}px`,
                width: `${bounds.width}px`,
                height: `${bounds.height}px`,
            }}
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
        >
            {renderAnchor(relativeTo(bounds, anchorBox))}

            <div className="thoughts-fan">
                {fan.cards.map(card => {
                    const isStowed = card.row === 1 && !isExpanded;

                    return renderPetal(card, {
                        position: relativeTo(bounds, card),
                        scale: fan.scale,
                        className: `thoughts-fan-item${isStowed ? ' is-stowed' : ''}`,
                        style: {
                            // Closed, every card sits ON its anchor (or under
                            // the chip that stowed it), so opening is one
                            // movement outwards rather than fifteen fades in
                            // place.
                            ...collapseOnto(isStowed ? chipCentre : anchorCentre, card),
                            // Cards nearest the start of the arc leave first,
                            // so the fan reads as one movement out of the
                            // anchor rather than fifteen at once.
                            '--card-delay': `${card.index * FAN_STAGGER_MS}ms`,
                        },
                    });
                })}

                {fan.overflow && onChipClick && (
                    <button
                        type="button"
                        className="thoughts-fan-chip"
                        aria-expanded={isExpanded}
                        style={{
                            left: `${fan.overflow.x - bounds.x}px`,
                            top: `${fan.overflow.y - bounds.y}px`,
                            width: `${fan.overflow.width}px`,
                            height: `${fan.overflow.height}px`,
                            ...collapseOnto(anchorCentre, fan.overflow),
                        }}
                        onClick={onChipClick}
                    >
                        +{fan.overflow.count} more
                    </button>
                )}
            </div>
        </div>
    );
};

export default BloomCluster;
