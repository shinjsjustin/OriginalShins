import { render, screen, fireEvent } from '@testing-library/react';
import ReaderSheet from './ReaderSheet';

const emptyPlan = { noteIds: [], referenceIds: [], writtenNotes: [] };

function setup(overrides = {}) {
    const props = {
        label: 'Genesis 1:3-4',
        plan: { ...emptyPlan, noteIds: [1] },
        isBusy: false,
        actionError: null,
        copyFallback: null,
        onHighlight: jest.fn(),
        onRemove: jest.fn(),
        onAddNote: jest.fn(),
        onCopy: jest.fn(),
        onOpenNote: jest.fn(),
        onClose: jest.fn(),
        ...overrides,
    };
    render(<ReaderSheet {...props} />);
    return props;
}

test('is a dialog labelled with the reference', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Genesis 1:3-4' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Genesis 1:3-4' })).toBeInTheDocument();
});

test('each button calls its prop', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove highlight' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy verse' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(p.onHighlight).toHaveBeenCalledTimes(1);
    expect(p.onRemove).toHaveBeenCalledTimes(1);
    expect(p.onAddNote).toHaveBeenCalledTimes(1);
    expect(p.onCopy).toHaveBeenCalledTimes(1);
    expect(p.onClose).toHaveBeenCalledTimes(1);
});

test('disables the actions while busy', () => {
    setup({ isBusy: true });
    for (const name of ['Highlight', 'Remove highlight', 'Add note', 'Copy verse']) {
        expect(screen.getByRole('button', { name })).toBeDisabled();
    }
});

test('disables remove with a message when the plan deletes nothing', () => {
    setup({ plan: { ...emptyPlan, referenceIds: [] } });
    expect(screen.getByRole('button', { name: 'Remove highlight' })).toBeDisabled();
    expect(screen.getByText('Nothing to remove here')).toBeInTheDocument();
});

test('enables remove when only referenceIds are planned', () => {
    setup({ plan: { ...emptyPlan, referenceIds: [4] } });
    expect(screen.getByRole('button', { name: 'Remove highlight' })).toBeEnabled();
    expect(screen.queryByText('Nothing to remove here')).toBeNull();
});

test('lists written notes and opens them in Analyze', () => {
    const p = setup({
        plan: { ...emptyPlan, writtenNotes: [{ id: 7, title: 'Light' }, { id: 8, title: '' }] },
    });
    expect(screen.getByText('Light')).toBeInTheDocument();
    expect(screen.getByText('Untitled')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: 'Open in Analyze' });
    fireEvent.click(buttons[1]);
    expect(p.onOpenNote).toHaveBeenCalledWith(8);
});

test('shows the copy fallback and the action error', () => {
    setup({ copyFallback: 'In the beginning', actionError: 'Could not save' });
    expect(document.querySelector('.analyze-reader-copy-text').textContent).toBe('In the beginning');
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
});

test('does not bubble clicks or touches out', () => {
    const outer = jest.fn();
    const { container } = render(
        <div onClick={outer} onTouchStart={outer} onTouchEnd={outer}>
            <ReaderSheet
                label="X" plan={emptyPlan} isBusy={false} actionError={null} copyFallback={null}
                onHighlight={() => {}} onRemove={() => {}} onAddNote={() => {}} onCopy={() => {}}
                onOpenNote={() => {}} onClose={() => {}}
            />
        </div>
    );
    const sheet = container.querySelector('.analyze-reader-sheet');
    fireEvent.click(sheet);
    fireEvent.touchStart(sheet);
    fireEvent.touchEnd(sheet);
    expect(outer).not.toHaveBeenCalled();
});
