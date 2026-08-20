import React from 'react';
import CollapseTab from './CollapseTab';

// The bar every panel wears: what the panel is, what passage it holds, and — on
// the two side panels — the tab that pushes it out of the way.
//
// The tab belongs in the panel's outer corner, which is the start of this row
// or the end of it depending on which edge the panel is against. Putting it in
// the row rather than over it means it can never land on the heading, however
// long the book name runs.
const PanelHeader = ({ label, title, collapse = null }) => {
    const tab = collapse && (
        <CollapseTab side={collapse.side} label={label} onCollapse={collapse.onCollapse} />
    );

    return (
        <header className="analyze-panel-header">
            {collapse && collapse.side === 'left' && tab}

            <div className="analyze-panel-heading">
                <span className="analyze-panel-label">{label}</span>
                <h2 className="analyze-panel-title">{title || ' '}</h2>
            </div>

            {collapse && collapse.side === 'right' && tab}
        </header>
    );
};

export default PanelHeader;
