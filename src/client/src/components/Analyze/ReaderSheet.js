const stop = (e) => e.stopPropagation();

export default function ReaderSheet({
    label, plan, isBusy, actionError, copyFallback,
    onHighlight, onRemove, onAddNote, onCopy, onOpenNote, onClose,
}) {
    const hasRemovable = plan.noteIds.length > 0 || plan.referenceIds.length > 0;

    return (
        <div
            className="analyze-reader-sheet"
            role="dialog"
            aria-label={label}
            onClick={stop}
            onTouchStart={stop}
            onTouchMove={stop}
            onTouchEnd={stop}
        >
            <h2 className="analyze-reader-sheet-title">{label}</h2>
            {actionError && <p role="alert">{actionError}</p>}
            <div className="analyze-reader-sheet-actions">
                <button type="button" disabled={isBusy} onClick={onHighlight}>Highlight</button>
                <button type="button" disabled={isBusy || !hasRemovable} onClick={onRemove}>
                    Remove highlight
                </button>
                <button type="button" disabled={isBusy} onClick={onAddNote}>Add note</button>
                <button type="button" disabled={isBusy} onClick={onCopy}>Copy verse</button>
            </div>
            {!hasRemovable && <p>Nothing to remove here</p>}
            {plan.writtenNotes.length > 0 && (
                <div className="analyze-reader-sheet-written">
                    <p>These notes are kept:</p>
                    <ul>
                        {plan.writtenNotes.map((note) => (
                            <li key={note.id}>
                                <span>{note.title || 'Untitled'}</span>
                                <button type="button" onClick={() => onOpenNote(note.id)}>
                                    Open in Analyze
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {copyFallback && <p className="analyze-reader-copy-text">{copyFallback}</p>}
            <button type="button" onClick={onClose}>Done</button>
        </div>
    );
}
