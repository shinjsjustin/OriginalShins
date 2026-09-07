# The Import Picker — Design

Date: 2026-09-06
Status: approved in brainstorming session

## Summary

The Analyze page's note editor stops filing a note through a checkbox list of
every idea in the corpus, and starts filing it through the same field of
bubbles the chapter importer already uses. The field gains a selection and a
confirm step: you pick one card, press **Import**, and that one thing is filed.

Two things follow. A note can now be filed under a **topic** directly from
this page — the edge and its endpoint already exist and nothing on Analyze
reached them. And the chapter importer adopts the same confirm step, so one
overlay does not behave two ways.

No server work. `PUT /api/notes/:id/topics` was built by the notes↔topics
change and `GET /api/notes` already returns each note's `topics`; this design
is the client catching up to them.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Does the chapter importer survive? | **Yes, unchanged in purpose.** It keeps its button in the list view and keeps targeting the chapter. The editor gains a *second* importer targeting the open note. |
| Selection model | **One at a time, exclusive.** Picking a card replaces the previous pick. Import commits that one thing, and the overlay goes away. Not a multi-pick batch. |
| Does the chapter importer get the confirm step too? | **Yes.** One component, one interaction. It differs only in which kinds it will let you select. |
| What is selectable | Chapter importer: ideas. Note importer: ideas and topics. **Never notes**, in either — the fan holds note cards and they stay inert. |
| How Import writes | Through the existing whole-set endpoints: send `current + one`. Unfiling sends `current − one`. No add-one/remove-one endpoints are added. |
| Unfiling | An × beside each filed idea and topic in the editor, the way references already work. |
| The multi-select | **Deleted**, along with `groupIdeaOptions` and the `ideaGroups` prop chain. |

## Non-goals

- No change to any route, table, or payload. The server is untouched.
- No multi-pick. One card, one Import.
- No new way to *create* an idea or topic from the picker. `+ New idea` stays
  where it is, and topics are still made on Thoughts.
- No change to the Thoughts page's use of `TopicIdeaField`. Selection arrives
  as optional props, and absent props mean the field behaves exactly as it does
  there today.
- No note-tier selection. A note card in a fan is not importable into anything.

## 1. `ImportPicker` — the overlay, the field, the pick, the bar

New file `src/client/src/components/Bubbles/ImportPicker.js`. It sits beside
`BubbleOverlay` and `TopicIdeaField` because it is built from them, and it is
the only thing either caller mounts.

```jsx
<ImportPicker
  label="Import into this note"
  topics={topics}
  ideas={ideas}
  selectableKinds={['idea', 'topic']}
  onImport={pick => …}   // pick = { kind: 'idea' | 'topic', id }
  onClose={() => …}
/>
```

It owns exactly one piece of state: the pick, `{ kind, id } | null`. Both
callers are therefore free of selection state, and the two importers cannot
drift apart in how picking feels.

The confirm bar is a footer inside the overlay:

```
┌──────────────────────────────────────────┐
│  Selected: idea “Faith as a thread”      │
│                     [ Cancel ] [ Import ]│
└──────────────────────────────────────────┘
```

- **Import** is disabled while the pick is `null`. A confirm button that
  confirms nothing is a button that teaches the reader it does nothing.
- The bar states what is picked, and names its kind. "Faith" is a topic and
  "Faith as a thread" is an idea, and on this page the difference decides which
  endpoint is written — so the bar says which it is rather than leaving the
  reader to infer it from a card's colour.
- With no pick, the bar reads as a prompt rather than going blank, so the
  reader is told what to do rather than shown an empty strip.
- **Cancel** is `onClose`, the same as Escape and a backdrop click. It exists
  because the overlay now has a committing button, and a committing button
  with no visible way out reads as a trap.

`onImport` fires with the pick and the picker does **not** close itself — the
caller closes it, exactly as `NotesPanel` closes today before its write. The
close belongs to whoever owns the write, because only they know whether it was
attempted.

## 2. `TopicIdeaField` — selection as optional props

The field is shared with Thoughts, which has no selection. So selection arrives
the way pinning already does: optional props, absent by default, and absent
means the feature is not there at all rather than wired to a no-op.

Added props:

| Prop | Meaning |
|---|---|
| `pick` | `{ kind, id } \| null` — which card is drawn as picked |
| `onPickTopic` | `(topicId) => void`. Optional. Absent → topic cards are not selectable |
| `onSelectIdea` | Already exists. The importer now picks with it instead of committing |

A topic card's click does two things: it picks the topic **and** it opens its
fan, which is `bloom.onAnchorClick` as today. These do not conflict — the fan is
how you reach the topic's ideas, and wanting to look inside a topic is not
evidence against wanting to file under it. Picking a fanned idea afterwards
simply replaces the pick.

When `onPickTopic` is absent the topic card keeps its current behaviour exactly:
click opens the fan and nothing is picked.

### `isPicked` on `BubbleCard`

`BubbleCard`'s existing `isSelected` already means *the spotlit card* — the
topic whose fan is open. Picked is a different fact about a card and needs a
different mark, so `BubbleCard` gains `isPicked` → `.is-picked`, styled in
Thoughts.css as an accent ring.

This was confirmed against the running page: with a fan open, its topic is
already drawn white and lifted. Expressing "chosen" as a shade of the same
treatment would make the two unreadable together, and a picked topic with an
open fan is the common case, not the edge one.

## 3. The note editor's filing section

`NoteEditor` is already carrying two modes, a reference list, and filing. The
filing section is extracted to `src/client/src/components/Analyze/NoteFiling.js`
rather than grown in place.

```
Ideas & topics
  · Faith as a thread          ×
  · Faith            (topic)   ×
  [ Import ]
```

- Rows come from `note.ideas` and `note.topics`, both already on the note.
- A topic row is marked as a topic. The two lists are different memberships
  written to different endpoints, and a flat list that hid which was which
  would make the × ambiguous.
- **Import** opens `ImportPicker` with `selectableKinds={['idea', 'topic']}`.
  `NoteFiling` owns the `isImporting` boolean, the way `NotesPanel` owns its
  own — whether an overlay is up is that section's business and leaves it.
- With nothing filed, the section says so and still offers Import.

### Writes

Both memberships are replaced whole, so every write is set arithmetic on what
the note already carries:

| Action | Call |
|---|---|
| Import an idea | `onSaveIdeas(note.id, [...ideaIds, picked])` |
| Import a topic | `onSaveTopics(note.id, [...topicIds, picked])` |
| × an idea | `onSaveIdeas(note.id, ideaIds without id)` |
| × a topic | `onSaveTopics(note.id, topicIds without id)` |

Importing something the note already carries writes nothing, the way
`useChapterIdeas.importIdea` already declines a no-op PUT.

The four lines of set arithmetic live in
`src/client/src/components/Analyze/noteFiling.js` as two pure functions,
`withMember` and `withoutMember`, tested on their own. Written inline they
would be four near-identical spreads and filters across two memberships, which
is how an add and a remove come to disagree.

### `useNotes` gains `setNoteTopics`

A mirror of `setNoteIdeas`, through the same `run` wrapper so it bumps
`revision` and surfaces its own failure:

```js
const setNoteTopics = useCallback((noteId, topicIds) => run(
    () => fetchJson(`/notes/${noteId}/topics`, { method: 'PUT', body: { topicIds } })
        .then(data => data.note)
), [run]);
```

`Analyze` gains `handleSaveTopics` beside `handleSaveIdeas`, retaining the
returned note for the same reason: the response is the freshest copy and the
list refetch has not landed.

## 4. The chapter importer

`NotesPanel` keeps its "Import idea" button and its `isImporting` state. Its
overlay becomes:

```jsx
<ImportPicker
  label={`Import an idea into ${heading}`}
  topics={topics}
  ideas={ideas}
  selectableKinds={['idea']}
  onImport={pick => { setIsImporting(false); onImportIdea(pick.id); }}
  onClose={() => setIsImporting(false)}
/>
```

Topics are not selectable here because `PUT /api/chapter-ideas` takes
`ideaIds` and a chapter has no topic membership to write. Topic cards stay
openers, which is what they are on Thoughts too.

## 5. Deletions

| File / export | Why it goes |
|---|---|
| `Analyze/MultiSelect.js` | Its only consumer was the editor's idea picker |
| `Analyze/MultiSelect.test.js` | With it |
| `groupIdeaOptions`, `IN_CHAPTER_HEADING`, `OTHER_IDEAS_HEADING` in `chapterIdeas.js` | Shaped options for `MultiSelect` alone |
| `groupIdeaOptions` tests in `chapterIdeas.test.js` | With it |
| `ideaGroups` prop: `Analyze` → `NotesPanel` → `NoteEditor` | Nothing renders it |

`collectChapterIdeas` **stays** — the panel's "Ideas in this chapter" section
still reads it.

### Accepted regression

`groupIdeaOptions` put the chapter's own ideas at the top of the picker under
*In this chapter*, on the reasoning that a note written here is usually filed
under one of them. A field laid out by topic has nowhere to express that: the
chapter is not a topic, and there is no cell for it.

This is accepted, not overlooked. The shortlist stays visible in the list view;
it just no longer shapes the picker's order.

## 6. Styling

| Where | What |
|---|---|
| `Bubbles.css` | The confirm bar — a footer strip over the blur, its buttons, and the disabled state |
| `Thoughts.css` | `.is-picked` on `.thoughts-bubble`, an accent ring distinct from `.is-selected` |
| `Analyze.css` | The editor's filing rows and their ×, following `.analyze-reference` |

The bar must not overlap the field's bottom row. The field measures the box it
is rendered in, so the bar takes its own strip of the overlay rather than
floating over the canvas.

## 7. Tests

### New

**`ImportPicker.test.js`**
- Import is disabled until something is picked
- Picking an idea, then a topic, leaves one pick — the topic
- A topic is not selectable when `selectableKinds` is `['idea']`; clicking it
  still opens its fan
- A note card in a fan is never selectable
- Import fires `onImport` with `{ kind, id }` and does not close by itself
- Cancel and Escape both fire `onClose` without importing

**`noteFiling.test.js`**
- `withMember` appends; adding a member already present returns the same set
- `withoutMember` removes; removing an absent member returns the same set
- Neither mutates its input

**`NoteFiling` coverage** (in `Analyze.test.js`)
- The note's ideas and topics are both listed, topics marked as topics
- × on an idea PUTs the idea set minus that id, leaving topics untouched
- × on a topic PUTs the topic set minus that id, leaving ideas untouched
- Import → pick an idea → Import PUTs ideas plus that id
- Import → pick a topic → Import PUTs topics plus that id

### Rewritten

`describe('Linking a note to ideas')` in `Analyze.test.js` is entirely checkbox
queries and becomes the picker flow. `describe('Importing an idea into the
chapter')` keeps its assertions but gains the confirm press.

### Harness

`Analyze.test.js`'s mock store needs a `PUT /notes/:id/topics` route and a
`noteTopics` table beside `noteIdeas`, and `GET /notes` must return `topics` on
each note. The seeded fixtures need at least one note carrying both an idea and
a topic, which is the state the section is built for.

## 8. Build order

1. `noteFiling.js` + tests — pure, depends on nothing
2. `BubbleCard`'s `isPicked` + `.is-picked` styling
3. `TopicIdeaField`'s `pick` / `onPickTopic` props, Thoughts unaffected
4. `ImportPicker` + tests
5. `NotesPanel` switched over — the chapter importer proves the picker end to end
6. `useNotes.setNoteTopics`, `Analyze.handleSaveTopics`
7. `NoteFiling.js`, wired into `NoteEditor`
8. Delete `MultiSelect`, `groupIdeaOptions`, the `ideaGroups` chain
9. Rewrite the affected `Analyze.test.js` sections and extend the mock store

Steps 1–5 leave the app working at every point: the chapter importer is
switched to the new picker before the editor is touched, so the picker is
proven before it carries the harder of the two callers.

## Verification

Browser-checked against the seeded account (`phase6e@example.test`, user 6) at
`/analyze?l=1.15&note=298` — note 298 "Justified by faith" already carries idea
13 and topic 9, so the filing section has both kinds to draw on the first run.

Two notes on the in-app browser, learned while examining the current page: its
coordinate mapping is off by roughly 10%, so clicks land short and can hit the
wrong card — dispatch events on the element instead. And a fan is opened by
dispatching `pointerover`/`mouseover` on `.thoughts-cluster`, not by hovering a
coordinate.
