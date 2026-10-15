import { render, screen, fireEvent } from '@testing-library/react';
import PanelSwitcher from './PanelSwitcher';

const LABELS = ['Compare', 'Passage', 'Notes'];

test('renders Compare, Passage, Notes in order inside a Panels nav', () => {
    render(<PanelSwitcher current="primary" onSelect={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Panels' });
    const buttons = Array.from(nav.querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent)).toEqual(LABELS);
});

test.each([
    ['compare', [true, false, false]],
    ['primary', [false, true, false]],
    ['notes', [false, false, true]],
])('only the %s button is pressed', (current, expected) => {
    render(<PanelSwitcher current={current} onSelect={() => {}} />);
    const buttons = LABELS.map((l) => screen.getByRole('button', { name: l }));
    expect(buttons.map((b) => b.getAttribute('aria-pressed') === 'true')).toEqual(expected);
    expect(buttons.map((b) => b.classList.contains('analyze-switcher-button--current'))).toEqual(expected);
    buttons.forEach((b) => expect(b).toHaveClass('analyze-switcher-button'));
});

test.each([
    ['Compare', 'compare'],
    ['Passage', 'primary'],
    ['Notes', 'notes'],
])('pressing %s reports %s', (label, id) => {
    const onSelect = jest.fn();
    render(<PanelSwitcher current="primary" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(id);
});
