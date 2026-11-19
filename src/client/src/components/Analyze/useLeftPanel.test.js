import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import useLeftPanel from './useLeftPanel';

const setup = (url) => {
    const wrapper = ({ children }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
    return renderHook(() => ({ panel: useLeftPanel(), location: useLocation() }), { wrapper });
};

describe('useLeftPanel', () => {
    test('side is compare when ?side= is absent, scrolls when it says so', () => {
        expect(setup('/analyze?l=1.1').result.current.panel.side).toBe('compare');
        expect(setup('/analyze?side=scrolls').result.current.panel.side).toBe('scrolls');
        expect(setup('/analyze?side=bogus').result.current.panel.side).toBe('compare');
    });

    test('showScrolls sets side=scrolls and keeps l and r', () => {
        const { result } = setup('/analyze?l=40.5&r=45.5');
        act(() => result.current.panel.showScrolls());
        const params = new URLSearchParams(result.current.location.search);
        expect(params.get('side')).toBe('scrolls');
        expect(params.get('l')).toBe('40.5');
        expect(params.get('r')).toBe('45.5');
        expect(result.current.panel.side).toBe('scrolls');
    });

    test('showCompare drops side and keeps l and r', () => {
        const { result } = setup('/analyze?l=40.5&side=scrolls&r=45.5');
        act(() => result.current.panel.showCompare());
        const params = new URLSearchParams(result.current.location.search);
        expect(params.has('side')).toBe(false);
        expect(params.get('l')).toBe('40.5');
        expect(params.get('r')).toBe('45.5');
    });

    test('both writes replace history rather than push', () => {
        const wrapper = ({ children }) => <MemoryRouter initialEntries={['/analyze?l=1.1']}>{children}</MemoryRouter>;
        const { result } = renderHook(() => ({ panel: useLeftPanel(), type: useNavigationType() }), { wrapper });
        act(() => result.current.panel.showScrolls());
        expect(result.current.type).toBe('REPLACE');
        act(() => result.current.panel.showCompare());
        expect(result.current.type).toBe('REPLACE');
    });
});
