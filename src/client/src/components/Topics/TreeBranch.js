import React from 'react';
import TreeRow from './TreeRow';
import { FAILED, LOADING, READY } from './useTopicTree';

// One level of the tree: the rows under a container, plus the three things a
// lazily-loaded level can be instead of a list — not yet arrived, arrived
// empty, or failed.
//
// Each is spelled out rather than collapsed into "no rows". An empty branch and
// a branch whose request failed look identical if both render nothing, and on
// this page that difference is the difference between "this topic holds no
// ideas" and "your ideas are still there, we just could not fetch them".
const TreeBranch = ({ container, branch, depth, tree, drag, emptyMessage }) => {
    // Null means the branch has not been asked for yet, which is the state a
    // row is in for the instant between opening and its first fetch starting.
    const status = branch ? branch.status : LOADING;
    const items = branch ? branch.items : [];

    return (
        <ul className="tree-branch">
            {status === FAILED && (
                <li className="tree-message tree-message--error" role="alert">
                    {branch.error}
                </li>
            )}

            {status === LOADING && items.length === 0 && (
                <li className="tree-message">Loading…</li>
            )}

            {status !== FAILED && items.map(node => (
                <TreeRow
                    key={node.key}
                    node={node}
                    depth={depth}
                    tree={tree}
                    drag={drag}
                />
            ))}

            {status === READY && items.length === 0 && emptyMessage && (
                <li className="tree-message" data-empty-branch={container.key}>
                    {emptyMessage}
                </li>
            )}
        </ul>
    );
};

export default TreeBranch;
