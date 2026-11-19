import React from 'react';
import ConfirmButton from '../Thoughts/ConfirmButton';
import ScrollBlock from './ScrollBlock';
import useScroll from './useScroll';
import { fetchJson } from '../../config/api';

// One scroll's blocks, with answers and delete. Takes an id rather than a
// scroll so Analyze can embed it.
const ScrollView = ({ scrollId, onDeleted, onAnswerSaved }) => {
    const { scroll, isLoading, error, saveAnswer } = useScroll(scrollId, { onAnswerSaved });
    const [deleteError, setDeleteError] = React.useState(null);

    const handleDelete = async () => {
        setDeleteError(null);
        try {
            await fetchJson(`/scrolls/${scrollId}`, { method: 'DELETE' });
            onDeleted(scrollId);
        } catch {
            setDeleteError('Could not delete the scroll.');
        }
    };

    if (isLoading) return <p className="scrolls-message">Loading…</p>;
    if (!scroll) return <p className="scrolls-message scrolls-message--error" role="alert">{error}</p>;

    return (
        <div className="scrolls-view">
            {error && <p className="scrolls-message scrolls-message--error" role="alert">{error}</p>}
            {scroll.blocks.map((block) => (
                <ScrollBlock
                    key={block.id}
                    block={block}
                    bookName={scroll.passage.bookName}
                    onSaveAnswer={saveAnswer}
                />
            ))}
            <div className="scrolls-delete">
                <ConfirmButton
                    label="Delete scroll"
                    question="Delete this scroll and your answers?"
                    confirmLabel="Delete scroll"
                    onConfirm={handleDelete}
                />
                {deleteError && (
                    <p className="scrolls-message scrolls-message--error" role="alert">{deleteError}</p>
                )}
            </div>
        </div>
    );
};

export default ScrollView;
