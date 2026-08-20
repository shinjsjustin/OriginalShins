import React from 'react';
import { Link } from 'react-router-dom';
import { excerptOf } from './markdown';

// How much of the body to show under the title in the list.
const EXCERPT_LENGTH = 80;

// One idea in the notes panel.
//
// A link rather than a button, because this panel captures ideas but does not
// file them: connecting an idea to topics, and reordering the notes under it,
// happen on the Ideas page, and the row says so by going there.
const IdeaListItem = ({ idea }) => {
    const excerpt = excerptOf(idea.body, EXCERPT_LENGTH);

    return (
        <Link className="analyze-entry analyze-idea" to="/ideas" data-idea-id={idea.id}>
            <span className="analyze-entry-title">{idea.title}</span>
            {excerpt && <span className="analyze-entry-excerpt">{excerpt}</span>}
        </Link>
    );
};

export default IdeaListItem;
