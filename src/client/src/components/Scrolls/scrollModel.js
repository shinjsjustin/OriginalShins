// Pure labels and ordering for the Scrolls screens.

// "John 3", "John 3-4", "John 3:5", "John 3:1-16" or "John 3:1-4:12".
// A null endVerse means the passage runs to the end of its last chapter.
export const passageLabel = ({ bookName, startChapter, startVerse, endChapter, endVerse }) => {
    if (startVerse === 1 && endVerse === null) {
        return startChapter === endChapter
            ? `${bookName} ${startChapter}`
            : `${bookName} ${startChapter}-${endChapter}`;
    }
    const start = `${bookName} ${startChapter}:${startVerse}`;
    if (endVerse === null) return `${start}-end of ${endChapter}`;
    if (startChapter !== endChapter) return `${start}-${endChapter}:${endVerse}`;
    return startVerse === endVerse ? start : `${start}-${endVerse}`;
};

export const progressLabel = ({ questionCount, answeredCount }) =>
    questionCount === 0 ? '' : `${answeredCount} of ${questionCount} answered`;

export const sortNewestFirst = (scrolls) =>
    [...scrolls].sort((a, b) => {
        if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
        return b.id - a.id;
    });

export const isAnswerDirty = (block, draft) =>
    draft.trim() !== (block.answer ? block.answer.text : '');
