import { useLayoutEffect, useState } from 'react';

// The pixel size of a canvas region, remeasured when the window changes.
//
// Both views need this and neither can guess it. Card positions come out of
// pure layout functions that are handed a canvas size, so the size has to be a
// measurement of the real element — and it has to be taken before paint, or the
// first frame of every view is a field of cards stacked at the origin.
//
// It lives here rather than in either view because the two would otherwise hold
// the same fifteen lines and the same fallback, and a fallback that differed
// between them would mean the topics field and the idea orbit disagreed about
// how big the same box is.

// What an unmeasured canvas is drawn at. A container that has not been laid out
// yet is 0×0, and the layout functions correctly refuse to place cards on
// nothing — so this is what the very first frame gets, and what a test
// environment (which lays nothing out) sees for good.
export const FALLBACK_CANVAS = Object.freeze({ width: 960, height: 560 });

/**
 * @param ref a ref on the element being measured
 * @returns { width, height } — the fallback until the element has a real size
 */
const useCanvasSize = (ref) => {
    const [size, setSize] = useState(null);

    useLayoutEffect(() => {
        const measure = () => {
            const node = ref.current;
            if (!node) return;

            const { width, height } = node.getBoundingClientRect();
            setSize(width > 0 && height > 0 ? { width, height } : null);
        };

        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [ref]);

    return size || FALLBACK_CANVAS;
};

export default useCanvasSize;
