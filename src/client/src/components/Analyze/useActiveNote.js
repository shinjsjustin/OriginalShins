import { useCallback, useEffect, useMemo, useState } from 'react';

// Resolves which note the editor is showing.
//
// The obvious implementation — look the id up in the chapter's lists — closes
// the editor the moment the left panel navigates away, because a note anchored
// only in Genesis 1 is simply not in Genesis 2's payload. That breaks the one
// workflow references exist for: open a note, move to the next chapter, and
// anchor it there as well.
//
// So the last resolved copy is retained. The lists still win whenever they hold
// the note, which keeps the editor showing the freshest data after a save; the
// retained copy only stands in while the reader is looking at a chapter the
// note does not touch yet.
const useActiveNote = (activeNoteId, notes, unreferenced) => {
    const [retained, setRetained] = useState(null);

    const fromLists = useMemo(() => {
        if (activeNoteId === null) {
            return null;
        }
        return [...notes, ...unreferenced].find(note => note.id === activeNoteId) || null;
    }, [activeNoteId, notes, unreferenced]);

    useEffect(() => {
        if (fromLists) {
            setRetained(fromLists);
        }
    }, [fromLists]);

    // Closing the editor drops the retained copy, so reopening a note never
    // shows a version from before the last write.
    useEffect(() => {
        if (activeNoteId === null) {
            setRetained(null);
        }
    }, [activeNoteId]);

    // Seeds the retained copy from a write's response. Creating a note and
    // anchoring one both return the note before the list refetch lands; without
    // this the editor would blink shut and open again in between.
    const retain = useCallback(note => setRetained(note), []);

    const activeNote = useMemo(() => {
        if (activeNoteId === null) {
            return null;
        }
        if (fromLists) {
            return fromLists;
        }
        return retained && retained.id === activeNoteId ? retained : null;
    }, [activeNoteId, fromLists, retained]);

    return { activeNote, retain };
};

export default useActiveNote;
