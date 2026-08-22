import React from 'react';
import { Link } from 'react-router-dom';
import { excerptOf } from './markdown';

// How much of the body to show under the title in the list.
const EXCERPT_LENGTH = 80;

/**
 * The remove button's accessible name.
 *
 * It says what the button does NOT do, because the row is an idea and the
 * button is an ×, and every other × on this page deletes the thing it sits
 * beside. This one takes the idea out of one chapter's shortlist and leaves the
 * idea, its body and its notes exactly where they are.
 */
export const removeLabelFor = (title) =>
    `Remove ${title} from this chapter — the idea itself is kept`;

// One idea in the notes panel.
//
// The row is a link rather than a button, because this panel captures ideas but
// does not file them: connecting an idea to topics, and reordering the notes
// under it, happen on the Ideas page, and the row says so by going there.
//
// `onRemove` puts an × beside it, as a SIBLING of the link and never inside it
// — a button nested in an anchor is markup no browser agrees on, and the whole
// row is the anchor. The panel hands one over only for a row that has an import
// to remove; a row that is here because a note anchored in this chapter is
// filed under it has no import behind it, and an × that wrote nothing would be
// worse than no ×.
const IdeaListItem = ({ idea, onRemove = null }) => {
    const excerpt = excerptOf(idea.body, EXCERPT_LENGTH);

    const row = (
        <Link className="analyze-entry analyze-idea" to="/ideas" data-idea-id={idea.id}>
            <span className="analyze-entry-title">{idea.title}</span>
            {excerpt && <span className="analyze-entry-excerpt">{excerpt}</span>}
        </Link>
    );

    if (!onRemove) {
        return row;
    }

    return (
        <div className="analyze-idea-row">
            {row}
            <button
                type="button"
                className="analyze-idea-remove"
                onClick={() => onRemove(idea.id)}
                aria-label={removeLabelFor(idea.title)}
            >
                ×
            </button>
        </div>
    );
};

export default IdeaListItem;
