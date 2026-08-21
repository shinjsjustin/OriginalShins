# Thoughts Page — Design

Date: 2026-08-20
Status: approved in brainstorming session

## Summary

One new page, `/thoughts`, replaces `/ideas`, `/topics` and `/topics-tree`. It
presents the topic → idea → note hierarchy as an interactive bubble canvas
(rounded-rectangle cards) with a spotlight hover fan, plus a right-docked
collapsible pinned panel that is the page's editing surface. Pins persist
server-side.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Creation | Topics and ideas are created on the Thoughts page (top-bar buttons + modal). Notes are still created only on the Analysis page (they anchor to verses). |
| Pin storage | Server-side, per user (new `pins` table + API). |
| Link rules | Link enabled only when the selection spans exactly two adjacent tiers. |
| Unfiled items | "Unfiled ideas" pseudo-bubble among the topic cards. |
| Old pages | `/ideas`, `/topics`, `/topics-tree` all removed. |
| Deletion | Inside a pinned item's edit form, with confirm. |
| Hover behavior | Spotlight: hovered topic grows, all else fades, ideas fan out. |
| Idea view layout | Full orbit: idea centered, notes ring it. |
| Bubble shape | Rounded rectangles, not circles. |
| Panel position | Right-docked, open by default, collapsible to a spine. |
| Scale target | ~25 topics, ~15 ideas per topic, ~20 notes per idea. |
| Tech approach | React + CSS transforms; layout math in pure, unit-tested modules. No new dependencies. |

## 1. Backend

### Migration `src/db/migrations/005_pins.sql`

```sql
CREATE TABLE IF NOT EXISTS `pins` (
  `user_id`    INT UNSIGNED NOT NULL,
  `item_type`  ENUM('topic','idea','note') NOT NULL,
  `item_id`    INT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `item_type`, `item_id`),
  CONSTRAINT `fk_pins_user`
    FOREIGN KEY (`user_id`) REFERENCES `admin` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

No FK to the item (polymorphic). Two safeguards instead:

- Reads hydrate by joining each type's table, so a pin whose item is gone
  simply doesn't appear.
- The topic/idea/note DELETE routes also delete matching pins inside their
  existing transaction.

### `src/lib/pins.js` + `src/routes/pins.js`

- `GET /api/pins` — hydrated pin list `[{ itemType, itemId, title, ... }]` in
  pin order. Titles come from the joins (topics.name, ideas.title,
  notes.title).
- `POST /api/pins` `{ itemType, itemId }` — pin. Validates the item type
  against the enum, checks ownership of the item (404 when not owned, matching
  the codebase's "indistinguishable from never existed" rule), idempotent on
  re-pin.
- `DELETE /api/pins` `{ items: [{ itemType, itemId }, ...] }` — unpin the
  listed pins (used by Unpin-selected and by single-card unpin).
- `DELETE /api/pins/all` — clear all of the user's pins.

Per-item toggle endpoints (not full-set PUT) because the widget is a per-item
pin button; the full-set idiom stays where the widget is a multi-select.

### Linking (no backend change)

The Link action composes existing endpoints: for each parent-side item, GET
its detail, append the selected partner ids to its current set, and PUT the
full set back (`PUT /api/notes/:id/ideas`, `PUT /api/ideas/:id/topics`).
Already-linked pairs are naturally idempotent (append skips ids already in the
set).

## 2. Routing, page chrome, view state

- `routes.js`: remove `/ideas`, `/topics`, `/topics-tree`; add protected
  `/thoughts`. Navbar: remove those three links, add "Thoughts".
- Delete `components/Library/` and `components/Topics/` (moving anything still
  shared — e.g. `format.js`, form field patterns — into `components/Thoughts/`).
  `Styling/Library.css` and `Styling/TopicTree.css` go with them.
- View state in the query string: `/thoughts` = topics view,
  `/thoughts?idea=123` = idea view. Reset View navigates to `/thoughts`.
  Back/forward work for free.
- Top bar: `⟲ Reset View` at top-left, then `+ Topic` and `+ Idea`, which open
  a modal create form (same fields as the old forms: name/description for
  topics with client-side slug, title/body for ideas). A newly created item is
  auto-pinned so it is immediately editable.
- In idea view a small breadcrumb under the top bar shows `Topic › Idea`
  (first linked topic, or "Unfiled").

## 3. Topics view

- Topic cards show name + idea count, positioned by pure function
  `fieldLayout.js` (N topics + canvas size → grid-ish positions). The last
  cell is the **Unfiled ideas** pseudo-bubble (distinct styling), rendered
  only when unfiled ideas exist; hovering it fans those ideas out like any
  topic.
- **Spotlight hover:** hovered topic scales up; all other topic cards fade to
  near-invisible; the topic's idea cards (title only) fan out in an arc,
  positions from `fanLayout.js`.
- The hover region is the whole cluster (topic + fan + gaps between), so the
  fan survives cursor travel. Clicking the topic locks the fan open; clicking
  it again, clicking a different topic, or Esc unlocks. **Hovering another
  topic does not unlock.** The petals overlap the neighbouring topic cards,
  which paint above the open cluster's empty region, so hover-to-unlock closed
  the fan on the way out to a petal — the exact reach the lock exists to make
  possible.
- Overflow: up to ~15 ideas the arc tightens and cards shrink one step; past
  what fits, a `+N more` chip at the fan's end expands a second arc row.
- Clicking an idea card navigates to `?idea=<id>`.

## 4. Idea view

- The idea card animates to center and enlarges: title + full body,
  markdown-rendered through the existing sanitized `renderMarkdown` path.
- Its notes orbit in a ring (`orbitLayout.js`): each note card shows title +
  body clamped to ~3 lines with CSS `line-clamp` (the "…" cutoff). More than
  ~10 notes: a second, smaller concentric ring.
- Reset View (or browser back) returns to the topics view with the reverse
  animation.

## 5. Pins on cards

Every card in both views — topic, idea, note — shows a pin toggle in its
top-right corner on hover. Pinned cards keep a small filled-pin marker
visible. Clicking toggles the pin via the API with optimistic UI and rollback
+ error banner on failure.

## 6. Pinned panel

Right-docked, open by default, collapsible to a thin spine (reusing the
Analyze collapse pattern). Contents:

- Header: "Pinned (N)", **Clear** (confirm prompt), collapse control.
- Rows: kind label (TOPIC/IDEA/NOTE), title, selection checkbox; an **edit
  pencil appears on row hover** (top-right).
- Selection (checkbox or row click, like verse selection on Analysis) reveals
  an action bar:
  - **Unpin** — always enabled with a selection.
  - **Link** — enabled only when the selection spans exactly two adjacent
    tiers (≥1 note + ≥1 idea, or ≥1 idea + ≥1 topic; `linkRules.js` is the
    single source of this truth). Every parent-side item gets every
    partner-side item appended to its set. When disabled, a one-line hint
    says why.
- The pencil swaps the row to an inline edit form — topic: name/description;
  idea/note: title/body — with Save, Cancel, and **Delete** (confirm).
  Editing is only possible for pinned items, by construction: the form only
  exists in this panel.
- Panel and canvas share the same data hooks, so edits, links, creates and
  deletes reflect immediately in both.

## 7. Client architecture

`src/client/src/components/Thoughts/`:

| File | Role |
|---|---|
| `Thoughts.js` | Page: composes top bar, canvas, panel |
| `TopBar.js` | Reset View, + Topic, + Idea, breadcrumb |
| `TopicsField.js` | Topics view canvas |
| `IdeaOrbit.js` | Idea view canvas |
| `BubbleCard.js` | One card: kind styling, pin toggle, hover states |
| `PinnedPanel.js` | Panel shell, header, selection actions |
| `PinnedItem.js` | Row + inline edit form |
| `CreateModal.js` | Topic/idea create form modal |
| `useThoughtsData.js` | Loads topics, ideas, notes + their links; exposes mutations (create/update/delete/link) |
| `usePins.js` | Pin list + toggle/unpin/clear with optimistic updates |
| `useThoughtsView.js` | Query-string view state |
| `fieldLayout.js` | Pure: topic grid positions |
| `fanLayout.js` | Pure: spotlight fan arc positions + overflow |
| `orbitLayout.js` | Pure: note ring positions + second ring |
| `linkRules.js` | Pure: selection → link validity + pairings |

Styling in `Styling/Thoughts.css`. Animations are CSS `transform`/`opacity`
transitions driven by state classes — no animation library.

## 8. Error handling

- Hooks expose `error` (load) and `actionError` (mutation) strings; the page
  renders them as the existing `role="alert"` banner pattern.
- Pin toggles are optimistic with rollback on failure.
- Link is sequential PUTs; on partial failure the completed links stand (they
  are real), and the error banner names the item that failed.
- All inputs validated server-side exactly as today (existing input libs);
  the pins route validates `itemType` against the enum and ids as positive
  integers.

## 9. Testing

- Unit (Jest): `fieldLayout`, `fanLayout` (arc + overflow thresholds),
  `orbitLayout` (ring split), `linkRules` (truth table over tier
  combinations).
- Component (RTL): pin toggle shows on hover and persists; selection enables
  Unpin/Link per rules; edit form only reachable from a pinned row; Clear
  confirms; create modal auto-pins; reset returns to topics view.
- Server: there is no server-side test harness in this project today, so the
  pins routes get verified manually (curl against a dev server: pin, re-pin,
  unpin, clear, ownership refusal), plus manual verification of the migration.

## Out of scope (deliberate)

- Drag-to-reorder ideas/notes (the `/topics-tree` feature this replaces);
  fan/orbit order follows stored `sort_order`. Revisit if missed.
- Note creation on this page.
- Pan/zoom of the canvas (not needed at the ~25-topic scale).
- Touch/mobile interactions; hover-driven UI targets desktop, matching the
  rest of the app.
