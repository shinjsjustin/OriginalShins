import React from 'react';
import { Link } from 'react-router-dom';

// The pages behind the login are the same body of work seen from four sides —
// the canvas that files it, the diagram that plots it, this box that finds a
// row of it, and the desk it is written at — so this page links to the rest.
// Kept here rather than in the Navbar because these links belong to the search
// page's header, not to the account menu the Navbar owns.
const SECTION_LINKS = [
    { path: '/thoughts', label: 'Thoughts' },
    { path: '/overview', label: 'Overview' },
    { path: '/search', label: 'Search' },
    { path: '/analyze', label: 'Analyze' },
];

const SearchNav = ({ current }) => (
    <nav className="search-nav" aria-label="Sections">
        {SECTION_LINKS.map(link => (
            <Link
                key={link.path}
                to={link.path}
                className={`search-nav-link${link.path === current ? ' search-nav-link--current' : ''}`}
                aria-current={link.path === current ? 'page' : undefined}
            >
                {link.label}
            </Link>
        ))}
    </nav>
);

export default SearchNav;
