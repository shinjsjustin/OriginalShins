import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useChapter from './useChapter';
import useChapterScroll from './useChapterScroll';
import useReaderTextSize from './useReaderTextSize';
import useWakeLock from './useWakeLock';
import { buildHighlightIndex, referencesAt, tintClassName } from './highlights';
import { classifyTouch, tapZone } from './readerGestures';
import { describePosition } from './navigation';

// Browsers fire a synthetic click after a touch; it must not act a second time.
const GHOST_CLICK_MS = 600;

const Reader = ({ books, position, notesRevision, onStep, onExit }) => {
    const bodyRef = useRef(null);
    const touchStartRef = useRef(null);
    const lastTouchAtRef = useRef(-Infinity);
    const [isOverlayOpen, setIsOverlayOpen] = useState(false);

    const { chapterData, isLoading, error } = useChapter(position, notesRevision);
    const textSize = useReaderTextSize();
    useWakeLock(true);

    const { bookId, chapter } = position;
    useChapterScroll(bodyRef, `${bookId}.${chapter}`, !isLoading && !!chapterData);

    const highlightIndex = useMemo(
        () => buildHighlightIndex(chapterData ? chapterData.references : []),
        [chapterData]
    );

    const title = describePosition(books, position);

    const handleTap = useCallback((x) => {
        const zone = tapZone(x, window.innerWidth);
        if (zone === 'next') onStep(1);
        else if (zone === 'prev') onStep(-1);
        else setIsOverlayOpen(open => !open);
    }, [onStep]);

    const handleTouchStart = (event) => {
        const { clientX, clientY } = event.changedTouches[0];
        touchStartRef.current = { x: clientX, y: clientY, at: Date.now() };
    };

    const handleTouchEnd = (event) => {
        const start = touchStartRef.current;
        if (!start) return;
        touchStartRef.current = null;
        lastTouchAtRef.current = Date.now();
        const { clientX, clientY } = event.changedTouches[0];
        const kind = classifyTouch({
            dx: clientX - start.x,
            dy: clientY - start.y,
            ms: Date.now() - start.at,
        });
        if (kind === 'tap') handleTap(clientX);
        else if (kind === 'swipeNext') onStep(1);
        else if (kind === 'swipePrev') onStep(-1);
    };

    const handleClick = (event) => {
        if (Date.now() - lastTouchAtRef.current < GHOST_CLICK_MS) return;
        handleTap(event.clientX);
    };

    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.key === 'ArrowRight') onStep(1);
            else if (event.key === 'ArrowLeft') onStep(-1);
            else if (event.key === 'Escape') onExit();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onStep, onExit]);

    return (
        <section
            className="analyze-reader"
            aria-label="Reader"
            style={{ '--reader-text-size': `${textSize.size}px` }}
        >
            <h2 className="analyze-reader-header" key={`${bookId}.${chapter}`}>{title}</h2>

            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
            <div
                className="analyze-reader-body"
                ref={bodyRef}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onClick={handleClick}
            >
                {error && <p className="analyze-message analyze-message--error" role="alert">{error}</p>}
                {!error && isLoading && <p className="analyze-message">Loading…</p>}
                {!error && !isLoading && chapterData && chapterData.verses.map(verse => (
                    <p
                        key={verse.id}
                        className={['analyze-reader-verse', tintClassName(referencesAt(highlightIndex, verse.verseIndex).length)]
                            .filter(Boolean).join(' ')}
                        data-verse-index={verse.verseIndex}
                    >
                        <span className="analyze-reader-verse-number">{verse.verse}</span>
                        {' '}
                        <span className="analyze-reader-verse-text">{verse.text}</span>
                    </p>
                ))}
            </div>

            {isOverlayOpen && (
                <div className="analyze-reader-overlay">
                    <button type="button" onClick={onExit}>Exit reader</button>
                    <span className="analyze-reader-overlay-title">{title}</span>
                    <button type="button" onClick={textSize.shrink} disabled={!textSize.canShrink}>Smaller text</button>
                    <button type="button" onClick={textSize.grow} disabled={!textSize.canGrow}>Larger text</button>
                </div>
            )}
        </section>
    );
};

export default Reader;
