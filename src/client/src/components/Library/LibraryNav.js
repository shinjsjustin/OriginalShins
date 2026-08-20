import React from 'react';
import { Link } from 'react-router-dom';

// The management pages, the tree, search and the Analyze page are the same body
// of work seen from five sides, so each one links to the rest. Kept here rather
// than in the Navbar because these links belong to this feature, not to the
// account menu the Navbar owns.
const LIBRARY_LINKS = [
    { path: '/ideas', label: 'Ideas' },
    { path: '/topics', label: 'Topics' },
    { path: '/topics-tree', label: 'Tree' },
    { path: '/search', label: 'Search' },
    { path: '/analyze', label: 'Analyze' },
];

const LibraryNav = ({ current }) => (
    <nav className="library-nav" aria-label="Library sections">
        {LIBRARY_LINKS.map(link => (
            <Link
                key={link.path}
                to={link.path}
                className={`library-nav-link${link.path === current ? ' library-nav-link--current' : ''}`}
                aria-current={link.path === current ? 'page' : undefined}
            >
                {link.label}
            </Link>
        ))}
    </nav>
);

export default LibraryNav;
