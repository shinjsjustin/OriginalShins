import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useChapter from './useChapter';
import useChapterScroll from './useChapterScroll';
import useReaderTextSize from './useReaderTextSize';
import useWakeLock from './useWakeLock';
import { buildHighlightIndex, referencesAt, tintClassName } from './highlights';
import { classifyTouch, tapZone, exceedsSlop, LONG_PRESS_MS } from './readerGestures';
import { describePosition, describeReference } from './navigation';
import { extendSelection, isSelected, selectionReference, planRemoval, formatCopyText } from './readerSelection';
import ReaderSheet from './ReaderSheet';

// Browsers fire a synthetic click after a touch; it must not act a second time.
const GHOST_CLICK_MS = 600;

const NO_NOTES = [];
const VERSE_SELECTOR = '[data-verse-index]';
const NUMBER_SELECTOR = '.analyze-reader-verse-number';

const verseIndexOf = (target) => {
    const row = target.closest ? target.closest(VERSE_SELECTOR) : null;
    return row ? Number(row.getAttribute('data-verse-index')) : null;
};

const Reader = ({
    books, position, notesRevision, onStep, onExit,
    notes = NO_NOTES, actionError, onHighlight, onRemoveHighlight, onAddNote, onOpenNote,
}) => {
    const bodyRef = useRef(null);
    const touchStartRef = useRef(null);
    const lastTouchAtRef = useRef(-Infinity);
    const pressTimerRef = useRef(null);
    const pressFiredRef = useRef(false);
    const [isOverlayOpen, setIsOverlayOpen] = useState(false);
    const [selection, setSelection] = useState(null);
    const [isBusy, setIsBusy] = useState(false);
    const [copyFallback, setCopyFallback] = useState('');

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

    const cancelPress = useCallback(() => {
        clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
    }, []);

    const clearSelection = useCallback(() => {
        setSelection(null);
        setCopyFallback('');
    }, []);

    useEffect(() => {
        clearSelection();
    }, [bookId, chapter, clearSelection]);

    useEffect(() => cancelPress, [cancelPress]);

    const select = useCallback((verseIndex) => {
        setSelection(current => extendSelection(current, verseIndex));
        setCopyFallback('');
    }, []);

    const handleTap = useCallback((x, target) => {
        const verseIndex = verseIndexOf(target);
        if (verseIndex !== null && (selection || target.closest(NUMBER_SELECTOR))) {
            select(verseIndex);
            return;
        }
        const zone = tapZone(x, window.innerWidth);
        if (zone === 'next') onStep(1);
        else if (zone === 'prev') onStep(-1);
        else setIsOverlayOpen(open => !open);
    }, [onStep, selection, select]);

    const handleTouchStart = (event) => {
        const { clientX, clientY } = event.changedTouches[0];
        touchStartRef.current = { x: clientX, y: clientY, at: Date.now() };
        pressFiredRef.current = false;
        const verseIndex = verseIndexOf(event.target);
        cancelPress();
        if (verseIndex === null) return;
        pressTimerRef.current = setTimeout(() => {
            pressFiredRef.current = true;
            select(verseIndex);
        }, LONG_PRESS_MS);
    };

    const handleTouchMove = (event) => {
        const start = touchStartRef.current;
        if (!start) return;
        const { clientX, clientY } = event.changedTouches[0];
        if (exceedsSlop({ dx: clientX - start.x, dy: clientY - start.y })) cancelPress();
    };

    const handleTouchEnd = (event) => {
        const start = touchStartRef.current;
        if (!start) return;
        touchStartRef.current = null;
        lastTouchAtRef.current = Date.now();
        cancelPress();
        if (pressFiredRef.current) {
            pressFiredRef.current = false;
            return;
        }
        const { clientX, clientY } = event.changedTouches[0];
        const kind = classifyTouch({
            dx: clientX - start.x,
            dy: clientY - start.y,
            ms: Date.now() - start.at,
        });
        if (kind === 'tap') handleTap(clientX, event.target);
        else if (kind === 'swipeNext') onStep(1);
        else if (kind === 'swipePrev') onStep(-1);
    };

    const handleClick = (event) => {
        if (Date.now() - lastTouchAtRef.current < GHOST_CLICK_MS) return;
        handleTap(event.clientX, event.target);
    };

    const verses = chapterData ? chapterData.verses : [];

    // Runs an action, clearing the selection only when the parent says it landed.
    const runAction = async (action) => {
        setIsBusy(true);
        try {
            if (await action()) clearSelection();
        } finally {
            setIsBusy(false);
        }
    };

    const copySelection = async () => {
        const book = books.find(b => b.id === bookId);
        const text = formatCopyText(book ? book.name : '', chapter, verses, selection);
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            setCopyFallback(text);
        }
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
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onClick={handleClick}
            >
                {error && <p className="analyze-message analyze-message--error" role="alert">{error}</p>}
                {!error && isLoading && <p className="analyze-message">Loading…</p>}
                {!error && !isLoading && chapterData && chapterData.verses.map(verse => (
                    <p
                        key={verse.id}
                        className={['analyze-reader-verse', tintClassName(referencesAt(highlightIndex, verse.verseIndex).length),
                            isSelected(selection, verse.verseIndex) && 'analyze-reader-verse--selected']
                            .filter(Boolean).join(' ')}
                        data-verse-index={verse.verseIndex}
                    >
                        <span className="analyze-reader-verse-number">{verse.verse}</span>
                        {' '}
                        <span className="analyze-reader-verse-text">{verse.text}</span>
                    </p>
                ))}
            </div>

            {selection && chapterData && (
                <ReaderSheet
                    label={describeReference(books, selectionReference(position, verses, selection))}
                    plan={planRemoval(selection, notes)}
                    isBusy={isBusy}
                    actionError={actionError}
                    copyFallback={copyFallback}
                    onHighlight={() => runAction(() => onHighlight(selectionReference(position, verses, selection)))}
                    onRemove={() => runAction(() => onRemoveHighlight(planRemoval(selection, notes)))}
                    onAddNote={() => runAction(() => onAddNote(selectionReference(position, verses, selection)))}
                    onCopy={copySelection}
                    onOpenNote={onOpenNote}
                    onClose={clearSelection}
                />
            )}

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
