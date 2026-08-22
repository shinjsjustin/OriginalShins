// The three box sums both canvases do: where a box's middle is, where one box
// sits inside another, and the vector that collapses a card onto something.
//
// ── Why the collapse vector is a custom property ───────────────────────────
//
// Neither view mounts its cards when they open. The fan is mounted closed on
// every topic on the field, and the orbit's notes are mounted with the orbit,
// because a CSS transition can only animate from a state that was actually
// rendered — a card that appears at its final position has nothing to move
// from. So a closed card is drawn at its final coordinates and then translated
// back onto whatever it belongs to, and `--card-dx/--card-dy` is that
// translation. Opening is the stylesheet dropping it.
//
// The names are shared on purpose: the fan and the orbit collapse onto
// different things (a topic card, the centred idea) but the movement is the
// same movement, and two spellings of it would be two rules in Thoughts.css
// that have to be kept in step by hand.

/** The middle of a { x, y, width, height } box. */
export const centreOf = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/** The box `inner` occupies inside `outer`, both given in the same coordinates. */
export const relativeTo = (outer, inner) => ({
    x: inner.x - outer.x,
    y: inner.y - outer.y,
    width: inner.width,
    height: inner.height,
});

/**
 * The custom properties that put `box` on top of `target` while it is closed.
 *
 * @param target the point the card collapses onto, in the card's coordinates
 * @param box    where the card is drawn when it is open
 */
export const collapseOnto = (target, box) => {
    const from = centreOf(box);

    return {
        '--card-dx': `${target.x - from.x}px`,
        '--card-dy': `${target.y - from.y}px`,
    };
};
