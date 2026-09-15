import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import BookGrid from './BookGrid';

const books = [
    { id: 1, name: 'Genesis', testament: 'OT', canonicalOrder: 1 },
    { id: 40, name: 'Matthew', testament: 'NT', canonicalOrder: 40 },
    { id: 41, name: 'Mark', testament: 'NT', canonicalOrder: 41 },
];

test('splits the canon into its two testaments', () => {
    render(<BookGrid books={books} selectedBookId={null} onSelect={() => {}} />);

    const oldTestament = screen.getByRole('group', { name: 'Old Testament' });
    const newTestament = screen.getByRole('group', { name: 'New Testament' });

    expect(within(oldTestament).getByRole('button', { name: 'Genesis' })).toBeInTheDocument();
    expect(within(newTestament).getByRole('button', { name: 'Mark' })).toBeInTheDocument();
    expect(within(oldTestament).queryByRole('button', { name: 'Mark' })).not.toBeInTheDocument();
});

test('marks the selected book as current', () => {
    render(<BookGrid books={books} selectedBookId={40} onSelect={() => {}} />);

    expect(screen.getByRole('button', { name: 'Matthew' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Mark' })).not.toHaveAttribute('aria-current');
});

test('reports the book id alone, with no chapter', () => {
    const onSelect = jest.fn();
    render(<BookGrid books={books} selectedBookId={40} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mark' }));

    expect(onSelect).toHaveBeenCalledWith(41);
});

test('orders books canonically whatever order they arrive in', () => {
    const shuffled = [books[2], books[0], books[1]];
    render(<BookGrid books={shuffled} selectedBookId={null} onSelect={() => {}} />);

    const names = screen.getAllByRole('button').map(button => button.textContent);
    expect(names).toEqual(['Genesis', 'Matthew', 'Mark']);
});

test('renders both testaments with no book buttons while the canon is still loading', () => {
    render(<BookGrid books={[]} selectedBookId={null} onSelect={() => {}} />);

    expect(screen.getByRole('group', { name: 'Old Testament' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'New Testament' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
});
