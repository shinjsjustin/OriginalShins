import { groupPairs } from './useThoughtsData';
import { LINK_HINTS } from './linkRules';

const topic = (id) => ({ itemType: 'topic', itemId: id });
const idea = (id) => ({ itemType: 'idea', itemId: id });
const note = (id) => ({ itemType: 'note', itemId: id });

// Every group as "<endpoint> <ids>", which is what actually goes over the wire.
const describeGroups = ({ groups }) => groups.map(group =>
    `${group.target.linkPath(group.itemId)} ${group.target.idsKey}=[${group.partnerIds}]`);

describe('groupPairs', () => {
    test('a note under an idea writes the note-ideas set', () => {
        // Arrange / Act
        const grouped = groupPairs([[idea(7), note(9)]]);

        // Assert
        expect(describeGroups(grouped)).toEqual(['/notes/9/ideas ideaIds=[7]']);
    });

    test('a note under a topic writes the note-topics set', () => {
        const grouped = groupPairs([[topic(4), note(9)]]);

        expect(describeGroups(grouped)).toEqual(['/notes/9/topics topicIds=[4]']);
    });

    test('a note under both writes two sets, not one that clobbers the other', () => {
        // Arrange — exactly what evaluateLink emits for a three-tier selection
        const pairs = [
            [topic(4), idea(7)],
            [topic(4), note(9)],
            [idea(7), note(9)],
        ];

        // Act
        const grouped = groupPairs(pairs);

        // Assert
        expect(describeGroups(grouped).sort()).toEqual([
            '/ideas/7/topics topicIds=[4]',
            '/notes/9/ideas ideaIds=[7]',
            '/notes/9/topics topicIds=[4]',
        ]);
    });

    test('two parents of one child collapse into a single write', () => {
        const grouped = groupPairs([[topic(4), note(9)], [topic(5), note(9)]]);

        expect(describeGroups(grouped)).toEqual(['/notes/9/topics topicIds=[4,5]']);
    });

    test('refuses an upward pair', () => {
        expect(groupPairs([[note(9), topic(4)]]).error).toBe(LINK_HINTS.unknownType);
    });

    test('refuses an empty list', () => {
        expect(groupPairs([]).error).toBe(LINK_HINTS.empty);
    });
});
