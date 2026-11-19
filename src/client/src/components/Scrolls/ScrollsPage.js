import React from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../Navbar';
import SearchNav from '../Search/SearchNav';
import ScrollView from './ScrollView';
import useScrolls from './useScrolls';
import useOpenScroll from './useOpenScroll';
import { passageLabel, progressLabel } from './scrollModel';
import '../Styling/Search.css';
import '../Styling/Thoughts.css';
import '../Styling/Scrolls.css';

// /scrolls — the reader's scrolls; the one ?scroll= names is expanded inline.
const ScrollsPage = () => {
    const { scrolls, isLoading, error, reload } = useScrolls();
    const { scrollId, open, close } = useOpenScroll();

    const handleDeleted = () => {
        close();
        reload();
    };

    return (
        <div className="search-page">
            <Navbar />
            <main className="search-main">
                <header className="search-header">
                    <h1 className="search-title">Scrolls</h1>
                    <SearchNav current="/scrolls" />
                </header>

                {error && <p className="scrolls-message scrolls-message--error" role="alert">{error}</p>}
                {isLoading && <p className="scrolls-message">Loading…</p>}

                {!isLoading && !error && scrolls.length === 0 && (
                    <p className="scrolls-message">
                        No scrolls yet. Your AI writes scrolls with a key from{' '}
                        <Link to="/settings">Settings</Link>.
                    </p>
                )}

                <ul className="scrolls-list">
                    {scrolls.map((scroll) => {
                        const isOpen = scroll.id === scrollId;
                        const progress = progressLabel(scroll);
                        return (
                            <li key={scroll.id} className="scrolls-item">
                                <button
                                    type="button"
                                    className="scrolls-row"
                                    aria-expanded={isOpen}
                                    onClick={() => (isOpen ? close() : open(scroll.id))}
                                >
                                    <span className="scrolls-row-title">{scroll.title}</span>
                                    <span className="scrolls-row-meta">
                                        {passageLabel(scroll.passage)}
                                        {progress && ` · ${progress}`}
                                        {` · ${new Date(scroll.createdAt).toLocaleDateString()}`}
                                    </span>
                                </button>
                                {isOpen && <ScrollView scrollId={scroll.id} onDeleted={handleDeleted} />}
                            </li>
                        );
                    })}
                </ul>
            </main>
        </div>
    );
};

export default ScrollsPage;
