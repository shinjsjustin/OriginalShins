import React, { useState } from 'react';
import Navbar from '../Navbar';
import LibraryNav from './LibraryNav';
import TopicForm from './TopicForm';
import useTopics from './useTopics';
import { countLabel, joinCounts } from './format';
import '../Styling/Library.css';

// The topics management page: create one, rename one, delete one, and see how
// much hangs beneath each.
//
// It is deliberately a list and a form, not a tree. The three-level Topic page
// — with its unfiled buckets and drag-to-reorder — is the next phase; building
// half of it here would mean throwing that half away.
const TopicsPage = () => {
    const {
        topics,
        isLoading,
        error,
        actionError,
        createTopic,
        updateTopic,
        removeTopic,
    } = useTopics();

    const [editingId, setEditingId] = useState(null);

    const handleUpdate = async (topicId, values) => {
        const saved = await updateTopic(topicId, values);
        if (saved) {
            setEditingId(null);
        }
        return saved;
    };

    return (
        <div className="library-page">
            <Navbar />

            <main className="library-main">
                <header className="library-header">
                    <h1 className="library-title">Topics</h1>
                    <LibraryNav current="/topics" />
                </header>

                {error && (
                    <p className="library-message library-message--error" role="alert">{error}</p>
                )}
                {actionError && (
                    <p className="library-message library-message--error" role="alert">{actionError}</p>
                )}

                <section className="library-card">
                    <h2 className="library-subtitle">New topic</h2>
                    <TopicForm submitLabel="Create topic" onSubmit={createTopic} />
                </section>

                <section className="library-card">
                    <h2 className="library-subtitle">All topics</h2>

                    {isLoading && <p className="library-message">Loading topics…</p>}

                    {!isLoading && topics.length === 0 && (
                        <p className="library-message">
                            No topics yet. A topic gathers ideas, and an idea gathers notes.
                        </p>
                    )}

                    <ul className="library-list">
                        {topics.map(topic => (
                            <li key={topic.id} className="library-list-item" data-topic-id={topic.id}>
                                {editingId === topic.id ? (
                                    <TopicForm
                                        topic={topic}
                                        submitLabel="Save topic"
                                        onSubmit={values => handleUpdate(topic.id, values)}
                                        onCancel={() => setEditingId(null)}
                                    />
                                ) : (
                                    <>
                                        <div className="library-list-main">
                                            <h3 className="library-list-title">{topic.name}</h3>
                                            <code className="library-slug">{topic.slug}</code>
                                            {topic.description && (
                                                <p className="library-list-body">{topic.description}</p>
                                            )}
                                            <p className="library-counts">
                                                {joinCounts([
                                                    countLabel(topic.ideaCount, 'idea'),
                                                    countLabel(topic.noteCount, 'note'),
                                                ])}
                                            </p>
                                        </div>

                                        <div className="library-list-actions">
                                            <button
                                                type="button"
                                                className="library-button"
                                                onClick={() => setEditingId(topic.id)}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                className="library-button library-button--danger"
                                                onClick={() => removeTopic(topic.id)}
                                                aria-label={`Delete ${topic.name}`}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            </main>
        </div>
    );
};

export default TopicsPage;
