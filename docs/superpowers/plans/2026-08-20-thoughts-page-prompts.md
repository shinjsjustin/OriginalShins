# Thoughts Page — Implementation Prompt Series

Companion to `docs/superpowers/specs/2026-08-20-thoughts-page-design.md`.

Twelve prompts, in order. Each one is a self-contained unit of work that ends in a
verifiable state, so you can paste one, review the result, and paste the next.
Start a fresh Claude Code session at any stage boundary (marked below) if context
gets heavy.

---

## Before you start — five facts the spec does not have

These were checked against the working tree on 2026-08-20. They are baked into the
prompts below, but know them yourself:

1. **This directory is not a git repository.** There is a `.gitignore` but no
   `.git`. None of the prompts contain commit steps. If you want per-task commits,
   run `git init` first and add "commit the change" to the end of each prompt.
2. **The CSS folder is `src/client/src/components/Styling/`**, not
   `src/client/src/Styling/` as the spec's section 7 writes it. So the new
   stylesheet is `src/client/src/components/Styling/Thoughts.css`.
3. **There is no migration runner.** Migrations are applied by hand:
   `mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/005_pins.sql` (AGENTS.md
   line ~275).
4. **Client tests only.** `CI=true npm run test:client` from the repo root. Run it
   through that script, not `react-scripts` directly — CRA derives `rootDir` from
   cwd and the jest-dom matchers silently vanish otherwise. There is no server-side
   test harness, which is why the pins routes are verified by curl.
5. **`invalidatesOverview` must NOT wrap the pins mount.** Pins do not appear in
   the Overview payload, so mounting the middleware on them would blow the cache on
   every pin click for nothing.

---

# Stage A — Backend (prompts 1–2)

## Prompt 1 — pins table, lib and routes

```
Read docs/superpowers/specs/2026-08-20-thoughts-page-design.md section 1, then read
src/db/migrations/003_ideas_topics.sql, src/lib/topics.js, src/lib/topicInput.js,
src/lib/params.js and src/routes/topics.js so you match the conventions exactly.

Build the pins backend:

1. src/db/migrations/005_pins.sql — the `pins` table exactly as written in the
   spec: (user_id, item_type ENUM('topic','idea','note'), item_id, created_at),
   PRIMARY KEY (user_id, item_type, item_id), FK on user_id to admin(id) ON DELETE
   CASCADE, InnoDB / utf8mb4_unicode_ci. There is deliberately no FK to the item —
   add the comment explaining that reads hydrate via joins so an orphaned pin is
   invisible.

2. src/lib/pins.js — reads and writes against `pins`, scoped by user_id, following
   the shape of src/lib/topics.js (a `toPin` row mapper, camelCase out, one
   responsibility). It needs:
   - findPins(userId): the hydrated list in pin order (created_at, then item_id),
     each entry { itemType, itemId, title, createdAt }. Title comes from
     topics.name / ideas.title / notes.title via a UNION over three joins, each
     join carrying the owning user_id check so a pin whose item is gone or not
     owned simply does not appear.
   - insertPin(userId, itemType, itemId): idempotent — INSERT IGNORE or
     ON DUPLICATE KEY UPDATE, so re-pinning is a no-op success.
   - ownsItem(userId, itemType, itemId): the ownership check, returning a boolean.
   - removePins(userId, items): delete the listed { itemType, itemId } pairs.
   - removeAllPins(userId).
   - removePinsForItem(userId, itemType, itemId): used by the delete routes.

3. src/lib/pinInput.js — request-body validation in the style of
   src/lib/topicInput.js, built on src/lib/textInput.js and
   src/lib/params.js#parseRowId. Validate itemType against the three enum values
   and item ids as positive integers. Parsers return { value } or { error }.

4. src/routes/pins.js — GET /, POST /, DELETE /, DELETE /all, exactly as the spec
   describes. POST returns 404 (not 403) when the item is not owned, matching this
   codebase's "indistinguishable from never existed" rule. Follow the error and
   logging shape of src/routes/topics.js.

5. Mount it in src/server.js as
   app.use('/api/pins', isAuth, pinRoutes);
   WITHOUT the invalidatesOverview middleware — pins are not part of the Overview
   payload, so invalidating that cache on every pin click would be pure waste.
   Add a comment at the mount saying so.

Do not touch the client yet. When done, show me the migration and tell me the curl
commands to verify it.
```

## Prompt 2 — delete routes clean up their pins

```
The topic, idea and note DELETE routes should remove that item's pins. Add a call
to removePinsForItem from src/lib/pins.js after the successful delete in:
  - src/routes/topics.js  DELETE /:id
  - src/routes/ideas.js   DELETE /:id
  - src/routes/notes.js   DELETE /:id

Call it after the delete succeeds rather than restructuring those handlers into a
transaction: findPins hydrates through ownership joins, so an orphaned pin row is
already invisible to every reader. This is cleanup, not correctness — put that
reasoning in a comment so nobody "fixes" it into a transaction later.

Then run the server (npm start) and verify the whole pins API by curl against a
logged-in token: pin a topic, pin it again (should still succeed), GET the list,
pin an id belonging to nobody (expect 404), pin item_type 'chapter' (expect 400),
unpin one, delete the pinned topic and confirm it leaves the pin list, then
DELETE /api/pins/all. Show me the actual request/response for each.
```

**Stage A checkpoint:** run `/code-review` before moving on. The pins routes are new
user-scoped endpoints, so ownership checks are the thing to look hardest at.

---

# Stage B — Pure layout modules, TDD (prompt 3)

## Prompt 3 — the four pure modules with tests first

```
Read docs/superpowers/specs/2026-08-20-thoughts-page-design.md sections 3, 4 and 6,
and read src/client/src/components/Overview/arcModel.js +
src/client/src/components/Overview/arcModel.test.js to see how this codebase writes
pure geometry modules and their tests.

Create src/client/src/components/Thoughts/ and build these four pure modules
test-first — write the test file, run it and watch it fail, then implement:

1. linkRules.js — the single source of truth for whether a pinned-item selection
   can be linked. Given a selection of { itemType, itemId } entries it returns
   { canLink, reason, pairs } where pairs is the list of [parent, child] link
   operations. Link is valid only when the selection spans exactly TWO ADJACENT
   tiers: (>=1 note AND >=1 idea) or (>=1 idea AND >=1 topic). Not valid for: one
   tier only, all three tiers, note+topic (non-adjacent), empty selection. When
   invalid, `reason` is the one-line hint the UI shows. Write the test as a truth
   table over every combination of the three tiers being present/absent, plus the
   pairing fan-out (2 notes + 3 ideas produces 6 pairs).

2. fieldLayout.js — N topics plus canvas { width, height } to an array of
   { id, x, y, width, height }. A grid-ish arrangement, centered, that stays inside
   the canvas at N=1, N=8, N=25. Pure, deterministic, no DOM. Test the invariants
   (count preserved, no card outside the canvas, no two cards overlapping, stable
   output for the same input) rather than hard-coded pixel values.

3. fanLayout.js — the spotlight fan. Given an idea count, the hovered topic's
   position and the canvas, return positions along an arc plus an overflow
   decision. Per spec: up to ~15 the arc tightens and cards shrink one step; past
   what fits, the result includes an overflow chip and a second arc row. Test the
   thresholds explicitly (1, 5, 15, 30 ideas) and that the fan is clamped inside
   the canvas when the topic sits near an edge.

4. orbitLayout.js — notes ringing a centered idea. Returns ring positions; more
   than 10 notes splits into a second, smaller concentric ring. Test the split
   threshold and even angular distribution.

Put the layout constants (card sizes, radii, thresholds) in named exports at the
top of each module — no magic numbers.

Run CI=true npm run test:client and show me the passing output.
```

---

# Stage C — Data layer (prompt 4)

## Prompt 4 — the three hooks

```
Read src/client/src/components/Library/useCollection.js, useTopics.js and
useIdeas.js, src/client/src/components/Analyze/useNotes.js, and
src/client/src/config/api.js. Note the `revision` counter pattern: every successful
write bumps a counter the fetch effect depends on, so lists reload from the server
rather than from a guess — link writes change counts on rows the response never
mentions.

Build three hooks in src/client/src/components/Thoughts/:

1. useThoughtsData.js — loads topics, ideas and notes plus their links, and exposes
   the mutations the page needs: createTopic, createIdea, updateTopic, updateIdea,
   updateNote, removeTopic, removeIdea, removeNote, and linkPairs(pairs).
   linkPairs implements the spec's section-1 "Linking (no backend change)" rule: for
   each parent-side item, GET its detail, append the partner ids to its current set,
   and PUT the full set back — PUT /api/notes/:id/ideas with { ideaIds } for
   note→idea, PUT /api/ideas/:id/topics with { topicIds } for idea→topic. Appending
   is naturally idempotent for already-linked pairs. The PUTs are sequential; on a
   partial failure the completed links stand (they are real) and the error names the
   item that failed. Expose `error` (load) and `actionError` (mutation) like
   useCollection does.

2. usePins.js — GET /api/pins on mount; togglePin(itemType, itemId),
   unpinMany(items), clearPins(). Toggles are OPTIMISTIC: update local state first,
   roll back and set actionError on failure.

3. useThoughtsView.js — view state in the query string via react-router-dom's
   useSearchParams. /thoughts is the topics view, /thoughts?idea=123 is the idea
   view. Exposes { ideaId, showIdea(id), resetView() }. Model it on
   src/client/src/components/Analyze/panelParams.js and
   src/client/src/components/Overview/useOverviewParams.js — parse defensively, an
   unparseable ?idea= falls back to the topics view.

Write a test for useThoughtsView's parsing (valid id, missing param, garbage param,
negative number) since it is pure enough to test directly. Run
CI=true npm run test:client.
```

**Stage C checkpoint.** Good place to start a fresh session — everything above is on
disk and self-describing.

---

# Stage D — The canvas (prompts 5–7)

## Prompt 5 — page shell and route

```
Read docs/superpowers/specs/2026-08-20-thoughts-page-design.md section 2, plus
src/client/src/routes.js, src/client/src/components/Navbar.js and
src/client/src/components/Overview/Overview.js (for the page-level error banner and
loading patterns).

Stand up the page shell — no bubbles yet:

1. src/client/src/components/Thoughts/Thoughts.js — composes the top bar, a canvas
   area and the pinned-panel slot. Wires up useThoughtsData, usePins and
   useThoughtsView. Renders `error` and `actionError` as the existing role="alert"
   banner pattern.
2. src/client/src/components/Thoughts/TopBar.js — "⟲ Reset View" at top-left, then
   "+ Topic" and "+ Idea" buttons (wire them to no-op handlers for now), and, in
   idea view, a breadcrumb "Topic › Idea" under the bar showing the idea's first
   linked topic or "Unfiled".
3. Add { path: '/thoughts', element: <ProtectedRoute><Thoughts /></ProtectedRoute> }
   to src/client/src/routes.js with a comment in the style of the neighbouring
   entries, and add a "Thoughts" entry to the link list in Navbar.js.
4. Create src/client/src/components/Styling/Thoughts.css (note: the Styling folder
   lives under components/, the spec's path is wrong) with just the page/canvas
   layout for now, and import it from Thoughts.js.

Leave /ideas, /topics and /topics-tree in place — they get removed at the end, once
/thoughts actually replaces them.

Then run the app (npm run dev) and confirm /thoughts loads behind auth with the top
bar visible and no console errors.
```

## Prompt 6 — topics view: cards, spotlight, fan

```
Read spec section 3 and section 5, and re-read your own fieldLayout.js and
fanLayout.js.

Build the topics canvas:

1. BubbleCard.js — one card, used by all three kinds. Props for kind
   ('topic' | 'idea' | 'note' | 'unfiled'), title, subtitle, position, scale,
   selected/faded state, and children. Rounded rectangles, not circles. Include the
   pin toggle in the top-right that appears on hover and stays visible (small filled
   marker) when pinned — wire it to usePins.togglePin.
2. TopicsField.js — positions topic cards with fieldLayout. Each card shows name +
   idea count. The last cell is the "Unfiled ideas" pseudo-bubble with distinct
   styling, rendered ONLY when unfiled ideas exist; hovering it fans those ideas out
   like any topic.
3. Spotlight hover: the hovered topic scales up, every other topic card fades to
   near-invisible, and that topic's ideas (title only) fan out using fanLayout.
   Critically, the hover region is the WHOLE CLUSTER — topic + fan + the gaps
   between — so the fan survives cursor travel. Implement that as one wrapping
   hover container per cluster, not per-card handlers.
4. Clicking the topic locks the fan open; clicking again, pressing Esc, or hovering
   a different topic unlocks it.
5. Overflow: past what the arc fits, render the "+N more" chip at the fan's end that
   expands the second arc row fanLayout gives you.
6. Clicking an idea card navigates to ?idea=<id> via useThoughtsView.showIdea.

All animation is CSS transform/opacity transitions driven by state classes in
Thoughts.css. No animation library, no new dependencies.

Add an RTL test asserting the pin toggle appears on hover and that clicking an idea
card changes the view. Run CI=true npm run test:client, then look at it in the
browser and tell me what the hover feels like.
```

## Prompt 7 — idea view: the orbit

```
Read spec section 4 and src/client/src/components/Analyze/markdown.js.

Build IdeaOrbit.js:
- The selected idea's card animates to center and enlarges, showing title plus the
  full body rendered through the existing sanitized renderMarkdown path (import it
  from ../Analyze/markdown — do not write a second renderer).
- Its notes ring it using orbitLayout. Each note card shows title plus body clamped
  to ~3 lines with CSS line-clamp. More than ~10 notes uses the second concentric
  ring orbitLayout returns.
- Note cards carry the same pin toggle as every other card.
- Reset View and browser Back both return to the topics view with the reverse
  animation.
- The breadcrumb in TopBar now shows the real "Topic › Idea" (first linked topic, or
  "Unfiled").

Wire it into Thoughts.js so the canvas renders TopicsField or IdeaOrbit off
useThoughtsView. Verify in the browser that browser back/forward moves between the
two views.
```

---

# Stage E — The pinned panel (prompts 8–9)

## Prompt 8 — panel, selection, unpin, link, inline edit

```
Read spec section 6, then read src/client/src/components/Analyze/CollapseTab.js,
PanelSpine.js, PanelHeader.js and SelectionActions.js — the panel collapse and
selection-action patterns you are reusing. Re-read your linkRules.js.

Build the pinned panel:

1. PinnedPanel.js — right-docked, open by default, collapsible to a thin spine using
   the Analyze CollapseTab/PanelSpine pattern. Header: "Pinned (N)", a "Clear"
   button behind a confirm, and the collapse control.
2. PinnedItem.js — one row: kind label (TOPIC/IDEA/NOTE), title, selection checkbox,
   and an edit pencil that appears on row hover in the top-right.
3. Selection by checkbox or row click (like verse selection on Analysis) reveals an
   action bar with:
   - Unpin — always enabled when something is selected, calls usePins.unpinMany.
   - Link — enabled ONLY when linkRules.canLink is true; when disabled, render
     linkRules.reason as a one-line hint. On click, pass linkRules.pairs to
     useThoughtsData.linkPairs.
   linkRules is the only place that decides this. Do not re-derive the tier logic in
   the component.
4. The pencil swaps the row to an inline edit form — topic: name + description;
   idea/note: title + body — with Save, Cancel and Delete (behind a confirm). This
   form is the ONLY editing surface in the page, which is what makes "editing
   requires pinning" true by construction.
5. Panel and canvas read the same hooks, so an edit, link, create or delete shows in
   both immediately.

Add RTL tests: selection enables Unpin; Link is disabled for a single-tier selection
and enabled for note+idea; the edit form is reachable only from a pinned row; Clear
asks for confirmation. Run CI=true npm run test:client.
```

## Prompt 9 — create modal

```
Read spec section 2's creation paragraph, plus src/client/src/components/Analyze/
Modal.js, src/client/src/components/Library/TopicForm.js, IdeaForm.js and slug.js.

Build CreateModal.js: the "+ Topic" and "+ Idea" buttons in TopBar open a modal
carrying the same fields the old Library forms had — name/description with the
client-side slug for topics, title/body for ideas. Reuse Library/slug.js by moving
it into Thoughts/ (it goes away with the Library folder in prompt 11) and keep its
test with it.

On success the new item is AUTO-PINNED, so it is immediately editable in the panel —
that is the whole point, since the panel is the only edit surface.

Add an RTL test that creating a topic through the modal leaves it pinned. Run
CI=true npm run test:client.
```

---

# Stage F — Polish, removal, verification (prompts 10–12)

## Prompt 10 — the styling and animation pass

```
Do a dedicated visual pass on src/client/src/components/Styling/Thoughts.css.

Read Overview.css and Analyze.css first and stay inside this app's existing visual
language — same palette, same border/shadow idiom, same type scale. This is one more
page in an existing app, not a new design system.

Cover: rounded-rectangle card styling per kind (topic / idea / note / unfiled
pseudo-bubble); the spotlight transitions (hovered card scale-up, others fading to
near-invisible); the fan and orbit transforms; the idea card's grow-to-center
animation and its reverse; the pin marker's hover-in and pinned states; the panel
dock, spine and row hover.

Everything is CSS transform/opacity transitions driven by state classes. Honour
prefers-reduced-motion the way this codebase already does (grep AGENTS.md for
prefers-reduced-motion — the rule there is "the destination and not the journey").

Then show me screenshots of the topics view at rest, the topics view with a topic
hovered, and the idea view.
```

## Prompt 11 — remove the pages /thoughts replaces

```
Now that /thoughts works, remove what it replaces (spec section 2):

1. Delete src/client/src/components/Library/ and src/client/src/components/Topics/
   entirely, along with src/client/src/components/Styling/Library.css and
   Styling/TopicTree.css.
2. First move anything still used into Thoughts/ — check format.js, slug.js,
   MultiSelect.js and their tests, and grep the whole client for imports from those
   two folders before deleting. If Analyze or any other page imports from them, move
   the file rather than deleting it.
3. Remove the /ideas, /topics and /topics-tree entries from
   src/client/src/routes.js and the matching links from Navbar.js.
4. Leave the SERVER routes alone: /api/ideas and /api/topics are what the Thoughts
   page runs on. Only the client pages go.
5. Update AGENTS.md — its directory tree, page list and any prose describing the
   Ideas/Topics/Topic-tree pages, plus a section describing the Thoughts page and
   the new /api/pins endpoints and 005_pins.sql migration. Match the depth and voice
   of the existing sections; AGENTS.md is this project's real documentation.

Run CI=true npm run test:client and confirm nothing that survived imports something
that did not. Then load every remaining page in the browser and confirm no broken
imports.
```

## Prompt 12 — final verification

```
Read docs/superpowers/specs/2026-08-20-thoughts-page-design.md end to end with fresh
eyes and check the implementation against it section by section. For each of the ten
decisions in the "Decisions made during brainstorming" table, tell me where in the
code it is honoured — or that it is not.

Then verify, in a running browser:
1. Create a topic and an idea from the top bar; both land pinned.
2. Link them from the panel (idea + topic selected → Link enabled).
3. Confirm Link is disabled with a hint for a note+topic selection.
4. Hover a topic, travel the cursor out into the fan, and confirm the fan survives.
5. Click into an idea, confirm the orbit and markdown body, then browser-Back out.
6. Pin from a card, reload the page, confirm the pin persisted server-side.
7. Edit a pinned item, then delete it, and confirm it leaves both the canvas and the
   panel.
8. Unfiled: an idea with no topic appears under the "Unfiled ideas" bubble.

Report what passed and what did not, with the actual output. Then run
CI=true npm run test:client one more time and report the coverage of the
Thoughts/ folder.
```

---

## If you want a review pass

Your global rules call for `code-reviewer` after each chunk. The natural points are
the four stage boundaries — after prompts 2, 4, 9 and 11. `/code-review` on the
working tree covers it; prompt 2's checkpoint is the one worth not skipping, since
it is the only new set of user-scoped API endpoints in the whole feature.
