import { toggleSelection } from './MultiSelect';

describe('toggleSelection', () => {
    test('adds an id that is not selected yet', () => {
        expect(toggleSelection([1, 2], 3)).toEqual([1, 2, 3]);
    });

    test('removes an id that is already selected', () => {
        expect(toggleSelection([1, 2, 3], 2)).toEqual([1, 3]);
    });

    test('clearing the last id yields an empty set rather than null', () => {
        expect(toggleSelection([7], 7)).toEqual([]);
    });

    test('never mutates the selection it was given', () => {
        const selected = [1, 2];

        toggleSelection(selected, 3);

        expect(selected).toEqual([1, 2]);
    });
});
