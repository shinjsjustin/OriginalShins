import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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

const books = [
    { id: 1, name: 'Genesis', testament: 'OT', canonicalOrder: 1 },
    { id: 40, name: 'Matthew', testament: 'NT', canonicalOrder: 40 },
    { id: 41, name: 'Mark', testament: 'NT', canonicalOrder: 41 },
];

const renderBar = (props = {}) => render(
    <TopBar
        books={books}
        bookId={40}
        onChangeBook={() => {}}
        onResetView={() => {}}
        onCreateTopic={() => {}}
        onCreateIdea={() => {}}
        {...props}
    />
);

test('titles the page with the book in scope', () => {
    renderBar();
    expect(screen.getByRole('button', { name: /Matthew Topics/ })).toBeInTheDocument();
});

test('the title opens the book grid and reports the pick', () => {
    const onChangeBook = jest.fn();
    renderBar({ onChangeBook });

    fireEvent.click(screen.getByRole('button', { name: /Matthew Topics/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark' }));

    expect(onChangeBook).toHaveBeenCalledWith(41);
});

test('says nothing about a book until the canon is in', () => {
    // /api/books is still in flight. A title naming a book nobody has seen
    // would be a claim about a row that has not loaded.
    renderBar({ books: [] });
    expect(screen.queryByRole('button', { name: /Topics$/ })).not.toBeInTheDocument();
});

test('picking the book already in scope reports nothing', () => {
    const onChangeBook = jest.fn();
    renderBar({ onChangeBook });

    fireEvent.click(screen.getByRole('button', { name: /Matthew Topics/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Matthew' }));

    expect(onChangeBook).not.toHaveBeenCalled();
});
