import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { analyzeUrlForChapter, analyzeUrlForNote } from '../Analyze/analyzeUrl';
import { describeReference } from '../Analyze/navigation';
import { renderMarkdown } from '../Analyze/markdown';
import { overviewUrlForTopic } from './overviewParams';
import useTierDetail from './useTierDetail';

// One note, idea or topic, opened by clicking its chain.
//
// ── One drawer, three tiers ────────────────────────────────────────────────
//
// The shell is the same whatever was clicked: a title, a close button, the
// body, a list of what hangs below, and a link into Analyze at the passage the
// reader was pointing at. What differs is only what fills those, which
// tierDetail.js answers per rail — so this file never asks which tier it is
// showing except for the two places where the answer changes what a reader can
// DO: a topic offers to filter the diagram to itself, and only a note's body
// is markdown.
//
// ── What is reused, and what is not ────────────────────────────────────────
//
// The three things a note is made of on the Analyze page come straight from
// it: renderMarkdown (marked + DOMPurify, the only sanitiser in the app),
// describeReference ("Genesis 1:3–5"), and the analyzeUrl builders, which know
// the query-string contract for opening the page at a chapter. Reusing those
// is what makes a passage read identically in both places.
//
// NoteEditor itself is not reused. It takes eight write callbacks — save,
// delete, add and remove a reference, replace the idea set — and this drawer
// has none of them: the Overview page is a reading of the whole corpus, and it
// has no refetch, so a write made here would leave the diagram behind it
// stale. Wiring one in would mean stubbing every callback and then hiding the
// controls those callbacks belong to, which is a larger component than the
// read-only one below and a worse one. The links are how an edit happens: they
// go to the pages that already do it.
//
// ── Where the list comes from ──────────────────────────────────────────────
//
// Two sources, on purpose. /api/overview already carried the title and, for a
// note, its references — so the drawer is complete the instant it opens and
// stays useful if the second request fails. The body and the rows beneath
// arrive separately and replace that fallback once they do, so a reference
// added on another tab is not shown stale for the sake of speed.

// The rails whose drawer offers to narrow the whole diagram to what it is
// showing. Only a topic can: it is the unit the API filters by, and it is the
// unit the plan's open question 2 says a reader will want to be alone with.
const FILTERS_THE_DIAGRAM = 'topics';

// What the list says before the group's own rows have arrived. Only a note has
// something to say — its references came down with the geometry — and the two
// tiers above it list rows that only their endpoint knows about.
const fallbackList = (rail, label, books) => (rail === 'notes' && label
    ? {
        listHeading: 'References',
        items: label.references.map(reference => ({
            key: `${reference.bookId}.${reference.chapter}.${reference.startVerse}`,
            text: describeReference(books, reference),
            to: null,
        })),
    }
    : { listHeading: '', items: [] });

// Where the foot of the drawer leads.
//
// A note has an editor on the Analyze page, so its link opens it there AND
// positions the left panel — `?l=45.5&note=17`, the contract analyzeUrl.js
// owns. An idea and a topic have no editor on that page; what they have in
// common with a note is the passage the reader was pointing at, so their link
// is the chapter alone. Both go through the same builders every other page in
// the app links with.
const analyzeDestination = (rail, groupId, reference) => (rail === 'notes'
    ? analyzeUrlForNote({ id: groupId, firstReference: reference })
    : analyzeUrlForChapter(reference.bookId, reference.chapter));

// The body, in the one of three states it is actually in. Written out rather
// than chained into the JSX above, where an `&&` over an empty string renders
// nothing and reads as though it renders something.
const DrawerBody = ({ detail, html }) => {
    if (detail.isMarkdown) {
        return html
            // Sanitized by DOMPurify inside renderMarkdown — see
            // Analyze/markdown.js. Nothing else on this page sets HTML.
            ? <div className="overview-drawer-body" dangerouslySetInnerHTML={{ __html: html }} />
            : <p className="overview-message">Nothing has been written here yet.</p>;
    }

    return detail.body
        ? <p className="overview-drawer-body">{detail.body}</p>
        : <p className="overview-message">Nothing has been written here yet.</p>;
};

const TierDrawer = ({ rail, groupId, label, nearestReference, books, onClose }) => {
    const { detail, isLoading, error } = useTierDetail(rail, groupId, books);
    const closeRef = useRef(null);

    // Escape closes it, the same gesture the Analyze page's modals answer to.
    // On the document rather than on the drawer: the reader's focus is wherever
    // the click left it, which is somewhere in the <svg>.
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // The drawer is opened by a pointer, so focus has to be moved into it by
    // hand or a keyboard reader is left behind in the diagram.
    useEffect(() => {
        closeRef.current?.focus();
    }, [rail, groupId]);

    const fallback = fallbackList(rail, label, books);
    const title = (detail && detail.title) || (label ? label.title : '');
    const listHeading = detail ? detail.listHeading : fallback.listHeading;
    const items = detail ? detail.items : fallback.items;
    const renderedBody = detail && detail.isMarkdown ? renderMarkdown(detail.body) : '';

    return (
        <aside
            className="overview-drawer"
            data-testid="overview-drawer"
            data-rail={rail}
            role="dialog"
            aria-modal="false"
            aria-label={title || 'Details'}
        >
            <header className="overview-drawer-header">
                <div>
                    <p className="overview-drawer-rail">{rail.replace(/s$/, '')}</p>
                    <h2 className="overview-drawer-title">{title}</h2>
                </div>
                <button
                    type="button"
                    ref={closeRef}
                    className="overview-drawer-close"
                    onClick={onClose}
                    aria-label="Close details"
                >
                    ×
                </button>
            </header>

            {error && (
                <p className="overview-message overview-message--error" role="alert">{error}</p>
            )}

            {isLoading && <p className="overview-message">Loading…</p>}

            {!isLoading && !error && detail && (
                <DrawerBody detail={detail} html={renderedBody} />
            )}

            {items.length > 0 && (
                <section className="overview-drawer-list">
                    <h3 className="overview-drawer-heading">{listHeading}</h3>
                    <ul className="overview-drawer-item-list">
                        {items.map(item => (
                            <li key={item.key} className="overview-drawer-item">
                                {item.to
                                    ? <Link to={item.to}>{item.text}</Link>
                                    : item.text}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {nearestReference && (
                <Link className="overview-drawer-link" to={analyzeDestination(rail, groupId, nearestReference)}>
                    {`Open in Analyze at ${describeReference(books, nearestReference)}`}
                </Link>
            )}

            {rail === FILTERS_THE_DIAGRAM && (
                <Link className="overview-drawer-link" to={overviewUrlForTopic(groupId)}>
                    Show only this topic
                </Link>
            )}
        </aside>
    );
};

export default TierDrawer;
