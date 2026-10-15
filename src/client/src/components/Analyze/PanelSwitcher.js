import { PHONE_PANELS } from './phonePanel';

const LABELS = { compare: 'Compare', primary: 'Passage', notes: 'Notes' };

export default function PanelSwitcher({ current, onSelect }) {
    return (
        <nav className="analyze-switcher" aria-label="Panels">
            {PHONE_PANELS.map((panel) => {
                const isCurrent = panel === current;
                return (
                    <button
                        key={panel}
                        type="button"
                        className={`analyze-switcher-button${isCurrent ? ' analyze-switcher-button--current' : ''}`}
                        aria-pressed={isCurrent}
                        onClick={() => onSelect(panel)}
                    >
                        {LABELS[panel]}
                    </button>
                );
            })}
        </nav>
    );
}
