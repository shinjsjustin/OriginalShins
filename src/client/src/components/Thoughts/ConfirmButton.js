import React, { useState } from 'react';

// A button whose action is worth asking about twice: Clear (every pin at once)
// and Delete (a topic, idea or note, and everything filed under it).
//
// ── Why not window.confirm ─────────────────────────────────────────────────
//
// Nothing else in this app hands the reader a browser dialog, and the two
// places that need a confirmation here are both inside a panel that is already
// showing them what they are about to act on. A native dialog would cover that
// — the reader would be answering "are you sure" about a list they can no
// longer see — and it cannot be styled, cannot be dismissed by clicking away,
// and cannot be tested without stubbing a global.
//
// So the question is asked in place: the button swaps itself for the question
// and the two answers, and the answer to "which items?" stays on screen behind
// it. Cancel puts the button back, so the escape route is the one that is
// pressed by accident, not the destructive one.
//
// ── One component for two callers ──────────────────────────────────────────
//
// Clear and Delete differ in their words and in nothing else. Written twice,
// the second one would eventually be the one that forgets to reset itself
// after the write, and a confirm that stays armed is a confirm that fires on
// the next click.

/**
 * @param label         what the resting button says
 * @param question      the one line asked once it is pressed
 * @param confirmLabel  what the answer that goes ahead says — never "Yes", so
 *                      that the destructive answer names itself even when the
 *                      question was not read
 * @param onConfirm     run on confirm; the button resets itself either way
 */
const ConfirmButton = ({
    label,
    question,
    confirmLabel,
    onConfirm,
    disabled = false,
    className = '',
    cancelLabel = 'Cancel',
}) => {
    const [isAsking, setIsAsking] = useState(false);

    if (!isAsking) {
        return (
            <button
                type="button"
                className={`thoughts-panel-button ${className}`.trim()}
                disabled={disabled}
                onClick={() => setIsAsking(true)}
            >
                {label}
            </button>
        );
    }

    return (
        <span className="thoughts-confirm" role="group" aria-label={question}>
            <span className="thoughts-confirm-question">{question}</span>
            <button
                type="button"
                className="thoughts-panel-button thoughts-panel-button--danger"
                onClick={() => {
                    setIsAsking(false);
                    onConfirm();
                }}
            >
                {confirmLabel}
            </button>
            <button
                type="button"
                className="thoughts-panel-button"
                onClick={() => setIsAsking(false)}
            >
                {cancelLabel}
            </button>
        </span>
    );
};

export default ConfirmButton;
