// Pointer capture, for the two drags this page has.
//
// Capture keeps the moves coming once the cursor has left the <svg>, so a drag
// that runs off the edge keeps working instead of stopping dead. It is an
// improvement to a drag, not a precondition for one — and every one of these
// methods throws NotFoundError whenever the pointer is no longer active by the
// time the handler runs, which a fast click and a synthetic event both manage.
// Letting that through would put an exception into the middle of a started
// drag over something the reader would not have noticed either way.
//
// Shared rather than written twice: usePanZoom (drag to pan) and useZoomRegion
// (shift-drag to zoom to a range) are two gestures on the same element, and one
// of them treating a refused capture as fatal would strand the other's pointer.

const tryCapture = (element, method, pointerId) => {
    try {
        element[method]?.(pointerId);
    } catch {
        // Nothing to recover: the drag continues, bounded to the element.
    }
};

export const capturePointer = (element, pointerId) =>
    tryCapture(element, 'setPointerCapture', pointerId);

export const releasePointer = (element, pointerId) =>
    tryCapture(element, 'releasePointerCapture', pointerId);
