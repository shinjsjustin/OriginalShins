// Desktop left-to-right order.
export const PHONE_PANELS = ['compare', 'primary', 'notes'];
export const DEFAULT_PHONE_PANEL = 'primary';

const PANEL_FOR_EVENT = {
    openNote: 'notes',
    noteCreated: 'notes',
    addedToNote: 'notes',
    addPassage: 'primary',
};

export function nextPhonePanel(current, event) {
    return PANEL_FOR_EVENT[event] ?? current;
}
