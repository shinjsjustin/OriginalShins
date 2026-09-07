# Import Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Analyze note editor's idea checkbox list with a bubble-field picker that files one idea *or one topic* against the open note, and give the existing chapter importer the same select-then-confirm step.

**Architecture:** One new `ImportPicker` component wraps the existing `BubbleOverlay` + `TopicIdeaField` and owns a single exclusive pick plus a confirm bar. `TopicIdeaField` gains optional selection props so the Thoughts page is unaffected. Both writes go through the existing whole-set endpoints (`PUT /notes/:id/ideas`, `PUT /notes/:id/topics`, `PUT /chapter-ideas`) as set arithmetic on what the note already carries. No server changes.

**Tech Stack:** React 18 (CRA / react-scripts), React Testing Library + Jest, plain CSS with custom properties. Spec: `docs/superpowers/specs/2026-09-06-import-picker-design.md`.

**Test command:** `npm run test:client -- <filename pattern>` from the repo root. Add `-t "<test name>"` to narrow further. `CI=true` is already baked in, so it runs once and exits.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/client/src/components/Analyze/noteFiling.js` | **Create.** Two pure set functions, `withMember` / `withoutMember` |
| `src/client/src/components/Analyze/noteFiling.test.js` | **Create.** Their tests |
| `src/client/src/components/Bubbles/BubbleCard.js` | **Modify.** Add `isPicked` → `.is-picked` |
| `src/client/src/components/Styling/Thoughts.css` | **Modify.** `.is-picked` ring, after `.is-selected` |
| `src/client/src/components/Bubbles/TopicIdeaField.js` | **Modify.** Add `pick` / `onPickTopic` optional props |
| `src/client/src/components/Bubbles/TopicIdeaField.test.js` | **Modify.** Cover picking, and that Thoughts is unaffected |
| `src/client/src/components/Bubbles/ImportPicker.js` | **Create.** Overlay + field + pick state + confirm bar |
| `src/client/src/components/Bubbles/ImportPicker.test.js` | **Create.** Its tests |
| `src/client/src/components/Bubbles/Bubbles.css` | **Modify.** The confirm bar |
| `src/client/src/components/Analyze/NotesPanel.js` | **Modify.** Swap its overlay for `ImportPicker` |
| `src/client/src/components/Analyze/useNotes.js` | **Modify.** Add `setNoteTopics` |
| `src/client/src/components/Analyze/Analyze.js` | **Modify.** Add `handleSaveTopics`, drop `ideaGroups` |
| `src/client/src/components/Analyze/NoteFiling.js` | **Create.** The editor's ideas-and-topics section |
| `src/client/src/components/Analyze/NoteEditor.js` | **Modify.** Swap `MultiSelect` for `NoteFiling` |
| `src/client/src/components/Styling/Analyze.css` | **Modify.** Filing rows |
| `src/client/src/components/Analyze/Analyze.test.js` | **Modify.** Harness gains topics; two describes rewritten |
| `src/client/src/components/Analyze/MultiSelect.js` + `.test.js` | **Delete** |
| `src/client/src/components/Analyze/chapterIdeas.js` | **Modify.** Drop `groupIdeaOptions` and its two headings |
| `src/client/src/components/Analyze/chapterIdeas.test.js` | **Modify.** Drop that describe |

**Ordering rule:** the suite must be green at every commit. That is why the test harness (Task 6) lands before `NoteFiling` (Task 8), and why the old checkbox tests are rewritten in the same commit that removes the checkboxes.

---

## Task 1: `noteFiling` — the set arithmetic

**Files:**
- Create: `src/client/src/components/Analyze/noteFiling.js`
- Test: `src/client/src/components/Analyze/noteFiling.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/client/src/components/Analyze/noteFiling.test.js`:

```js
import { withMember, withoutMember } from './noteFiling';

// Filing a note is always a whole-set PUT, so every write here is "the set it
// has, plus or minus one". Two functions rather than four inline spreads: an
// add and a remove written separately are an add and a remove that drift.

describe('withMember', () => {
    test('appends an id the set does not hold', () => {
        expect(withMember([1, 2], 3)).toEqual([1, 2, 3]);
    });

    test('returns the set unchanged when it already holds the id', () => {
        const ids = [1, 2];

        // Referentially equal, so a caller can skip a no-op round trip by
        // comparing against what it passed in.
        expect(withMember(ids, 2)).toBe(ids);
    });

    test('starts a set from empty', () => {
        expect(withMember([], 7)).toEqual([7]);
    });

    test('never mutates the set it was given', () => {
        const ids = [1];
        withMember(ids, 2);
        expect(ids).toEqual([1]);
    });
});

describe('withoutMember', () => {
    test('removes an id the set holds', () => {
        expect(withoutMember([1, 2, 3], 2)).toEqual([1, 3]);
    });

    test('leaves the set alone when it does not hold the id', () => {
        expect(withoutMember([1, 2], 9)).toEqual([1, 2]);
    });

    test('removing the last id yields an empty set rather than null', () => {
        // An orphan note is a legal state — see PUT /api/notes/:id/ideas.
        expect(withoutMember([1], 1)).toEqual([]);
    });

    test('never mutates the set it was given', () => {
        const ids = [1, 2];
        withoutMember(ids, 1);
        expect(ids).toEqual([1, 2]);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm run test:client -- noteFiling
```

Expected: FAIL — `Cannot find module './noteFiling'`.

- [ ] **Step 3: Write the implementation**

Create `src/client/src/components/Analyze/noteFiling.js`:

```js
// A note's ideas and its topics are two memberships, and both are written by a
// PUT that replaces the whole set. So every filing action on this page is the
// set the note already carries, plus or minus one id.
//
// Two functions rather than the same spread and filter written out at each of
// the four call sites — import an idea, import a topic, unfile an idea, unfile
// a topic. They are here, tested once, because an add and a remove maintained
// apart are an add and a remove that come to disagree about the empty case.

/**
 * The set with `id` in it.
 *
 * Appended, so the order is the one the reader built. A set that already holds
 * the id is returned AS IS rather than copied: the caller compares the result
 * against what it passed in to decide whether there is anything to send, and a
 * fresh array that happens to be equal would spend a round trip storing what
 * is already stored.
 */
export const withMember = (ids, id) => (ids.includes(id) ? ids : [...ids, id]);

/** The set without `id`. An empty result is legal — a note may be filed under nothing. */
export const withoutMember = (ids, id) => ids.filter(memberId => memberId !== id);
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npm run test:client -- noteFiling
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/client/src/components/Analyze/noteFiling.js \
        src/client/src/components/Analyze/noteFiling.test.js
git commit -m "feat: the set arithmetic behind filing a note"
```

---

## Task 2: `isPicked` on `BubbleCard`

A picked card and a spotlit card are different facts. `isSelected` already means "this topic's fan is open", and on the importer a picked topic usually has its fan open — so the two are drawn together and must not be the same treatment.

**Files:**
- Modify: `src/client/src/components/Bubbles/BubbleCard.js:81-109`
- Modify: `src/client/src/components/Styling/Thoughts.css` (after `.thoughts-bubble.is-selected`, currently line 378)

- [ ] **Step 1: Write the failing test**

Append to `src/client/src/components/Bubbles/TopicIdeaField.test.js`, at the end of the file:

```js
describe('BubbleCard picked state', () => {
    test('a picked card carries is-picked, and an unpicked one does not', () => {
        const { rerender } = render(
            <BubbleCard title="Faith" position={BOX} onActivate={() => {}} />
        );

        expect(screen.getByRole('button', { name: /Faith/ }).closest('.thoughts-bubble'))
            .not.toHaveClass('is-picked');

        rerender(<BubbleCard title="Faith" position={BOX} isPicked onActivate={() => {}} />);

        expect(screen.getByRole('button', { name: /Faith/ }).closest('.thoughts-bubble'))
            .toHaveClass('is-picked');
    });

    test('picked and selected are independent — a card can be both at once', () => {
        // The importer's common case: the topic you picked is the topic whose
        // fan you opened to pick it.
        render(<BubbleCard title="Faith" position={BOX} isPicked isSelected onActivate={() => {}} />);

        const card = screen.getByRole('button', { name: /Faith/ }).closest('.thoughts-bubble');
        expect(card).toHaveClass('is-picked');
        expect(card).toHaveClass('is-selected');
    });
});
```

Add the import and the box constant at the top of that file, beside the existing imports:

```js
import BubbleCard from './BubbleCard';

const BOX = { x: 0, y: 0, width: 100, height: 60 };
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm run test:client -- TopicIdeaField -t "picked"
```

Expected: FAIL — the element does not have class `is-picked`.

- [ ] **Step 3: Add the prop**

In `src/client/src/components/Bubbles/BubbleCard.js`, add `isPicked` to the destructured props beside `isSelected`:

```js
    isSelected = false,
    isPicked = false,
    isFaded = false,
```

and add it to the class list:

```js
    const classes = [
        'thoughts-bubble',
        `thoughts-bubble--${kind}`,
        isSelected ? 'is-selected' : '',
        isPicked ? 'is-picked' : '',
        isFaded ? 'is-faded' : '',
        isPinned ? 'is-pinned' : '',
        className,
    ].filter(Boolean).join(' ');
```

Document it in the JSDoc block above the component, after the `isSelected` line:

```js
 * @param isPicked    the card the reader has CHOSEN, which is not the same as
 *                    the card the spotlight is on: on the importer the picked
 *                    topic is usually also the open one, so the two states are
 *                    drawn together and must not look alike
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npm run test:client -- TopicIdeaField -t "picked"
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Style it**

In `src/client/src/components/Styling/Thoughts.css`, immediately **after** the `.thoughts-bubble.is-selected` rule (currently ending at line 382), add:

```css
/* The card the reader has chosen in the importer, as opposed to the one the
   spotlight is on. A full ring rather than the left edge `is-selected` draws,
   because the two arrive together — the topic you picked is normally the topic
   whose fan you opened — and one of them has to still be legible.

   It is placed after `.is-selected` deliberately: both write `--bubble-edge`,
   and on a card that is both, "chosen" is the stronger statement and should be
   the one that survives. */
.thoughts-bubble.is-picked {
  --bubble-edge: inset 0 0 0 2px var(--gold);

  border-color: var(--gold);
}
```

- [ ] **Step 6: Run the whole Bubbles suite**

```bash
npm run test:client -- Bubbles
```

Expected: PASS. No existing test asserts on `is-picked`, and nothing passes the new prop yet.

- [ ] **Step 7: Commit**

```bash
git add src/client/src/components/Bubbles/BubbleCard.js \
        src/client/src/components/Bubbles/TopicIdeaField.test.js \
        src/client/src/components/Styling/Thoughts.css
git commit -m "feat: a bubble can be drawn as picked, not just spotlit"
```

---

## Task 3: `TopicIdeaField` learns to be picked from

Selection arrives as optional props, exactly as pinning already does. Absent props mean the feature is not present at all — which is how the Thoughts page keeps its current behaviour without passing no-ops.

**Files:**
- Modify: `src/client/src/components/Bubbles/TopicIdeaField.js:136-234` (`TopicCluster`) and `:254-262` (props)
- Test: `src/client/src/components/Bubbles/TopicIdeaField.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `src/client/src/components/Bubbles/TopicIdeaField.test.js`:

```js
describe('picking from the field', () => {
    const renderField = (props = {}) => render(
        <MemoryRouter>
            <TopicIdeaField topics={TOPICS} ideas={IDEAS} {...props} />
        </MemoryRouter>
    );

    const cardOf = (name) => screen.getByText(name, { selector: '.thoughts-bubble-title' })
        .closest('.thoughts-bubble');

    test('a topic click reports the pick when the caller asked for topic picking', () => {
        const onPickTopic = jest.fn();
        renderField({ onPickTopic });

        clickTopic('Faith');

        expect(onPickTopic).toHaveBeenCalledWith(1);
    });

    test('a topic click still opens the fan while picking it', () => {
        // The two are not rivals: the fan is how the reader reaches the
        // topic's ideas, and looking inside a topic is not evidence against
        // wanting to file under it.
        renderField({ onPickTopic: jest.fn() });

        clickTopic('Faith');

        expect(isOpen('Faith')).toBe(true);
    });

    test('without onPickTopic a topic click only opens the fan', () => {
        // The Thoughts page's behaviour, unchanged.
        renderField();

        clickTopic('Faith');

        expect(isOpen('Faith')).toBe(true);
    });

    test('draws the picked topic as picked, and nothing else', () => {
        renderField({ pick: { kind: 'topic', id: 1 }, onPickTopic: jest.fn() });

        expect(cardOf('Faith')).toHaveClass('is-picked');
        expect(cardOf('Law')).not.toHaveClass('is-picked');
    });

    test('draws the picked idea as picked, and not the topic it sits under', () => {
        renderField({ pick: { kind: 'idea', id: 11 }, onPickTopic: jest.fn() });

        expect(cardOf('Covenant renewal')).toHaveClass('is-picked');
        expect(cardOf('Faith')).not.toHaveClass('is-picked');
    });

    test('an idea and a topic sharing an id are not confused for each other', () => {
        // Topic 1 and idea 11 are different rows in different tables. A pick
        // that carried only an id would light the wrong card the moment the
        // two tiers' ids overlapped.
        renderField({ pick: { kind: 'topic', id: 1 }, onPickTopic: jest.fn() });

        expect(cardOf('Faith')).toHaveClass('is-picked');
        expect(cardOf('Covenant renewal')).not.toHaveClass('is-picked');
    });

    test('nothing is picked when pick is null', () => {
        renderField({ pick: null, onPickTopic: jest.fn() });

        expect(document.querySelectorAll('.is-picked')).toHaveLength(0);
    });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npm run test:client -- TopicIdeaField -t "picking from the field"
```

Expected: FAIL — `onPickTopic` is never called, and no card has `is-picked`.

- [ ] **Step 3: Thread the props through `TopicCluster`**

In `src/client/src/components/Bubbles/TopicIdeaField.js`, add `isPicked` and `pickedIdeaId` to `TopicCluster`'s props (the destructure beginning at line 137):

```js
const TopicCluster = ({
    cluster,
    topicBox,
    fan,
    isActive,
    isFaded,
    isExpanded,
    isPicked,
    isPinned,
    onTogglePin,
    onEnter,
    onLeave,
    onTopicClick,
    onChipClick,
    onSelectIdea,
    pickedIdeaId,
    bloomableNoteIds,
    isNoteBlooming,
    onNoteClick,
}) => {
```

Pass `isPicked` to the anchor card, inside `renderAnchor`:

```js
                <BubbleCard
                    kind={cluster.kind}
                    title={cluster.title}
                    subtitle={countLabel(cluster.ideas.length, 'idea')}
                    position={position}
                    scale={topicBox.width / TOPIC_CARD.width}
                    isSelected={isActive}
                    isPicked={isPicked}
                    isFaded={isFaded}
                    onActivate={() => onTopicClick(cluster.id)}
                    {...(cluster.kind === 'topic'
                        ? pinPropsFor('topic', cluster.id, cluster.title)
                        : {})}
                />
```

and to the idea petal, in `renderPetal`:

```js
                return (
                    <BubbleCard
                        key={`idea-${idea.id}`}
                        kind="idea"
                        title={ideaTitle}
                        isPicked={pickedIdeaId === idea.id}
                        onActivate={() => onSelectIdea(idea.id)}
                        {...pinPropsFor('idea', idea.id, ideaTitle)}
                        {...petal}
                    />
                );
```

Note cards get nothing: a note is not importable into anything, so it is never picked.

- [ ] **Step 4: Add the props to `TopicIdeaField` itself**

Extend the destructure at line 254:

```js
const TopicIdeaField = ({
    topics = [],
    ideas = [],
    onSelectIdea = () => {},
    pick = null,
    onPickTopic = null,
    isPinned = () => false,
    onTogglePin = null,
    passagesByTopicId = {},
    onTopicOpen = () => {},
}) => {
```

Document them in the JSDoc block above, after the `onSelectIdea` entry:

```js
 * @param pick          { kind: 'idea' | 'topic', id } | null — which card is
 *                      drawn as picked. It carries the KIND as well as the id
 *                      because the two tiers number independently, and an id
 *                      alone would light an idea and a topic together
 * @param onPickTopic   (topicId) -> void. Optional: without it a topic card is
 *                      not selectable and a click merely opens its fan, which
 *                      is what the Thoughts page wants
```

Then, inside the `field.map` at line 338, derive the two flags and pass them:

```js
            {field.map((box, index) => {
                const clusterId = clusters[index].id;
                const isHeldOpen = heldOpenClusterId === clusterId;

                return (
                    <TopicCluster
                        key={clusterId}
                        cluster={clusters[index]}
                        topicBox={box}
                        fan={fans[index]}
                        isActive={bloom.isActive(clusterId) || isHeldOpen}
                        isFaded={bloom.isFaded(clusterId) && !isHeldOpen}
                        isExpanded={bloom.isExpanded(clusterId)}
                        isPicked={Boolean(pick) && pick.kind === 'topic' && pick.id === clusterId}
                        pickedIdeaId={pick && pick.kind === 'idea' ? pick.id : null}
                        isPinned={isPinned}
                        onTogglePin={onTogglePin}
                        onEnter={(id) => {
                            onTopicOpen(id);
                            bloom.onEnter(id);
                        }}
                        onLeave={bloom.onLeave}
                        onTopicClick={(id) => {
                            // Both, and in this order. Picking is the caller's
                            // business and opening is the field's, and a topic
                            // that only did one of them would either be
                            // unpickable or unopenable.
                            if (onPickTopic) onPickTopic(id);
                            bloom.onAnchorClick(id);
                        }}
                        onChipClick={bloom.onChipClick}
                        onSelectIdea={onSelectIdea}
                        bloomableNoteIds={bloomableIdsByClusterId[clusterId] || []}
                        isNoteBlooming={noteBloom.isActive}
                        onNoteClick={noteBloom.onAnchorClick}
                    />
                );
            })}
```

- [ ] **Step 5: Run the new tests and watch them pass**

```bash
npm run test:client -- TopicIdeaField
```

Expected: PASS, the whole file — the pre-existing tests confirm Thoughts is unaffected.

- [ ] **Step 6: Confirm Thoughts is untouched**

```bash
npm run test:client -- Thoughts
```

Expected: PASS. No Thoughts component passes `pick` or `onPickTopic`, so nothing there changes.

- [ ] **Step 7: Commit**

```bash
git add src/client/src/components/Bubbles/TopicIdeaField.js \
        src/client/src/components/Bubbles/TopicIdeaField.test.js
git commit -m "feat: the topic field can be picked from, when a caller asks"
```

---

## Task 4: `ImportPicker`

**Files:**
- Create: `src/client/src/components/Bubbles/ImportPicker.js`
- Create: `src/client/src/components/Bubbles/ImportPicker.test.js`
- Modify: `src/client/src/components/Bubbles/Bubbles.css`

- [ ] **Step 1: Write the failing tests**

Create `src/client/src/components/Bubbles/ImportPicker.test.js`:

```js
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ImportPicker from './ImportPicker';

// ─── What the picker has to get right ───────────────────────────────────────
//
// The field below it is already tested, and so is the overlay around it. What
// is new here is the step between them: a pick that is held rather than acted
// on, and a button that acts on it once.
//
// Three things matter. Import must refuse to fire with nothing picked, or the
// confirm step teaches the reader it does nothing. The pick must be exclusive
// ACROSS the two tiers — picking a topic after an idea must leave one pick, not
// two — because the endpoint written depends on which kind it is. And a kind
// the caller did not offer must not become pickable by any route, since the
// chapter importer has nowhere to store a topic.

const TOPICS = [
    { id: 1, name: 'Faith' },
    { id: 2, name: 'Law' },
];

const IDEAS = [
    { id: 11, title: 'Covenant renewal', topics: [{ id: 1, name: 'Faith' }] },
    { id: 12, title: 'Sabbath', topics: [{ id: 2, name: 'Law' }] },
];

const renderPicker = (props = {}) => {
    const onImport = jest.fn();
    const onClose = jest.fn();

    render(
        <MemoryRouter>
            <ImportPicker
                label="Import into this note"
                topics={TOPICS}
                ideas={IDEAS}
                selectableKinds={['idea', 'topic']}
                onImport={onImport}
                onClose={onClose}
                {...props}
            />
        </MemoryRouter>
    );

    return { onImport, onClose };
};

const importButton = () => screen.getByRole('button', { name: 'Import' });
const cancelButton = () => screen.getByRole('button', { name: 'Cancel' });

/** A card in the field, found by the title it prints rather than its full name. */
const cardOf = (name) => screen.getByText(name, { selector: '.thoughts-bubble-title' })
    .closest('button');

const cardBoxOf = (name) => screen.getByText(name, { selector: '.thoughts-bubble-title' })
    .closest('.thoughts-bubble');

describe('ImportPicker', () => {
    test('is a dialog named by its label', () => {
        renderPicker();

        expect(screen.getByRole('dialog', { name: 'Import into this note' })).toBeInTheDocument();
    });

    test('Import is disabled until something is picked', () => {
        renderPicker();

        expect(importButton()).toBeDisabled();

        fireEvent.click(cardOf('Covenant renewal'));

        expect(importButton()).toBeEnabled();
    });

    test('says what is picked, and which kind it is', () => {
        // "Faith" is a topic and "Covenant renewal" is an idea, and the kind
        // decides which endpoint is written — so the bar names it rather than
        // leaving the reader to read it off a card's colour.
        renderPicker();

        fireEvent.click(cardOf('Covenant renewal'));

        expect(screen.getByRole('status')).toHaveTextContent('idea');
        expect(screen.getByRole('status')).toHaveTextContent('Covenant renewal');
    });

    test('prompts rather than going blank when nothing is picked', () => {
        renderPicker();

        expect(screen.getByRole('status')).toHaveTextContent(/pick/i);
    });

    test('imports the picked idea, and does not close itself', () => {
        // The caller closes it. Only the caller knows whether the write was
        // attempted, so only the caller can decide the overlay is finished.
        const { onImport, onClose } = renderPicker();

        fireEvent.click(cardOf('Sabbath'));
        fireEvent.click(importButton());

        expect(onImport).toHaveBeenCalledWith({ kind: 'idea', id: 12 });
        expect(onClose).not.toHaveBeenCalled();
    });

    test('imports the picked topic', () => {
        const { onImport } = renderPicker();

        fireEvent.click(cardOf('Faith'));
        fireEvent.click(importButton());

        expect(onImport).toHaveBeenCalledWith({ kind: 'topic', id: 1 });
    });

    test('picking a topic after an idea leaves one pick, not two', () => {
        const { onImport } = renderPicker();

        fireEvent.click(cardOf('Covenant renewal'));
        fireEvent.click(cardOf('Faith'));

        expect(cardBoxOf('Covenant renewal')).not.toHaveClass('is-picked');
        expect(cardBoxOf('Faith')).toHaveClass('is-picked');

        fireEvent.click(importButton());
        expect(onImport).toHaveBeenCalledTimes(1);
        expect(onImport).toHaveBeenCalledWith({ kind: 'topic', id: 1 });
    });

    test('a topic is not pickable when only ideas are on offer', () => {
        // The chapter importer's case: PUT /api/chapter-ideas takes ideaIds
        // and a chapter has no topic membership to write.
        const { onImport } = renderPicker({ selectableKinds: ['idea'] });

        fireEvent.click(cardOf('Faith'));

        expect(importButton()).toBeDisabled();
        expect(cardBoxOf('Faith')).not.toHaveClass('is-picked');

        // ...and the click still did its other job.
        expect(cardBoxOf('Faith').closest('.thoughts-cluster')).toHaveClass('is-active');
        expect(onImport).not.toHaveBeenCalled();
    });

    test('Cancel closes without importing', () => {
        const { onImport, onClose } = renderPicker();

        fireEvent.click(cardOf('Faith'));
        fireEvent.click(cancelButton());

        expect(onClose).toHaveBeenCalled();
        expect(onImport).not.toHaveBeenCalled();
    });

    test('Escape closes without importing', () => {
        const { onImport, onClose } = renderPicker();

        fireEvent.click(cardOf('Faith'));
        fireEvent.keyDown(document, { key: 'Escape' });

        expect(onClose).toHaveBeenCalled();
        expect(onImport).not.toHaveBeenCalled();
    });

    test('a note in a fan is never pickable', () => {
        // Topics carry notes as well as ideas — see buildClusters. A note is
        // not importable into anything, so its card must stay inert.
        renderPicker({
            topics: [{ id: 1, name: 'Faith', notes: [{ id: 99, title: 'A note', body: '' }] }],
        });

        fireEvent.click(cardOf('A note'));

        expect(importButton()).toBeDisabled();
        expect(cardBoxOf('A note')).not.toHaveClass('is-picked');
    });

    test('the confirm bar is inside the dialog, not floating over the page', () => {
        renderPicker();

        const dialog = screen.getByRole('dialog', { name: 'Import into this note' });
        expect(within(dialog).getByRole('button', { name: 'Import' })).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npm run test:client -- ImportPicker
```

Expected: FAIL — `Cannot find module './ImportPicker'`.

- [ ] **Step 3: Write the component**

Create `src/client/src/components/Bubbles/ImportPicker.js`:

```js
import React, { useCallback, useState } from 'react';
import BubbleOverlay from './BubbleOverlay';
import TopicIdeaField from './TopicIdeaField';
import { UNTITLED_IDEA_LABEL } from '../Thoughts/TopBar';

// Picking one thing out of the field of bubbles, and confirming it.
//
// ── Why the confirm step exists ────────────────────────────────────────────
//
// The field used to commit on the click: press an idea and it was filed. That
// works while there is one kind of thing to press and one place for it to go.
// It stops working the moment a TOPIC is also pressable, because the two are
// stored in different tables through different endpoints — so a mis-aimed
// click is no longer "the wrong idea", it is a write to somewhere else
// entirely. Holding the pick and confirming it makes the reader's intent
// explicit at the one point where it became ambiguous.
//
// ── One pick, and it carries its kind ──────────────────────────────────────
//
// The pick is a single { kind, id } and picking again replaces it. Not a
// multi-select: importing is one thing at a time, and the bar has to be able
// to name what will happen in one line.
//
// The kind travels WITH the id because ideas and topics number independently —
// idea 1 and topic 1 both exist — so an id alone would be ambiguous both to
// the field, which decides which card to light, and to the caller, which
// decides which endpoint to write.
//
// ── What may be picked is the caller's decision ────────────────────────────
//
// `selectableKinds` exists because the two callers can store different things.
// A note has both an idea membership and a topic membership; a chapter has
// only an idea one, and there is nowhere for a picked topic to go. A kind left
// out is not merely un-clickable — no pick of that kind is ever formed, so the
// card cannot end up picked by any route.
//
// Notes are never selectable. A topic's fan holds its notes beside its ideas
// (see buildClusters), and a note is not importable into anything.

const PROMPT = 'Pick a topic or an idea to import.';

/**
 * The line the confirm bar shows.
 *
 * A function rather than JSX inline, because the phrasing is the whole point
 * of the bar: it has to name WHICH KIND as well as which thing, and the empty
 * case is a prompt rather than a blank. Exported so a caller wanting a
 * different wording has something to read; the tests reach it through the
 * bar's own `role="status"`, which is where a reader meets it.
 */
export const describePick = (pick, topics, ideas) => {
    if (!pick) return PROMPT;

    if (pick.kind === 'topic') {
        const topic = topics.find(item => item.id === pick.id);
        return `Selected: topic “${topic ? topic.name : ''}”`;
    }

    const idea = ideas.find(item => item.id === pick.id);
    return `Selected: idea “${idea ? (idea.title || UNTITLED_IDEA_LABEL) : ''}”`;
};

/**
 * @param label            the dialog's accessible name
 * @param topics           every topic, for the field
 * @param ideas            every idea, each carrying its topics
 * @param selectableKinds  which tiers may be picked: ['idea'] or ['idea','topic']
 * @param onImport         ({ kind, id }) -> void. Does NOT close the picker —
 *                         the caller owns the write, so the caller owns the close
 * @param onClose          what Cancel, Escape and the backdrop do
 */
const ImportPicker = ({
    label,
    topics = [],
    ideas = [],
    selectableKinds = ['idea'],
    onImport,
    onClose,
}) => {
    const [pick, setPick] = useState(null);

    const canPick = useCallback(
        (kind) => selectableKinds.includes(kind),
        [selectableKinds]
    );

    // Guarded at the point the pick is FORMED rather than where it is drawn, so
    // a kind the caller did not offer cannot become picked by any route.
    const pickIdea = useCallback((id) => {
        if (canPick('idea')) setPick({ kind: 'idea', id });
    }, [canPick]);

    const pickTopic = useCallback((id) => {
        if (canPick('topic')) setPick({ kind: 'topic', id });
    }, [canPick]);

    return (
        <BubbleOverlay label={label} onClose={onClose}>
            <div className="bubble-picker">
                <div className="bubble-picker-field">
                    <TopicIdeaField
                        topics={topics}
                        ideas={ideas}
                        pick={pick}
                        onSelectIdea={pickIdea}
                        // Always handed over, so a topic click opens its fan
                        // through the same path whether or not topics are
                        // pickable here; the guard is inside pickTopic.
                        onPickTopic={pickTopic}
                    />
                </div>

                {/* Its own strip rather than a bar floating over the canvas:
                    the field measures the box it is rendered in and lays cards
                    across all of it, so anything overlapping it would cover
                    them. */}
                <div className="bubble-picker-bar">
                    <p className="bubble-picker-pick" role="status">
                        {describePick(pick, topics, ideas)}
                    </p>

                    <div className="bubble-picker-actions">
                        <button
                            type="button"
                            className="bubble-picker-button"
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                        {/* Disabled with nothing picked: a confirm button that
                            confirms nothing teaches the reader it does
                            nothing. */}
                        <button
                            type="button"
                            className="bubble-picker-button bubble-picker-button--primary"
                            disabled={!pick}
                            onClick={() => onImport(pick)}
                        >
                            Import
                        </button>
                    </div>
                </div>
            </div>
        </BubbleOverlay>
    );
};

export default ImportPicker;
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npm run test:client -- ImportPicker
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Style the bar**

Append to `src/client/src/components/Bubbles/Bubbles.css`:

```css
/* ─── The Import Picker ──────────────────────────────────────────────────────
   The field, and a strip under it holding what is picked and the two buttons
   that end the dialog.

   A column rather than a bar laid over the canvas: TopicIdeaField measures the
   box it is rendered in and spreads its cards across the whole of it, so a
   floating bar would sit on top of the bottom row of bubbles. Giving the bar
   its own strip takes that height out of the canvas instead, and the field
   simply lays out in what remains. */

.bubble-picker {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* The field's own box. min-height: 0 is what lets it shrink inside the column
   rather than pushing the bar off the bottom of the overlay. */
.bubble-picker-field {
  flex: 1 1 auto;
  min-height: 0;
}

.bubble-picker-bar {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background-color: var(--ground-raised);
  border-top: 1px solid var(--ground-line);
}

/* Takes the slack so the buttons sit at the far end, and truncates rather than
   wrapping — a long idea title must not make the strip two lines tall and
   shove the field upward as you pick. */
.bubble-picker-pick {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
  color: var(--on-ground-soft);
  font-size: var(--font-base);
}

.bubble-picker-actions {
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-sm);
}

.bubble-picker-button {
  padding: var(--space-xs) var(--space-md);
  background-color: transparent;
  color: var(--on-ground);
  border: 1px solid var(--ground-line);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font: inherit;
}

.bubble-picker-button:hover {
  border-color: var(--gold-lit);
}

.bubble-picker-button--primary {
  background-color: var(--gold);
  color: var(--on-gold, #1a1206);
  border-color: var(--gold);
}

.bubble-picker-button--primary:hover {
  background-color: var(--gold-lit);
  border-color: var(--gold-lit);
}

/* Visibly inert, and actually inert: `disabled` is on the element, this only
   says so. */
.bubble-picker-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.bubble-picker-button:disabled:hover {
  border-color: var(--ground-line);
  background-color: var(--gold);
}
```

- [ ] **Step 6: Check the variables this stylesheet just used actually exist**

```bash
grep -rn "\-\-gold:\|--gold-lit:\|--ground-raised:\|--ground-line:\|--on-ground-soft:\|--on-ground:\|--radius-sm:\|--space-md:" src/client/src/components/Styling/ src/client/src/ --include=*.css | head -20
```

Expected: each name is defined somewhere. `--on-gold` has an inline fallback in the rule, so it may be absent. If any OTHER name is missing, substitute the nearest one that IS defined rather than inventing a variable.

- [ ] **Step 7: Commit**

```bash
git add src/client/src/components/Bubbles/ImportPicker.js \
        src/client/src/components/Bubbles/ImportPicker.test.js \
        src/client/src/components/Bubbles/Bubbles.css
git commit -m "feat: an import picker that confirms one topic or idea"
```

---

## Task 5: The chapter importer switches over

Doing this before the editor proves the picker end to end against the simpler of its two callers.

**Files:**
- Modify: `src/client/src/components/Analyze/NotesPanel.js:1-10, 66-87, 221-235`
- Modify: `src/client/src/components/Analyze/Analyze.test.js` (the `Importing an idea into the chapter` describe, currently from line 1657)

- [ ] **Step 1: Update the tests that will change**

In `src/client/src/components/Analyze/Analyze.test.js`, add a confirm helper beside the existing importer helpers (currently ending around line 505, after `bubble`):

```js
// The confirm step. The overlay holds the pick and writes nothing until this
// is pressed — see ImportPicker.
const confirmImport = () => clickAndSettle(
    within(importerOverlay()).getByRole('button', { name: 'Import' })
);
```

Then replace the test named `clicking an idea imports it into the chapter and closes the overlay` with these two:

```js
    test('picking an idea and confirming imports it into the chapter', async () => {
        // Arrange
        const abiding = addIdea('Abiding');

        await renderAnalyze();
        await waitForPanels();
        await openImporter();

        // Act — the pick alone must write nothing.
        await clickAndSettle(bubble('Abiding'));
        expect(chapterIdeaRequests()).toHaveLength(0);

        await confirmImport();

        // Assert — the whole set, against the chapter the primary panel shows.
        expect(chapterIdeaRequests()).toHaveLength(1);
        expect(chapterIdeaRequests()[0].body).toEqual({ bookId: 1, chapter: 1, ideaIds: [abiding.id] });

        expect(importerOverlay()).toBeNull();
        await waitFor(() => expect(panel('Notes')).toHaveTextContent('Ideas in this chapter'));
        expect(chapterIdeaTitles()).toEqual(['Abiding']);
    });

    test('cancelling the importer writes nothing', async () => {
        // Arrange
        addIdea('Abiding');

        await renderAnalyze();
        await waitForPanels();
        await openImporter();

        // Act
        await clickAndSettle(bubble('Abiding'));
        await clickAndSettle(within(importerOverlay()).getByRole('button', { name: 'Cancel' }));

        // Assert
        expect(chapterIdeaRequests()).toHaveLength(0);
        expect(importerOverlay()).toBeNull();
        expect(store.chapterIdeas).toEqual([]);
    });
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npm run test:client -- Analyze -t "Importing an idea into the chapter"
```

Expected: FAIL — there is no button named `Import` inside the overlay yet; the old overlay commits on the bubble click.

- [ ] **Step 3: Swap the overlay**

In `src/client/src/components/Analyze/NotesPanel.js`, replace the two Bubbles imports at lines 8-9 with one:

```js
import ImportPicker from '../Bubbles/ImportPicker';
```

Replace `handleImport` (lines 84-87) with:

```js
    // Closed before the write rather than after it: the picker's Import button
    // IS the decision, and an overlay that lingered through a round trip would
    // leave the reader looking at a field of bubbles wondering whether it
    // landed. The shortlist behind it fills in when the request returns.
    const handleImport = useCallback((pick) => {
        setIsImporting(false);
        onImportIdea(pick.id);
    }, [onImportIdea]);
```

Replace the overlay block (lines 221-235) with:

```js
            {/* Outside the panel body on purpose: the overlay is fixed to the
                viewport and lays its bubbles across the whole of it, so it is
                no more the body's child than a dialog is.

                Ideas only. PUT /api/chapter-ideas takes ideaIds, and a chapter
                has no topic membership for a picked topic to go into — so a
                topic card here stays what it is on Thoughts, a way to open a
                fan. */}
            {isImporting && (
                <ImportPicker
                    label={`Import an idea into ${heading}`}
                    topics={topics}
                    ideas={ideas}
                    selectableKinds={['idea']}
                    onImport={handleImport}
                    onClose={() => setIsImporting(false)}
                />
            )}
```

Update the file's header comment — its last paragraph currently says the overlay "closes the moment an idea is picked", which stops being true:

```js
// The one thing it does own is whether the importer overlay is open. That is
// not data and it does not leave this panel: nothing else on the page changes
// while it is up, and it closes when the picker's Import is confirmed or the
// reader backs out.
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npm run test:client -- Analyze -t "Importing an idea into the chapter"
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Run the whole Analyze suite**

```bash
npm run test:client -- Analyze
```

Expected: PASS. Nothing else in the file drives the importer.

- [ ] **Step 6: Commit**

```bash
git add src/client/src/components/Analyze/NotesPanel.js \
        src/client/src/components/Analyze/Analyze.test.js
git commit -m "feat: the chapter importer confirms its pick"
```

---

## Task 6: The test harness learns about a note's topics

`NoteFiling` renders `note.topics` and writes `PUT /notes/:id/topics`. Neither exists in the mock API yet, so this lands before the component that needs it.

**Files:**
- Modify: `src/client/src/components/Analyze/Analyze.test.js:47-70` (store), `:121-133` (link helpers), `:177-182` (`hydrate`), `:294-302` (fetch mock)

- [ ] **Step 1: Add `noteTopics` to the store**

In `resetStore`, beside `noteIdeas`:

```js
        ideas: [],
        noteIdeas: [],
        // The note tier's DIRECT edge to topics — note_topics, not the topics
        // a note reaches through an idea. Replaced whole, exactly as the
        // server replaces it.
        noteTopics: [],
```

- [ ] **Step 2: Add the link helpers**

After `ideasOf` (currently ending line 133), add:

```js
// The full-set replace for the note's direct topics, the mirror of
// replaceNoteIdeas. A separate membership: writing one leaves the other alone.
const replaceNoteTopics = (noteId, topicIds) => {
    store.noteTopics = [
        ...store.noteTopics.filter(link => link.noteId !== noteId),
        ...topicIds.map((topicId, index) => ({ noteId, topicId, sortOrder: index })),
    ];
};

const topicsOf = (noteId) => store.noteTopics
    .filter(link => link.noteId === noteId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(link => {
        const topic = store.topics.find(item => item.id === link.topicId);
        return { noteId, id: topic.id, name: topic.name, sortOrder: link.sortOrder };
    });
```

- [ ] **Step 3: Hydrate notes with their topics**

Replace `hydrate` (line 177):

```js
const hydrate = (note) => ({
    ...note,
    references: referencesOf(note.id),
    ideas: ideasOf(note.id),
    topics: topicsOf(note.id),
});
```

- [ ] **Step 4: Add the route**

In the fetch mock, immediately after the `noteIdeas` PUT block (currently ending line 302), add:

```js
    const noteTopics = /\/notes\/(\d+)\/topics$/.exec(url);
    if (noteTopics && method === 'PUT') {
        const noteId = Number(noteTopics[1]);
        if (!store.notes.some(item => item.id === noteId)) {
            return notFound();
        }
        replaceNoteTopics(noteId, body.topicIds);
        return jsonResponse({ note: hydrate(store.notes.find(item => item.id === noteId)) });
    }
```

**Placement matters.** It must sit after the bare `url.endsWith('/topics') && method === 'GET'` check (which it does not conflict with — that one tests GET) and before any generic `/notes/(\d+)$` handler. Directly after the `noteIdeas` block satisfies both.

- [ ] **Step 5: Add a test proving the harness works**

Add this as its own describe, immediately after the `Note editor` describe:

```js
describe('The notes API harness', () => {
    test('a note carries its direct topics, kept apart from its ideas', async () => {
        // Arrange — one note under both an idea and a topic directly. The two
        // are different tables, and a harness that conflated them would let a
        // component that conflates them pass.
        const faith = addTopic('Faith');
        const abiding = addIdea('Abiding');
        const note = addNote({ title: 'The vine' });
        replaceNoteIdeas(note.id, [abiding.id]);
        replaceNoteTopics(note.id, [faith.id]);

        // Act
        await renderAnalyze();
        await waitForPanels();

        // Assert — the two memberships stay apart.
        expect(store.noteTopics).toEqual([{ noteId: note.id, topicId: faith.id, sortOrder: 0 }]);
        expect(store.noteIdeas).toEqual([{ noteId: note.id, ideaId: abiding.id, sortOrder: 0 }]);
    });
});
```

- [ ] **Step 6: Run the suite**

```bash
npm run test:client -- Analyze
```

Expected: PASS. Adding `topics` to every note payload changes nothing that is currently rendered.

- [ ] **Step 7: Commit**

```bash
git add src/client/src/components/Analyze/Analyze.test.js
git commit -m "test: the notes harness carries a note's direct topics"
```

---

## Task 7: `setNoteTopics` and `handleSaveTopics`

**Files:**
- Modify: `src/client/src/components/Analyze/useNotes.js:86-112`
- Modify: `src/client/src/components/Analyze/Analyze.js:222-227, 391`
- Modify: `src/client/src/components/Analyze/NotesPanel.js:62, 140`
- Modify: `src/client/src/components/Analyze/NoteEditor.js:25`

- [ ] **Step 1: Add the write to `useNotes`**

In `src/client/src/components/Analyze/useNotes.js`, after `setNoteIdeas` (line 94), add:

```js
    // The note's complete DIRECT topic set, replaced in one call — the mirror
    // of setNoteIdeas above, and a separate membership from it. A note may sit
    // under a topic directly, under an idea that sits under that topic, or
    // both; writing this one leaves the idea set alone.
    const setNoteTopics = useCallback((noteId, topicIds) => run(
        () => fetchJson(`/notes/${noteId}/topics`, { method: 'PUT', body: { topicIds } })
            .then(data => data.note)
    ), [run]);
```

and add it to the returned object, after `setNoteIdeas`:

```js
        setNoteIdeas,
        setNoteTopics,
    };
```

- [ ] **Step 2: Add the handler to `Analyze`**

In `src/client/src/components/Analyze/Analyze.js`, after `handleSaveIdeas` (line 227), add:

```js
    // The topic tier's copy of handleSaveIdeas, retained for the same reason:
    // the response is the freshest copy of the note and the list refetch that
    // follows has not landed yet.
    const handleSaveTopics = useCallback(async (noteId, topicIds) => {
        const note = await notes.setNoteTopics(noteId, topicIds);
        if (note) {
            retain(note);
        }
    }, [notes, retain]);
```

Pass it down in the `NotesPanel` element, beside `onSaveIdeas` (line 391):

```js
                            onSaveIdeas={handleSaveIdeas}
                            onSaveTopics={handleSaveTopics}
```

- [ ] **Step 3: Thread it through `NotesPanel` to `NoteEditor`**

In `src/client/src/components/Analyze/NotesPanel.js`, add `onSaveTopics` to the destructured props after `onSaveIdeas` (line 62):

```js
    onSaveIdeas,
    onSaveTopics,
}) => {
```

and pass it to `NoteEditor` after `onSaveIdeas` (line 140):

```js
                        onSaveIdeas={onSaveIdeas}
                        onSaveTopics={onSaveTopics}
```

In `src/client/src/components/Analyze/NoteEditor.js`, add it to the destructure after `onSaveIdeas` (line 25):

```js
    onSaveIdeas,
    onSaveTopics,
```

It is unused for one commit — Task 8 renders it. That is deliberate: the wiring and the component that consumes it are separate reviewable changes.

- [ ] **Step 4: Run the suite**

```bash
npm run test:client -- Analyze
```

Expected: PASS. Nothing calls the new prop yet.

- [ ] **Step 5: Commit**

```bash
git add src/client/src/components/Analyze/useNotes.js \
        src/client/src/components/Analyze/Analyze.js \
        src/client/src/components/Analyze/NotesPanel.js \
        src/client/src/components/Analyze/NoteEditor.js
git commit -m "feat: the page can replace a note's direct topic set"
```

---

## Task 8: `NoteFiling` replaces the multi-select

The one task where behaviour visibly changes. The old checkbox tests are rewritten in this same commit so the suite is never red.

**Files:**
- Create: `src/client/src/components/Analyze/NoteFiling.js`
- Modify: `src/client/src/components/Analyze/NoteEditor.js:1-4, 17-27, 169-187`
- Modify: `src/client/src/components/Analyze/NotesPanel.js:135`
- Modify: `src/client/src/components/Styling/Analyze.css`
- Modify: `src/client/src/components/Analyze/Analyze.test.js` (`Linking a note to ideas`, from line 1552)
- Delete: `src/client/src/components/Analyze/MultiSelect.js`, `MultiSelect.test.js`

- [ ] **Step 1: Rewrite the failing tests**

In `src/client/src/components/Analyze/Analyze.test.js`, replace the ENTIRE `describe('Linking a note to ideas', ...)` block with:

```js
// ─── Filing an open note ────────────────────────────────────────────────────
//
// The editor files a note through the same field of bubbles the chapter
// importer uses, and it can file under a TOPIC as well as an idea. The two are
// separate memberships written to separate endpoints, so the assertions that
// matter are the ones proving a write to one leaves the other alone.
describe('Filing a note under ideas and topics', () => {
    const openFirstNote = async () => {
        await waitFor(() => expect(noteRows().length).toBeGreaterThan(0));
        await clickAndSettle(noteRows()[0]);
    };

    const ideaLinkRequests = () =>
        requestsMatching(r => r.method === 'PUT' && /\/notes\/\d+\/ideas$/.test(r.url));

    const topicLinkRequests = () =>
        requestsMatching(r => r.method === 'PUT' && /\/notes\/\d+\/topics$/.test(r.url));

    // The rows the editor lists, by the titles they print.
    const filedTitles = () => Array.from(
        panel('Notes').querySelectorAll('.analyze-filing-title')
    ).map(row => row.textContent);

    const openFiler = () => clickAndSettle(
        within(panel('Notes')).getByRole('button', { name: 'Import' })
    );

    const unfile = (name) => clickAndSettle(
        within(panel('Notes')).getByRole('button', { name: `Unfile ${name} from this note` })
    );

    test('lists the ideas and the topics the note is filed under', async () => {
        // Arrange
        const faith = addTopic('Faith');
        const abiding = addIdea('Abiding');
        addIdea('Pruning');
        const note = addNote({ title: 'The vine',
                               reference: { bookId: 1, chapter: 1, startVerse: 1, endVerse: 1 } });
        replaceNoteIdeas(note.id, [abiding.id]);
        replaceNoteTopics(note.id, [faith.id]);

        // Act
        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Assert — what it holds, and nothing it does not. "Pruning" exists
        // and is not listed, because this is the note's filing, not a picker.
        expect(filedTitles()).toEqual(['Abiding', 'Faith']);
        expect(panel('Notes')).not.toHaveTextContent('Pruning');
    });

    test('marks which rows are topics', async () => {
        // The × means different things on the two and goes to different
        // endpoints, so a flat list that hid the difference would be a list
        // whose buttons cannot be told apart.
        const faith = addTopic('Faith');
        const note = addNote({ title: 'The vine' });
        replaceNoteTopics(note.id, [faith.id]);

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        expect(within(panel('Notes')).getByText('topic')).toBeInTheDocument();
    });

    test('importing an idea PUTs the note\'s ideas plus that one', async () => {
        // Arrange
        const abiding = addIdea('Abiding');
        const pruning = addIdea('Pruning');
        const note = addNote({ title: 'The vine' });
        replaceNoteIdeas(note.id, [abiding.id]);

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Act
        await openFiler();
        await clickAndSettle(bubble('Pruning'));
        await confirmImport();

        // Assert — the complete set, in the order the note holds it.
        expect(ideaLinkRequests()).toHaveLength(1);
        expect(ideaLinkRequests()[0].body).toEqual({ ideaIds: [abiding.id, pruning.id] });
        expect(topicLinkRequests()).toHaveLength(0);
        await waitFor(() => expect(filedTitles()).toEqual(['Abiding', 'Pruning']));
    });

    test('importing a topic PUTs the note\'s topics and leaves its ideas alone', async () => {
        // Arrange
        const faith = addTopic('Faith');
        const abiding = addIdea('Abiding');
        const note = addNote({ title: 'The vine' });
        replaceNoteIdeas(note.id, [abiding.id]);

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Act
        await openFiler();
        await clickAndSettle(bubble('Faith'));
        await confirmImport();

        // Assert — the topic set was written, the idea set was not touched.
        expect(topicLinkRequests()).toHaveLength(1);
        expect(topicLinkRequests()[0].body).toEqual({ topicIds: [faith.id] });
        expect(ideaLinkRequests()).toHaveLength(0);
        expect(store.noteIdeas).toEqual([{ noteId: note.id, ideaId: abiding.id, sortOrder: 0 }]);
        await waitFor(() => expect(filedTitles()).toEqual(['Abiding', 'Faith']));
    });

    test('unfiling an idea sends the set without it and leaves the topics', async () => {
        // Arrange
        const faith = addTopic('Faith');
        const abiding = addIdea('Abiding');
        const note = addNote({ title: 'The vine' });
        replaceNoteIdeas(note.id, [abiding.id]);
        replaceNoteTopics(note.id, [faith.id]);

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Act
        await unfile('Abiding');

        // Assert — a note under no idea is a legal state, so this is a normal
        // save, and the topic membership is untouched.
        expect(ideaLinkRequests()[0].body).toEqual({ ideaIds: [] });
        expect(store.noteTopics).toEqual([{ noteId: note.id, topicId: faith.id, sortOrder: 0 }]);
        await waitFor(() => expect(filedTitles()).toEqual(['Faith']));
    });

    test('unfiling a topic sends the set without it and leaves the ideas', async () => {
        // Arrange
        const faith = addTopic('Faith');
        const abiding = addIdea('Abiding');
        const note = addNote({ title: 'The vine' });
        replaceNoteIdeas(note.id, [abiding.id]);
        replaceNoteTopics(note.id, [faith.id]);

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Act
        await unfile('Faith');

        // Assert
        expect(topicLinkRequests()[0].body).toEqual({ topicIds: [] });
        expect(store.noteIdeas).toEqual([{ noteId: note.id, ideaId: abiding.id, sortOrder: 0 }]);
        await waitFor(() => expect(filedTitles()).toEqual(['Abiding']));
    });

    test('the link survives a round trip to the server, not just the click', async () => {
        // Arrange
        const abiding = addIdea('Abiding');
        addNote({ title: 'The vine' });

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Act — file it, close the editor, open it again from the list.
        await openFiler();
        await clickAndSettle(bubble('Abiding'));
        await confirmImport();
        await clickAndSettle(within(panel('Notes')).getByRole('button', { name: '← All notes' }));
        await openFirstNote();

        // Assert — it is listed because the server said so.
        expect(store.noteIdeas).toEqual([{ noteId: 1, ideaId: abiding.id, sortOrder: 0 }]);
        expect(filedTitles()).toEqual(['Abiding']);
    });

    test('importing something the note already holds writes nothing', async () => {
        // Arrange
        const abiding = addIdea('Abiding');
        const note = addNote({ title: 'The vine' });
        replaceNoteIdeas(note.id, [abiding.id]);

        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Act
        await openFiler();
        await clickAndSettle(bubble('Abiding'));
        await confirmImport();

        // Assert — a PUT storing what is already stored is a round trip spent
        // redrawing the same list.
        expect(ideaLinkRequests()).toHaveLength(0);
        expect(filedTitles()).toEqual(['Abiding']);
    });

    test('says so when the note is filed under nothing, and still offers Import', async () => {
        // Arrange
        addNote({ title: 'The vine' });

        // Act
        await renderAnalyze();
        await waitForPanels();
        await openFirstNote();

        // Assert
        expect(filedTitles()).toEqual([]);
        expect(panel('Notes')).toHaveTextContent('Not filed under anything yet');
        expect(within(panel('Notes')).getByRole('button', { name: 'Import' })).toBeInTheDocument();
    });
});
```

Also fix the one assertion in the chapter-import describe that still queries a checkbox. In the test named `removing an import leaves the idea itself, still offerable in the editor`, replace its final two lines:

```js
        await clickAndSettle(noteRows()[0]);
        await clickAndSettle(within(panel('Notes')).getByRole('button', { name: 'Import' }));
        expect(bubble('Abiding')).toBeInTheDocument();
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npm run test:client -- Analyze -t "Filing a note under ideas and topics"
```

Expected: FAIL — there is no button named `Import` in the editor and no `.analyze-filing-title` rows.

- [ ] **Step 3: Write `NoteFiling`**

Create `src/client/src/components/Analyze/NoteFiling.js`:

```js
import React, { useCallback, useState } from 'react';
import ImportPicker from '../Bubbles/ImportPicker';
import { withMember, withoutMember } from './noteFiling';

// What an open note is filed under, and the way to change it.
//
// ── Two memberships, not one list ──────────────────────────────────────────
//
// A note sits under ideas and, separately, under topics. They are different
// tables behind different endpoints, and either may be empty while the other
// is not. So the rows below say which kind each one is: the × on an idea row
// and the × on a topic row look identical and write to different places, and a
// list that hid the difference would be a list whose buttons cannot be told
// apart.
//
// ── Why a picker and not a checkbox list ───────────────────────────────────
//
// This section used to be every idea in the corpus as a checkbox, which is a
// list that grows without bound and cannot express topics at all. It is now
// the note's own filing — short, and only what is true — with the whole corpus
// one press of Import away, in the same field of bubbles the chapter importer
// opens.
//
// ── Adding is a whole-set write ────────────────────────────────────────────
//
// Both endpoints REPLACE the membership, so importing sends what the note
// already has plus the new id and unfiling sends it minus one. That arithmetic
// is in noteFiling.js, shared by all four paths through here. Importing
// something already held sends nothing at all: withMember returns the same
// array, and a PUT storing what is stored is a round trip for no change.

export const EMPTY_MESSAGE = 'Not filed under anything yet.';

/** The unfile button's accessible name. Carries the title, because the section draws several. */
export const unfileLabelFor = (title) => `Unfile ${title} from this note`;

/**
 * @param note          the open note, carrying `ideas` and `topics`
 * @param topics        every topic, for the picker's field
 * @param ideas         every idea, each carrying its topics
 * @param onSaveIdeas   (noteId, ideaIds) -> void; replaces the whole idea set
 * @param onSaveTopics  (noteId, topicIds) -> void; replaces the whole topic set
 */
const NoteFiling = ({ note, topics, ideas, onSaveIdeas, onSaveTopics }) => {
    // Whether the overlay is up is this section's business and leaves it —
    // the same rule NotesPanel follows for the chapter importer.
    const [isImporting, setIsImporting] = useState(false);

    const ideaIds = note.ideas.map(idea => idea.id);
    const topicIds = note.topics.map(topic => topic.id);

    const handleImport = useCallback((pick) => {
        setIsImporting(false);

        if (pick.kind === 'topic') {
            const next = withMember(topicIds, pick.id);
            // Referentially equal means the note already holds it — see
            // withMember. Nothing to send.
            if (next !== topicIds) onSaveTopics(note.id, next);
            return;
        }

        const next = withMember(ideaIds, pick.id);
        if (next !== ideaIds) onSaveIdeas(note.id, next);
    }, [note.id, ideaIds, topicIds, onSaveIdeas, onSaveTopics]);

    // Ideas first, then topics — the order the two memberships are written in
    // everywhere else on the page, and the order the editor used to offer them.
    const rows = [
        ...note.ideas.map(idea => ({
            key: `idea-${idea.id}`,
            kind: 'idea',
            title: idea.title,
            onUnfile: () => onSaveIdeas(note.id, withoutMember(ideaIds, idea.id)),
        })),
        ...note.topics.map(topic => ({
            key: `topic-${topic.id}`,
            kind: 'topic',
            title: topic.name,
            onUnfile: () => onSaveTopics(note.id, withoutMember(topicIds, topic.id)),
        })),
    ];

    return (
        <section className="analyze-editor-filing">
            <h4 className="analyze-picker-heading">Ideas &amp; topics</h4>

            {rows.length === 0 && <p className="analyze-message">{EMPTY_MESSAGE}</p>}

            <ul className="analyze-filing-list">
                {rows.map(row => (
                    <li key={row.key} className="analyze-filing-row">
                        <span className="analyze-filing-title">{row.title}</span>
                        {/* Only on topics. An unmarked row is an idea, which is
                            the common case and does not need saying twice. */}
                        {row.kind === 'topic' && (
                            <span className="analyze-filing-kind">topic</span>
                        )}
                        <button
                            type="button"
                            className="analyze-filing-remove"
                            onClick={row.onUnfile}
                            aria-label={unfileLabelFor(row.title)}
                        >
                            ×
                        </button>
                    </li>
                ))}
            </ul>

            <button
                type="button"
                className="analyze-editor-button"
                onClick={() => setIsImporting(true)}
            >
                Import
            </button>

            {/* Both kinds, unlike the chapter importer: a note has an idea
                membership AND a topic membership, and this is the only place
                on the page that can write the second. */}
            {isImporting && (
                <ImportPicker
                    label={`Import into ${note.title}`}
                    topics={topics}
                    ideas={ideas}
                    selectableKinds={['idea', 'topic']}
                    onImport={handleImport}
                    onClose={() => setIsImporting(false)}
                />
            )}
        </section>
    );
};

export default NoteFiling;
```

- [ ] **Step 4: Swap it into `NoteEditor`**

In `src/client/src/components/Analyze/NoteEditor.js`, replace the `MultiSelect` import (line 4):

```js
import NoteFiling from './NoteFiling';
```

Replace `ideaGroups` in the destructure (line 20) with `topics` and `ideas`:

```js
    note,
    books,
    topics,
    ideas,
    onSave,
```

Replace the whole `<section className="analyze-editor-ideas">` block (lines 169-187) with:

```js
            <NoteFiling
                note={note}
                topics={topics}
                ideas={ideas}
                onSaveIdeas={onSaveIdeas}
                onSaveTopics={onSaveTopics}
            />
```

In `src/client/src/components/Analyze/NotesPanel.js`, change what it hands the editor — replace `ideaGroups={ideaGroups}` (line 135) with:

```js
                        topics={topics}
                        ideas={ideas}
```

- [ ] **Step 5: Style the rows**

In `src/client/src/components/Styling/Analyze.css`, after the `.analyze-reference-remove` rule, add:

```css
/* ─── The editor's filing ────────────────────────────────────────────────────
   What the open note is filed under: its ideas, then its topics. Shaped like
   the reference list above it, because it is the same kind of thing — a short
   list of what this note is attached to, each row with a way off. */

.analyze-filing-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin: 0 0 var(--space-sm);
  padding: 0;
  list-style: none;
}

.analyze-filing-row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 2px var(--space-xs);
  border: var(--analyze-border-width) solid var(--ground-line);
  border-radius: var(--radius-sm);
}

/* Takes the slack so the × sits at the far end, and truncates rather than
   wrapping the row onto a second line. */
.analyze-filing-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Quiet, and only on topics — an unmarked row is an idea. */
.analyze-filing-kind {
  flex: 0 0 auto;
  color: var(--gold-lit);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.analyze-filing-remove {
  flex: 0 0 auto;
  padding: 0 var(--space-xs);
  background: none;
  border: none;
  color: var(--on-ground-soft);
  cursor: pointer;
  font-size: var(--font-base);
  line-height: 1;
}

.analyze-filing-remove:hover {
  color: var(--gold-lit);
}
```

- [ ] **Step 6: Delete the multi-select**

```bash
git rm src/client/src/components/Analyze/MultiSelect.js \
       src/client/src/components/Analyze/MultiSelect.test.js
```

- [ ] **Step 7: Run the suite**

```bash
npm run test:client -- Analyze
```

Expected: PASS, the whole file.

- [ ] **Step 8: Commit**

```bash
git add src/client/src/components/Analyze/NoteFiling.js \
        src/client/src/components/Analyze/NoteEditor.js \
        src/client/src/components/Analyze/NotesPanel.js \
        src/client/src/components/Analyze/Analyze.test.js \
        src/client/src/components/Styling/Analyze.css
git commit -m "feat: the editor files a note through the import picker"
```

---

## Task 9: Remove `groupIdeaOptions` and the `ideaGroups` chain

Dead the moment `MultiSelect` went. Its own commit so the deletion is reviewable apart from the behaviour change.

**Files:**
- Modify: `src/client/src/components/Analyze/chapterIdeas.js:1-12, 57-85`
- Modify: `src/client/src/components/Analyze/chapterIdeas.test.js:1-10, 80-122`
- Modify: `src/client/src/components/Analyze/Analyze.js:17, 140, 378`
- Modify: `src/client/src/components/Analyze/NotesPanel.js:49`
- Modify: `src/client/src/components/Analyze/Analyze.test.js`

- [ ] **Step 1: Prove it is dead**

```bash
grep -rn "groupIdeaOptions\|ideaGroups\|MultiSelect\|IN_CHAPTER_HEADING\|OTHER_IDEAS_HEADING" src/client/src/components/
```

Expected: hits only in `chapterIdeas.js`, `chapterIdeas.test.js`, `Analyze.js`, and `NotesPanel.js` — every one a definition or a pass-through, none a render. If anything else appears, stop and read it before deleting.

- [ ] **Step 2: Strip `chapterIdeas.js`**

Delete `IN_CHAPTER_HEADING`, `OTHER_IDEAS_HEADING`, `toOption`, and `groupIdeaOptions` entirely — lines 9-12, and everything from line 57 (`// The picker's shape:`) through the end of `groupIdeaOptions`.

Then replace the file's header comment, which currently promises two things:

```js
// Which ideas belong to the chapter under study.
//
// A pure derivation over lists Analyze already holds, and needed in one place
// — the panel's "Ideas in this chapter" section. It lives here rather than
// inline because it is a judgement about what belongs to a chapter, not about
// how a list is drawn.
//
// It used to have a companion, groupIdeaOptions, which ordered the note
// editor's picker with this chapter's ideas first. That picker is now a field
// of bubbles laid out by TOPIC, and a chapter is not a topic — there is no
// cell in that field for "here". The ordering went with it deliberately; the
// shortlist below is still where a chapter's own ideas are seen.
```

- [ ] **Step 3: Strip its tests**

In `src/client/src/components/Analyze/chapterIdeas.test.js`, delete the whole `describe('groupIdeaOptions', ...)` block (lines 80-122) and narrow the import at the top to:

```js
import { collectChapterIdeas } from './chapterIdeas';
```

If `IN_CHAPTER_HEADING` or `OTHER_IDEAS_HEADING` are imported there too, remove them.

- [ ] **Step 4: Strip the prop chain**

In `src/client/src/components/Analyze/Analyze.js`:

- Line 17 — narrow the import: `import { collectChapterIdeas } from './chapterIdeas';`
- Line 140 — delete `const ideaGroups = groupIdeaOptions(ideas, chapterIdeaList);`
- Line 378 — delete `ideaGroups={ideaGroups}`

In `src/client/src/components/Analyze/NotesPanel.js`, line 49 — delete `ideaGroups,` from the destructure.

- [ ] **Step 5: Delete the test that asserted the lost ordering**

In `src/client/src/components/Analyze/Analyze.test.js`, delete the test named `the editor offers this chapter's ideas first, with the rest below` in its entirety. It asserts the ordering the spec records as an accepted regression, and `.analyze-multiselect-option` no longer exists.

- [ ] **Step 6: Confirm it is gone**

```bash
grep -rn "groupIdeaOptions\|ideaGroups\|MultiSelect\|analyze-multiselect" src/client/src/components/
```

Expected: no output.

- [ ] **Step 7: Run the whole client suite**

```bash
npm run test:client
```

Expected: PASS, every suite.

- [ ] **Step 8: Commit**

```bash
git add -A src/client/src/components/
git commit -m "refactor: drop the multi-select's option grouping"
```

---

## Task 10: Verify in the browser

Tests do not catch a confirm bar sitting on top of the bottom row of bubbles, or a picked card that is invisible against an open one.

**Prerequisites:** MySQL on 3306, the API on 3001 (`node src/server.js` from the repo root if nothing is listening), and the client on 3000 (`npm run client`).

Seeded account: `phase6e@example.test` / `Verify6ePhase!`. Log in with `POST /api/auth/login` and put the token in `localStorage.token`.

- [ ] **Step 1: Open a note that already carries both kinds**

Go to `http://localhost:3000/analyze?l=1.15&note=298`. Note 298 "Justified by faith" holds idea 13 and topic 9.

Expected: the editor's **Ideas & topics** section lists `Faith as a thread` and `Faith`, the second marked `topic`, each with an ×.

- [ ] **Step 2: Import a topic onto the note**

Press **Import**. Click a topic card. Press **Import** in the bar.

Expected: the bar named the topic and its kind before you confirmed; the overlay closed; the topic appears in the list marked `topic`.

Verify the server agrees:

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"phase6e@example.test","password":"Verify6ePhase!"}' \
  | sed -E 's/.*"token":"([^"]+)".*/\1/')
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/notes/298 \
  | python3 -c "import json,sys; n=json.load(sys.stdin)['note']; print('ideas:', [i['title'] for i in n['ideas']]); print('topics:', [t['name'] for t in n['topics']])"
```

Expected: the new topic in `topics`, and `ideas` unchanged.

- [ ] **Step 3: Check the two states are distinguishable**

With the picker open, click a topic — it is now both picked and spotlit, since clicking opened its fan.

Expected: the gold ring is legible against the white spotlit card. If it is not, adjust `.thoughts-bubble.is-picked` in Thoughts.css and re-check. This is the one visual risk in the change.

- [ ] **Step 4: Check the bar does not cover the field**

Expected: no bubble sits under the confirm bar, and the bottom row of the field is fully visible. The field measures its own box, so it should have laid out in the space above the bar.

- [ ] **Step 5: Undo the verification write**

Restore note 298 to the one topic it started with (topic 9, `Faith`):

```bash
curl -s -X PUT http://localhost:3001/api/notes/298/topics \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"topicIds":[9]}' \
  | python3 -c "import json,sys; print([t['name'] for t in json.load(sys.stdin)['note']['topics']])"
```

Expected: `['Faith']`.

- [ ] **Step 6: Check the chapter importer still works**

Press **← All notes**, then **Import idea**. Click a topic card.

Expected: its fan opens and **Import** stays disabled — a topic is not importable into a chapter. Click an idea, press **Import**: it appears under *Ideas in this chapter* with an ×. Press that × to undo it, and confirm with:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/chapter-ideas?bookId=1&chapter=15"
```

Expected: `{"ideas":[]}`.

**Browser-driving note:** this pane's coordinate mapping is off by roughly 10%, so `computer` clicks land short and can hit the wrong card — which is how a stray import gets written. Click by dispatching events on the element instead, and open a fan with `pointerover`/`mouseover` on `.thoughts-cluster` rather than by hovering a coordinate.

- [ ] **Step 7: Commit anything the verification changed**

If Step 3 needed a styling adjustment:

```bash
git add src/client/src/components/Styling/Thoughts.css
git commit -m "fix: a picked bubble reads against a spotlit one"
```

---

## Done when

- [ ] `npm run test:client` passes every suite
- [ ] `grep -rn "MultiSelect\|groupIdeaOptions\|ideaGroups" src/client/src/components/` returns nothing
- [ ] The editor files a note under an idea AND under a topic, confirmed against `GET /api/notes/298`
- [ ] The chapter importer refuses a topic and still imports an idea
- [ ] The Thoughts page is unchanged — `npm run test:client -- Thoughts` passes, and a topic click there still only opens its fan
