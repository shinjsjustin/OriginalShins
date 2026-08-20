import React, { useEffect } from 'react';

// Overlay shell shared by the book and chapter pickers.
//
// Owns only the dismissal behaviour every modal needs — Escape, a click on the
// backdrop, and a close button. The grid itself comes in as children.
const Modal = ({ title, onClose, children }) => {
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div
            className="analyze-modal-backdrop"
            onClick={onClose}
            role="presentation"
        >
            <div
                className="analyze-modal"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                // The backdrop closes on click; without this every click inside
                // the dialog would bubble up and close it too.
                onClick={event => event.stopPropagation()}
            >
                <header className="analyze-modal-header">
                    <h2 className="analyze-modal-title">{title}</h2>
                    <button
                        type="button"
                        className="analyze-modal-close"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ×
                    </button>
                </header>

                <div className="analyze-modal-body">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal;
