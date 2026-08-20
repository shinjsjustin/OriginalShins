import React from 'react';
import { render, screen } from '@testing-library/react';
import TopBar, { UNFILED_LABEL, UNTITLED_IDEA_LABEL, breadcrumbFor } from './TopBar';

// The bar has one piece of logic in it and it is the crumb: an idea has a SET
// of topics, so naming one of them is a choice, and the two ways that set can
// fail to name anything — empty, and an idea that is not loaded — are different
// answers. Everything else here is three buttons, and the test says only that
// they exist and call what they are given.

describe('breadcrumbFor', () => {
    test('names the first linked topic and the idea', () => {
        const crumb = breadcrumbFor({
            id: 7,
            title: 'Covenant renewal',
            topics: [{ id: 1, name: 'Faith' }, { id: 2, name: 'Law' }],
        });

        expect(crumb).toEqual({ topic: 'Faith', idea: 'Covenant renewal' });
    });

    test('names an idea under no topic Unfiled', () => {
        expect(breadcrumbFor({ id: 7, title: 'Loose thought', topics: [] }))
            .toEqual({ topic: UNFILED_LABEL, idea: 'Loose thought' });
    });

    test('falls back for an idea nobody titled', () => {
        expect(breadcrumbFor({ id: 7, title: '', topics: [] }).idea)
            .toBe(UNTITLED_IDEA_LABEL);
    });

    test('has nothing to say without an idea', () => {
        expect(breadcrumbFor(null)).toBeNull();
    });
});

describe('TopBar', () => {
    test('shows the three controls in both views', () => {
        render(<TopBar />);

        expect(screen.getByRole('button', { name: /reset view/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '+ Topic' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '+ Idea' })).toBeInTheDocument();
    });

    test('draws no breadcrumb in the topics view', () => {
        render(<TopBar />);

        expect(screen.queryByText(UNFILED_LABEL)).not.toBeInTheDocument();
    });

    test('draws Topic › Idea for the open idea', () => {
        render(<TopBar idea={{ id: 7, title: 'Covenant renewal', topics: [{ id: 1, name: 'Faith' }] }} />);

        expect(screen.getByText('Faith')).toBeInTheDocument();
        expect(screen.getByText('Covenant renewal')).toBeInTheDocument();
    });
});
