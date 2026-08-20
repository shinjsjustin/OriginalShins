import React, { useState } from 'react';
import Navbar from '../Navbar';
import LibraryNav from './LibraryNav';
import IdeaForm from './IdeaForm';
import MultiSelect from './MultiSelect';
import useIdeas from './useIdeas';
import useTopics from './useTopics';
import { countLabel } from './format';
import { renderMarkdown } from '../Analyze/markdown';
import '../Styling/Library.css';

// The ideas management page: create an idea, edit its title and body, file it
// under topics, delete it.
//
// Two hooks rather than one payload: ideas carry the topics they are filed
// under, and the topics list is what the multi-select offers. Loading them
// separately means the picker still works when an idea has no topics at all,
// which — like every relationship in this model — is a legal state.
const IdeasPage = () => {
    const {
        ideas,
        isLoading,
        error,
        actionError,
        createIdea,
        updateIdea,
        removeIdea,
        setIdeaTopics,
    } = useIdeas();

    const topics = useTopics();

    const [editingId, setEditingId] = useState(null);

    const handleUpdate = async (ideaId, values) => {
        const saved = await updateIdea(ideaId, values);
        if (saved) {
            setEditingId(null);
        }
        return saved;
    };

    // The checkbox list hands back the complete membership, which goes straight
    // to the endpoint. No add/remove bookkeeping happens on this side at all —
    // that is the point of the full-set PUT.
    const topicOptions = topics.topics.map(topic => ({ id: topic.id, label: topic.name }));

    const renderTopics = (idea) => (
        <MultiSelect
            legend="Topics"
            options={topicOptions}
            selectedIds={idea.topics.map(topic => topic.id)}
            onChange={topicIds => setIdeaTopics(idea.id, topicIds)}
            emptyMessage="No topics yet — create one on the Topics page to file this idea under."
        />
    );

    return (
        <div className="library-page">
            <Navbar />

            <main className="library-main">
                <header className="library-header">
                    <h1 className="library-title">Ideas</h1>
                    <LibraryNav current="/ideas" />
                </header>

                {error && (
                    <p className="library-message library-message--error" role="alert">{error}</p>
                )}
                {actionError && (
                    <p className="library-message library-message--error" role="alert">{actionError}</p>
                )}
                {topics.error && (
                    <p className="library-message library-message--error" role="alert">{topics.error}</p>
                )}

                <section className="library-card">
                    <h2 className="library-subtitle">New idea</h2>
                    <IdeaForm submitLabel="Create idea" onSubmit={createIdea} />
                </section>

                <section className="library-card">
                    <h2 className="library-subtitle">All ideas</h2>

                    {isLoading && <p className="library-message">Loading ideas…</p>}

                    {!isLoading && ideas.length === 0 && (
                        <p className="library-message">
                            No ideas yet. An idea gathers notes; a topic gathers ideas.
                        </p>
                    )}

                    <ul className="library-list">
                        {ideas.map(idea => {
                            const renderedBody = renderMarkdown(idea.body);

                            return (
                                <li key={idea.id} className="library-list-item" data-idea-id={idea.id}>
                                    {editingId === idea.id ? (
                                        <>
                                            <IdeaForm
                                                idea={idea}
                                                submitLabel="Save idea"
                                                onSubmit={values => handleUpdate(idea.id, values)}
                                                onCancel={() => setEditingId(null)}
                                            />
                                            {renderTopics(idea)}
                                        </>
                                    ) : (
                                        <>
                                            <div className="library-list-main">
                                                <h3 className="library-list-title">{idea.title}</h3>

                                                {renderedBody && (
                                                    // Sanitized by DOMPurify inside renderMarkdown —
                                                    // the same path a note body takes.
                                                    <div
                                                        className="library-list-body"
                                                        dangerouslySetInnerHTML={{ __html: renderedBody }}
                                                    />
                                                )}

                                                <p className="library-counts">
                                                    {countLabel(idea.noteCount, 'note')}
                                                </p>

                                                <ul className="library-chips">
                                                    {idea.topics.map(topic => (
                                                        <li key={topic.id} className="library-chip">
                                                            {topic.name}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>

                                            <div className="library-list-actions">
                                                <button
                                                    type="button"
                                                    className="library-button"
                                                    onClick={() => setEditingId(idea.id)}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className="library-button library-button--danger"
                                                    onClick={() => removeIdea(idea.id)}
                                                    aria-label={`Delete ${idea.title}`}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </section>
            </main>
        </div>
    );
};

export default IdeasPage;
