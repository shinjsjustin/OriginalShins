import React from 'react';
import { Link } from 'react-router-dom';

// One group of results under its heading.
//
// Every row is a link and nothing more. A search result is a way to reach the
// thing, not a second rendering of it — a note's body belongs in the editor
// beside the scripture it points at, and an inline copy here would be a second
// place to keep it right.
//
// The group's shape comes from searchModel.GROUPS, so this component asks a
// row's kind nothing: it reads a title, a detail and a link out of the group it
// was handed.
const SearchGroup = ({ group, items }) => {
    const headingId = `search-group-${group.key}`;

    return (
        <section className="search-group" aria-labelledby={headingId}>
            <h2 className="search-group-heading" id={headingId}>
                {group.heading}
                <span className="search-group-count">{items.length}</span>
            </h2>

            <ul className="search-results">
                {items.map(item => {
                    const detail = group.detailOf(item);

                    return (
                        <li key={group.keyOf(item)} className="search-result">
                            <Link className="search-result-link" to={group.linkOf(item)}>
                                <span className="search-result-title">{group.titleOf(item)}</span>
                                {detail && <span className="search-result-detail">{detail}</span>}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};

export default SearchGroup;
