import React from 'react';
import Navbar from '../Navbar';
import LibraryNav from '../Library/LibraryNav';
import SearchGroup from './SearchGroup';
import useSearch from './useSearch';
import { GROUPS, MIN_QUERY_LENGTH, totalResults } from './searchModel';
import '../Styling/Search.css';

// /search — one box across all four tiers.
//
// ── Why a page and not a box in the Navbar ─────────────────────────────────
//
// The Navbar is the account menu: a profile icon and a panel of links, shown on
// every page including the two scripture panels, where horizontal room is the
// scarce thing. Results here are four groups of up to twenty rows apiece and
// each one is a link somewhere else, so they want a page's width and a page's
// scroll — a dropdown under a toolbar input would have to cut the groups short
// to fit, and a search result nobody can see is how a reader concludes
// something is not there. The Navbar gets a link to this page instead, beside
// the others.
//
// It carries LibraryNav for the same reason /ideas, /topics and the tree do:
// these are five views of one body of work, and each links to the rest.
const SearchPage = () => {
    const { query, setQuery, results, isSearching, error, searchedFor, isTooShort } = useSearch();

    const total = totalResults(results);
    // Groups with nothing in them are left out rather than printed as four
    // empty headings — but only once something matched. When nothing did, the
    // single message below says so once, which is clearer than saying it four
    // times.
    const groupsWithResults = GROUPS.filter(group => results[group.key].length > 0);

    const hasSearched = searchedFor.length > 0;

    return (
        <div className="search-page">
            <Navbar />

            <main className="search-main">
                <header className="search-header">
                    <h1 className="search-title">Search</h1>
                    <LibraryNav current="/search" />
                </header>

                <section className="search-card">
                    <label className="search-label" htmlFor="search-input">
                        Search notes, ideas, topics and scripture
                    </label>
                    <input
                        id="search-input"
                        className="search-input"
                        type="search"
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        placeholder="e.g. shepherd"
                        autoComplete="off"
                        // The results are announced as they change rather than
                        // moving focus, so typing is never interrupted.
                        aria-describedby="search-status"
                    />

                    {/* One live region for every "not results yet" state, so a
                        screen reader hears the change without the page having
                        to move focus into the list. */}
                    <p className="search-status" id="search-status" role="status">
                        {isTooShort && `Type at least ${MIN_QUERY_LENGTH} characters.`}
                        {!isTooShort && isSearching && 'Searching…'}
                        {!isTooShort && !isSearching && hasSearched && !error
                            && `${total} ${total === 1 ? 'result' : 'results'} for “${searchedFor}”.`}
                    </p>
                </section>

                {error && (
                    <p className="search-message search-message--error" role="alert">{error}</p>
                )}

                {!error && hasSearched && total === 0 && !isSearching && (
                    <p className="search-message">
                        Nothing matches “{searchedFor}” — not in your notes, ideas or topics, and
                        not in the scripture text.
                    </p>
                )}

                {!error && groupsWithResults.map(group => (
                    <SearchGroup key={group.key} group={group} items={results[group.key]} />
                ))}
            </main>
        </div>
    );
};

export default SearchPage;
