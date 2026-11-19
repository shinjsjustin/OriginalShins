import React, { useEffect, useState } from 'react';
import PanelHeader from './PanelHeader';
import useCoveringScroll from './useCoveringScroll';
import { scrollsPanelView } from './leftPanel';
import { describePosition } from './navigation';
import ScrollView from '../Scrolls/ScrollView';
import useScrolls from '../Scrolls/useScrolls';
import { passageLabel } from '../Scrolls/scrollModel';

const BROWSE = 'browse';

// The left slot's other tenant: the scroll covering the centre chapter, or the
// list of scrolls when none does. Mounted only while shown, so the Compare
// panel never costs a /scrolls request.
const ScrollsPanel = ({ position, books, collapse = null, isHidden = false, switcher = null }) => {
    const { bookId, chapter } = position;
    const covering = useCoveringScroll(position, true);
    const { scrolls, isLoading, error, reload } = useScrolls();
    const [pick, setPick] = useState(null);

    // A pick belongs to the chapter it was made on.
    useEffect(() => setPick(null), [bookId, chapter]);

    const view = scrollsPanelView(pick, covering.scroll);
    const isWaiting = view.kind === 'browse' && (covering.isLoading || isLoading);

    const handleDeleted = () => {
        setPick(BROWSE);
        reload();
    };

    return (
        <section
            className="analyze-panel analyze-panel--side analyze-scrolls-panel"
            aria-label="Scrolls"
            hidden={isHidden}
        >
            <PanelHeader
                label="Scrolls"
                title={describePosition(books, position)}
                collapse={collapse}
                action={switcher}
            />

            <div className="analyze-panel-body">
                {covering.error && (
                    <p className="analyze-message analyze-message--error" role="alert">{covering.error}</p>
                )}
                {error && (
                    <p className="analyze-message analyze-message--error" role="alert">{error}</p>
                )}

                {view.kind === 'scroll' && (
                    <>
                        <button type="button" className="analyze-panel-action" onClick={() => setPick(BROWSE)}>
                            All scrolls
                        </button>
                        <ScrollView scrollId={view.id} onDeleted={handleDeleted} onAnswerSaved={reload} />
                    </>
                )}

                {view.kind === 'browse' && isWaiting && <p className="analyze-message">Loading…</p>}

                {view.kind === 'browse' && !isWaiting && !error && scrolls.length === 0 && (
                    <p className="analyze-message">No scrolls yet.</p>
                )}

                {view.kind === 'browse' && !isWaiting && (
                    <ul className="scrolls-list">
                        {scrolls.map(scroll => (
                            <li key={scroll.id} className="scrolls-item">
                                <button type="button" className="scrolls-row" onClick={() => setPick(scroll.id)}>
                                    <span className="scrolls-row-title">{scroll.title}</span>
                                    <span className="scrolls-row-meta">{passageLabel(scroll.passage)}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
};

export default ScrollsPanel;
