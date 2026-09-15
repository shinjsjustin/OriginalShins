import React from 'react';
import BookTitle from './BookTitle';

// The Thoughts page's one strip of chrome: the way back to the whole field,
// the two things a reader can create here, and — in the idea view — which idea
// they are inside. It also holds which book is in scope, and that is a
// different fact from the breadcrumb's: the crumb says which idea is open,
// the title says which book the field is drawn from, and neither replaces the
// other.
//
// ── Why the crumb names one topic and is not a path ────────────────────────
//
// An idea can be filed under several topics, so "the" topic above it does not
// exist. The crumb prints the first one the payload lists, and "Unfiled" when
// there are none, because its job is orientation — you are somewhere under
// Faith — and not navigation. Nothing in it is a link; the way back out is
// Reset View, one control to its left.
//
// It is printed only when the open idea is actually in hand. While the load is
// in flight, or when the URL names an idea that no longer exists, there is no
// honest crumb to draw: "Unfiled › …" would be a claim about a row nobody has
// seen. The error banner is what speaks in that case, and it belongs to the
// page rather than to this bar.

export const UNFILED_LABEL = 'Unfiled';

// The same fallback the search page and the note editor use, so an idea nobody
// titled reads the same wherever it is named.
export const UNTITLED_IDEA_LABEL = 'Untitled idea';

/**
 * The `Topic › Idea` crumb for an open idea, or null when there is none to
 * print.
 */
export const breadcrumbFor = (idea) => {
    if (!idea) return null;

    const [topic] = idea.topics || [];

    return {
        topic: topic ? topic.name : UNFILED_LABEL,
        idea: idea.title || UNTITLED_IDEA_LABEL,
    };
};

/**
 * @param books         every book, from /api/books
 * @param bookId        the book in scope
 * @param onChangeBook  (bookId) -> void
 * @param idea          the open idea, or null in the topics view
 */
const TopBar = ({
    books = [],
    bookId = null,
    onChangeBook,
    idea = null,
    onResetView,
    onCreateTopic,
    onCreateIdea,
}) => {
    const crumb = breadcrumbFor(idea);

    return (
        <header className="thoughts-topbar">
            <div className="thoughts-topbar-row">
                {/* Left, and first in the DOM, because it is the one control
                    that always means the same thing wherever the reader is. */}
                <button type="button" className="thoughts-action" onClick={onResetView}>
                    ⟲ Reset View
                </button>

                <BookTitle books={books} bookId={bookId} onChange={onChangeBook} />

                <div className="thoughts-topbar-creates">
                    <button type="button" className="thoughts-action" onClick={onCreateTopic}>
                        + Topic
                    </button>
                    <button type="button" className="thoughts-action" onClick={onCreateIdea}>
                        + Idea
                    </button>
                </div>
            </div>

            {crumb && (
                <p className="thoughts-breadcrumb">
                    <span className="thoughts-breadcrumb-topic">{crumb.topic}</span>
                    {/* Decoration, not a word: a reader listening to the page
                        should hear the two names, not "single right-pointing
                        angle quotation mark" between them. */}
                    <span className="thoughts-breadcrumb-separator" aria-hidden="true">›</span>
                    <span className="thoughts-breadcrumb-idea">{crumb.idea}</span>
                </p>
            )}
        </header>
    );
};

export default TopBar;
