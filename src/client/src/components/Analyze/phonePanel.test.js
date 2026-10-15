import { PHONE_PANELS, DEFAULT_PHONE_PANEL, nextPhonePanel } from './phonePanel';

describe('phonePanel', () => {
    it('lists panels in desktop left-to-right order', () => {
        expect(PHONE_PANELS).toEqual(['compare', 'primary', 'notes']);
        expect(DEFAULT_PHONE_PANEL).toBe('primary');
    });

    it.each([
        ['primary', 'openNote', 'notes'],
        ['compare', 'noteCreated', 'notes'],
        ['primary', 'addedToNote', 'notes'],
        ['notes', 'addPassage', 'primary'],
        ['compare', 'bogus', 'compare'],
        ['notes', undefined, 'notes'],
    ])('from %s on %s goes to %s', (current, event, expected) => {
        expect(nextPhonePanel(current, event)).toBe(expected);
    });
});
