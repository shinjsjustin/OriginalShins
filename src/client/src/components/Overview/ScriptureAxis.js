import React from 'react';
import {
    AXIS,
    BOOK_LABEL_X,
    BOOK_TICK,
    CHAPTER_LABEL_X,
    CHAPTER_TICK,
    pinnedX,
} from './overviewLayout';

// The axis: one line, 66 book ticks, and 1,189 chapter ticks that are not in
// the DOM until the reader has zoomed far enough to tell them apart.
//
// Every mark is placed by the y the model already computed from its
// verse_index. Nothing here knows what a book is worth in verses, which is the
// property that makes 6b's stems land in the same places as these ticks: they
// will read the same model and the same yForIndex.
//
// ── Why ticks and labels are in separate groups ────────────────────────────
//
// Not for tidiness. Each group carries one horizontal counter-transform that
// undoes the sideways half of the zoom for everything inside it — a
// counter-scale for the ticks, which straddle the axis and must keep their
// length, and a counter-translation for the labels, which sit at one fixed x
// and must keep their distance. Grouping by that shared behaviour is what
// makes both of them a single CSS rule over a static attribute rather than a
// per-element write on every wheel notch.
//
// Memoised because the page above it re-renders when chapter detail comes and
// goes, and there is no reason for 66 ticks to be reconciled when it does.
const ScriptureAxis = ({ model, areChapterMarksVisible }) => (
    <g className="overview-axis">
        <g className="overview-pinned" style={{ '--ov-x-offset': pinnedX(AXIS.x) }}>
            <line
                className="overview-axis-line"
                x1={AXIS.x}
                y1={AXIS.top}
                x2={AXIS.x}
                y2={AXIS.bottom}
            />
        </g>

        <g className="overview-ticks">
            {model.books.map(book => (
                <line
                    key={book.id}
                    className="overview-book-tick"
                    x1={BOOK_TICK.left}
                    y1={book.y}
                    x2={BOOK_TICK.right}
                    y2={book.y}
                />
            ))}

            {areChapterMarksVisible && model.chapters.map(chapter => (
                <line
                    key={chapter.key}
                    className="overview-chapter-tick"
                    x1={CHAPTER_TICK.left}
                    y1={chapter.y}
                    x2={CHAPTER_TICK.right}
                    y2={chapter.y}
                />
            ))}
        </g>

        <g className="overview-pinned" style={{ '--ov-x-offset': pinnedX(BOOK_LABEL_X) }}>
            {model.books.map(book => (
                // data-tier is the zoom at which this label has room. CSS
                // compares it against the tier the <svg> publishes, so Obadiah
                // appears out of the crowd on its own.
                <text
                    key={book.id}
                    className="overview-book-label"
                    data-tier={book.tier}
                    x={BOOK_LABEL_X}
                    y={book.y}
                >
                    {book.name}
                </text>
            ))}
        </g>

        {areChapterMarksVisible && (
            <g className="overview-pinned" style={{ '--ov-x-offset': pinnedX(CHAPTER_LABEL_X) }}>
                {model.chapters.map(chapter => (
                    <text
                        key={chapter.key}
                        className="overview-chapter-label"
                        data-tier={chapter.tier}
                        x={CHAPTER_LABEL_X}
                        y={chapter.y}
                    >
                        {chapter.number}
                    </text>
                ))}
            </g>
        )}
    </g>
);

export default React.memo(ScriptureAxis);
