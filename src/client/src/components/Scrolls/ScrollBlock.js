import React, { useState } from 'react';
import { renderMarkdown } from '../Analyze/markdown';
import { isAnswerDirty, passageLabel } from './scrollModel';

const KIND_LABELS = { note: 'Note', question: 'Question', reference: 'Reference', idea: 'Idea' };

// A reference block's passage, worded with the scroll's own book name (a
// scroll covers one book, and a block reference carries only ids).
const referenceLabel = (reference, bookName) => passageLabel({
    bookName,
    startChapter: reference.chapter,
    startVerse: reference.startVerse,
    endChapter: reference.chapter,
    endVerse: reference.endVerse,
});

const QuestionAnswer = ({ block, onSave }) => {
    const [draft, setDraft] = useState(block.answer ? block.answer.text : '');
    const [status, setStatus] = useState(null);

    const handleSave = async () => {
        const isSaved = await onSave(block.id, draft.trim());
        setStatus(isSaved ? 'saved' : 'failed');
    };

    return (
        <div className="scrolls-answer">
            <textarea
                className="scrolls-answer-input"
                aria-label="Your answer"
                value={draft}
                onChange={(event) => { setDraft(event.target.value); setStatus(null); }}
                rows={4}
            />
            <div className="scrolls-answer-actions">
                <button
                    type="button"
                    className="thoughts-panel-button"
                    disabled={!isAnswerDirty(block, draft)}
                    onClick={handleSave}
                >
                    Save
                </button>
                {status === 'saved' && <span className="scrolls-status" role="status">Saved.</span>}
                {status === 'failed' && (
                    <span className="scrolls-status scrolls-status--error" role="alert">
                        Could not save your answer.
                    </span>
                )}
            </div>
        </div>
    );
};

const ScrollBlock = ({ block, bookName, onSaveAnswer }) => (
    <section className={`scrolls-block scrolls-block--${block.kind}`}>
        <h3 className="scrolls-block-kind">{KIND_LABELS[block.kind] || block.kind}</h3>
        {block.reference && (
            <p className="scrolls-block-reference">{referenceLabel(block.reference, bookName)}</p>
        )}
        {block.body && (
            <div
                className="scrolls-block-body"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(block.body) }}
            />
        )}
        {block.kind === 'question' && <QuestionAnswer block={block} onSave={onSaveAnswer} />}
    </section>
);

export default ScrollBlock;
