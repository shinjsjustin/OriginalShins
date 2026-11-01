// Pure rules for the reader's verse selection and its Remove highlight action.
// A selection is null or { start, end }: verse indexes within one chapter.

export function extendSelection(selection, verseIndex) {
    if (!selection) return { start: verseIndex, end: verseIndex };
    if (selection.start === verseIndex && selection.end === verseIndex) return null;
    return {
        start: Math.min(selection.start, verseIndex),
        end: Math.max(selection.end, verseIndex),
    };
}

export function isSelected(selection, verseIndex) {
    return Boolean(selection) && verseIndex >= selection.start && verseIndex <= selection.end;
}

const findVerse = (verses, verseIndex) => verses.find((v) => v.verseIndex === verseIndex);

// Printed numbers are read off the verses: the WEB skips numbers, so they
// cannot be derived from the indexes.
export function selectionReference(position, verses, selection) {
    return {
        bookId: position.bookId,
        chapter: position.chapter,
        startVerse: findVerse(verses, selection.start).verse,
        endVerse: findVerse(verses, selection.end).verse,
    };
}

const isBlank = (text) => !text || text.trim() === '';

export function isBlankNote(note) {
    return isBlank(note.title) && isBlank(note.body);
}

export function planRemoval(selection, notes) {
    const plan = { noteIds: [], referenceIds: [], writtenNotes: [] };
    const overlaps = (ref) => ref.startIndex <= selection.end && ref.endIndex >= selection.start;

    for (const note of notes) {
        const hit = note.references.filter(overlaps);
        if (hit.length === 0) continue;
        if (!isBlankNote(note)) {
            plan.writtenNotes.push({ id: note.id, title: note.title });
        } else if (hit.length === note.references.length) {
            plan.noteIds.push(note.id);
        } else {
            plan.referenceIds.push(...hit.map((ref) => ref.id));
        }
    }
    return plan;
}

export function formatCopyText(bookName, chapter, verses, selection) {
    const selected = verses.filter((v) => isSelected(selection, v.verseIndex));
    const first = selected[0].verse;
    const last = selected[selected.length - 1].verse;
    const range = first === last ? `${first}` : `${first}-${last}`;
    return `${selected.map((v) => v.text).join(' ')}\n${bookName} ${chapter}:${range}`;
}
