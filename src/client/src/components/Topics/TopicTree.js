import React from 'react';
import Navbar from '../Navbar';
import LibraryNav from '../Library/LibraryNav';
import TreeBranch from './TreeBranch';
import TreeRow from './TreeRow';
import useTopicTree, { LOADING, READY } from './useTopicTree';
import useTreeDrag from './useTreeDrag';
import { ROOT_KEY, bucketNodes } from './treeModel';
import '../Styling/TopicTree.css';

// The Topic page: topic -> idea -> note, one level loaded at a time, with the
// two unfiled buckets pinned beneath the topics.
//
// ── Why this is a second page and not a rewrite of /topics ─────────────────
//
// /topics stays as it is. It is where a topic is created, renamed, described
// and deleted; this page is where things are filed, and it has no forms at all.
// Folding the forms in here would turn the tree into a management page with a
// tree stuck to the side of it, and folding the tree into /topics would leave
// nowhere to create the topics it files things into.
//
// ── Why the buckets are not optional ───────────────────────────────────────
//
// Every relationship in this model is optional in both directions, so a note
// under no idea and an idea under no topic are ordinary rows — and neither
// hangs off anything the three levels above walk down from. Without the two
// buckets they would be invisible here, and a page that silently omits rows is
// worse than one that shows none.

// The root of the tree is not a row: nothing can be dropped on it and it has no
// label. It exists only so TreeBranch has a container to render under.
const ROOT_CONTAINER = { key: ROOT_KEY, kind: 'root', childKind: null };

const TopicTree = () => {
    const tree = useTopicTree();
    const drag = useTreeDrag({ onDrop: tree.handleDrop });

    // The root level is loaded by the page itself, so it is handed to
    // TreeBranch as an already-resolved branch rather than fetched through one.
    const rootBranch = {
        status: tree.isLoading ? LOADING : READY,
        items: tree.rootNodes,
        error: '',
    };

    return (
        <div className="tree-page">
            <Navbar />

            <main className="tree-main">
                <header className="tree-header">
                    <h1 className="tree-title">Topic tree</h1>
                    <LibraryNav current="/topics-tree" />
                </header>

                <p className="tree-hint">
                    Drag a row onto another to file it: onto a topic or an idea to put it
                    inside, onto a row of its own kind to put it in that row's place. Drop
                    it on an unfiled bucket to unfile it.
                </p>

                {tree.error && (
                    <p className="tree-message tree-message--error" role="alert">{tree.error}</p>
                )}
                {tree.actionError && (
                    <p className="tree-message tree-message--error" role="alert">
                        {tree.actionError}
                    </p>
                )}

                <section className="tree-card" aria-label="Topics">
                    {!tree.isLoading && tree.rootNodes.length === 0 && (
                        <p className="tree-message">
                            No topics yet. Create one on the Topics page — unfiled notes and
                            ideas are still reachable below.
                        </p>
                    )}

                    <TreeBranch
                        container={ROOT_CONTAINER}
                        branch={rootBranch}
                        depth={0}
                        tree={tree}
                        drag={drag}
                        emptyMessage=""
                    />
                </section>

                {/* Rendered outside the topic list, and always — loaded or not,
                    empty or not. They are the only route to an orphan, so they
                    may not depend on anything above them having arrived. */}
                <section className="tree-card tree-card--buckets" aria-label="Unfiled">
                    <ul className="tree-branch">
                        {bucketNodes().map(node => (
                            <TreeRow
                                key={node.key}
                                node={node}
                                depth={0}
                                tree={tree}
                                drag={drag}
                            />
                        ))}
                    </ul>
                </section>
            </main>
        </div>
    );
};

export default TopicTree;
