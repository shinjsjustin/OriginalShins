import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import TreeBranch from './TreeBranch';
import { BUCKET, NOTE, analyzeUrlForNote, canExpand } from './treeModel';

// One row of the tree, and — when it is open — the branch beneath it.
//
// TreeRow and TreeBranch render each other, which is what lets the tree reach
// any depth from one pair of components. It happens to bottom out at three
// levels because a note has no childKind, not because either component counts.

const DISCLOSURE = { open: '▾', closed: '▸' };

// The clickable half of a row. A note is a link to the Analyze page; everything
// else is a button that opens the branch under it.
//
// ── Why a link rather than an editor here ──────────────────────────────────
//
// Opening a note in place would mean a second home for the note editor, its
// reference list and its ideas multi-select, all of which already exist on
// /analyze and all of which are only useful beside the scripture they point at.
// So the row navigates instead: /analyze?l=<book>.<chapter>&note=<id> — the
// chapter of the note's first anchor, with the editor opened on the note. That
// is one URL builder (treeModel.analyzeUrlForNote) and one query param read by
// Analyze, against a whole second panel of duplicated state the other way.
const RowLabel = ({ node, isOpen, onToggle }) => {
    if (node.kind === NOTE) {
        return (
            <Link className="tree-row-label tree-row-label--link" to={analyzeUrlForNote(node)}>
                <span className="tree-row-title">{node.title}</span>
            </Link>
        );
    }

    return (
        <button
            type="button"
            className="tree-row-label"
            onClick={() => onToggle(node)}
            aria-expanded={isOpen}
        >
            <span className="tree-row-disclosure" aria-hidden="true">
                {isOpen ? DISCLOSURE.open : DISCLOSURE.closed}
            </span>
            <span className="tree-row-title">{node.title}</span>
        </button>
    );
};

const TreeRow = ({ node, depth, tree, drag }) => {
    const isOpen = tree.isExpanded(node.key);

    const isDragging = drag.draggedKey === node.key;
    const isDropTarget = drag.dropTargetKey === node.key;

    // The row a link into this page asked for (/topics-tree?topic=3&idea=7).
    // A focused row deep in an open topic is often below the fold, so it is
    // scrolled to as well as marked — marking a row nobody can see is the same
    // as not marking it.
    const isFocused = tree.isFocused(node.key);
    const rowRef = useRef(null);

    useEffect(() => {
        // jsdom implements no layout and therefore no scrollIntoView, and a row
        // that cannot scroll is still a row that renders.
        if (isFocused && rowRef.current && rowRef.current.scrollIntoView) {
            rowRef.current.scrollIntoView({ block: 'center' });
        }
    }, [isFocused]);

    const className = [
        'tree-row',
        `tree-row--${node.kind}`,
        isDragging ? 'tree-row--dragging' : '',
        isDropTarget ? 'tree-row--drop-target' : '',
        isFocused ? 'tree-row--focused' : '',
    ].filter(Boolean).join(' ');

    return (
        <li className="tree-item">
            <div
                ref={rowRef}
                className={className}
                aria-current={isFocused ? 'true' : undefined}
                // The indent is a padding read off this custom property rather
                // than nested lists: nesting would indent by margin and make a
                // deep row's drop area narrower than a shallow one's.
                style={{ '--tree-depth': depth }}
                data-tree-key={node.key}
                data-tree-kind={node.kind}
                {...drag.handlersFor(node)}
            >
                <RowLabel node={node} isOpen={isOpen} onToggle={tree.toggle} />
                {node.detail && <span className="tree-row-detail">{node.detail}</span>}
            </div>

            {isOpen && canExpand(node) && (
                <TreeBranch
                    container={node}
                    branch={tree.branchFor(node.key)}
                    depth={depth + 1}
                    tree={tree}
                    drag={drag}
                    // A bucket that has loaded and holds nothing is the good
                    // case — no orphans — where a topic with no ideas is just
                    // an empty topic waiting to be filled.
                    emptyMessage={node.kind === BUCKET
                        ? 'Nothing unfiled.'
                        : 'Nothing filed here yet. Drag a row onto this one to file it.'}
                />
            )}
        </li>
    );
};

export default TreeRow;
