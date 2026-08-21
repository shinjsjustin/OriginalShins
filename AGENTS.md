# AGENTS.md — Web App Template

A guide for AI agents and developers extending this template.

---

## Directory Tree

```
BibleApp/
├── package.json                    # Root: server deps + dev scripts
├── .env.example                    # Root env vars (DB, JWT, session)
├── .gitignore
├── AGENTS.md                       # ← you are here
└── src/
    ├── server.js                   # Express entry point
    ├── db/
    │   ├── db.js                   # MySQL2 pool (promise-based)
    │   ├── schema.sql              # admin table
    │   └── migrations/
    │       ├── 001_scripture.sql   # books, chapters, verses
    │       ├── 002_notes.sql       # notes, note_references
    │       ├── 003_ideas_topics.sql# topics, ideas, idea_topics, note_ideas
    │       ├── 004_search.sql      # the FULLTEXT index /api/search reads
    │       └── 005_pins.sql        # pins: the Thoughts page's editable set
    ├── lib/                        # Query + validation modules the routes share
    │   ├── params.js               # Positive-integer parsing, canon bounds
    │   ├── chapters.js             # Chapter lookup + a chapter's verses
    │   ├── references.js           # note_references reads/writes; index resolution
    │   ├── notes.js                # notes reads/writes, all scoped by user_id
    │   ├── ideas.js                # ideas reads/writes + the cross-tier lookups
    │   ├── topics.js               # topics reads/writes + list counts
    │   ├── links.js                # note_ideas / idea_topics: full-set replace
    │   ├── ordering.js             # sort_order + re-parenting (server-side only)
    │   ├── slug.js                 # Topic slug derivation + validation
    │   ├── textInput.js            # Shared body-validation primitives
    │   ├── noteInput.js            # Request-body validation for the notes API
    │   ├── ideaInput.js            # Request-body validation for the ideas API
    │   ├── topicInput.js           # Request-body validation for the topics API
    │   ├── pinInput.js             # Request-body validation for the pins API
    │   ├── pins.js                 # pins reads/writes + the hydrating joins
    │   ├── searchInput.js          # The one query param /api/search takes
    │   ├── search.js               # The four search queries + their ranking rule
    │   ├── snippet.js              # Pure: the excerpt a result shows
    │   ├── overviewInput.js        # The two query params /api/overview takes
    │   ├── overviewQueries.js      # Its three reads: the same refs grouped three ways
    │   ├── overview.js             # /api/overview's payload: anchors + labels per tier
    │   └── overviewCache.js        # That payload, per topic scope, until a write voids it
    ├── scripts/
    │   ├── import-scripture.js     # CLI: npm run import:scripture
    │   └── scripture/
    │       ├── canon.js            # the 66-book canon (names, abbrevs, testament)
    │       ├── source.js           # download or read the source JSON
    │       ├── build-rows.js       # transform + assign verse_index
    │       ├── load-rows.js        # transactional clear-and-reload
    │       └── verify.js           # post-import count assertions
    ├── middleware/
    │   ├── isAuth.js               # JWT Bearer token validator
    │   └── invalidateOverview.js   # Drops the overview cache after any write
    └── routes/
        ├── auth.js                 # POST /api/auth/register, /api/auth/login
        ├── user.js                 # GET  /api/user/me  (protected)
        ├── books.js                # GET  /api/books    (protected, cached)
        ├── chapter.js              # GET  /api/chapter/:bookId/:chapter
        ├── notes.js                # GET/POST/PATCH/DELETE /api/notes (+ one note, references, ideas)
        ├── references.js           # DELETE /api/references/:id
        ├── ideas.js                # CRUD /api/ideas + PUT /api/ideas/:id/topics
        ├── topics.js               # CRUD /api/topics (list carries counts)
        ├── search.js               # GET /api/search?q= (four groups)
        ├── overview.js             # GET /api/overview?tiers=&topicId= (cached per scope)
        ├── pins.js                 # GET/POST/DELETE /api/pins (+ DELETE /all)
        └── orderingErrors.js       # ordering results -> HTTP, shared by three routers
    └── client/                     # React app (Create React App)
        ├── package.json
        ├── .env.example            # REACT_APP_URL
        └── src/
            ├── index.js            # ReactDOM root + App + BrowserRouter
            ├── index.css           # CSS custom properties (design tokens)
            ├── routes.js           # Flat route array — all pages defined here
            ├── setupTests.js       # Loads jest-dom matchers before every test
            ├── reportWebVitals.js
            ├── config/
            │   ├── ProtectedRoute.js   # Redirects to /login if no valid JWT
            │   ├── UnprotectedRoute.js # Redirects to /dashboard if logged in
            │   └── api.js              # fetchJson: Bearer auth + status→message
            └── components/
                ├── Navbar.js           # Profile icon + dropdown panel
                ├── Home.js             # Public landing page
                ├── Authentication/
                │   ├── Login.js
                │   ├── Register.js
                │   ├── Logout.js
                │   ├── AccessDenied.js
                │   └── PostRegisterPage.js
                ├── Dashboard/
                │   └── Dashboard.js    # Protected home after login
                ├── Analyze/            # The Analyze page: scripture + notes
                │   ├── Analyze.js          # Page shell; owns cross-panel state only
                │   ├── ScripturePanel.js   # One chapter + its footer (controlled)
                │   ├── VerseRow.js         # One verse: rail, tint, click-to-select
                │   ├── NotesPanel.js       # Notes + ideas; follows the PRIMARY panel
                │   ├── PanelHeader.js      # Label, passage, and the collapse tab
                │   ├── CollapseTab.js      # Pushes a side panel aside
                │   ├── PanelSpine.js       # What a pushed-aside panel becomes
                │   ├── SelectionActions.js # Add note / Clear selection, in the corner
                │   ├── NoteListItem.js     # One row of the notes list
                │   ├── IdeaListItem.js     # One row of the ideas list
                │   ├── IdeaComposer.js     # Inline capture for a standalone idea
                │   ├── NoteEditor.js       # Read/edit one note + its references
                │   ├── PanelFooter.js      # ← | Book | Chapter | →
                │   ├── BookPicker.js       # Modal grid of all 66 books
                │   ├── ChapterPicker.js    # Modal grid of one book's chapters
                │   ├── Modal.js            # Overlay shell (Escape / backdrop)
                │   ├── MultiSelect.js      # Checkbox list; reports the COMPLETE set
                │   ├── navigation.js       # Pure position + chapter-step helpers
                │   ├── panelParams.js      # The names of the ?l= ?r= ?note= params
                │   ├── analyzeUrl.js       # Pure: every link INTO this page
                │   ├── highlights.js       # Pure: references -> per-verse tints
                │   ├── verseSelection.js   # Pure: verse-index range -> reference
                │   ├── selectionRuns.js    # Pure: clicked verses -> contiguous refs
                │   ├── markdown.js         # marked + DOMPurify; list excerpts
                │   ├── useBooks.js         # Loads /api/books once
                │   ├── usePanelPositions.js# Reads/writes ?l= (primary) and ?r=
                │   ├── useNotes.js         # The chapter's notes + every write
                │   ├── useCollection.js    # One list + its fetch/revision plumbing
                │   ├── useIdeas.js         # /api/ideas + PUT :id/topics
                │   ├── useActiveNote.js    # Which note the editor is showing
                │   └── useSelectedVerses.js# The page's one verse selection
                ├── Thoughts/           # /thoughts — the three tiers as one canvas
                │   ├── Thoughts.js         # Page shell; owns which card is selected
                │   ├── TopBar.js           # Reset View, the two Create buttons, the crumb
                │   ├── TopicsField.js      # The topics view: a card per topic + unfiled
                │   ├── IdeaOrbit.js        # The idea view: one idea, its notes ringing it
                │   ├── BubbleCard.js       # Every card on both views is this component
                │   ├── PinnedPanel.js      # The right-docked panel: the page's only editor
                │   ├── PinnedItem.js       # One pinned row, and the form it becomes
                │   ├── CreateModal.js      # Make a topic or an idea, without leaving
                │   ├── ConfirmButton.js    # Two-press Clear and Delete
                │   ├── fieldLayout.js      # Pure: N topics + a canvas -> where each sits
                │   ├── fanLayout.js        # Pure: a topic's ideas -> the fan they open on
                │   ├── orbitLayout.js      # Pure: an idea's notes -> the ring they orbit
                │   ├── cardGeometry.js     # Pure: the box sums both canvases share
                │   ├── linkRules.js        # Pure: a pinned selection -> may it be linked
                │   ├── slug.js             # Client half of the slug rule
                │   ├── format.js           # "2 ideas", "0 notes"
                │   ├── thoughtsUrl.js      # Pure: every link INTO this page
                │   ├── useThoughtsView.js  # Reads/writes ?idea= — which view is showing
                │   ├── useThoughtsData.js  # The three tiers + every write the canvas makes
                │   ├── usePins.js          # /api/pins, optimistically
                │   └── useCanvasSize.js    # The measured pixel size a layout is given
                ├── Search/             # /search — one box across all four tiers
                │   ├── SearchPage.js       # Page shell: the input and the states
                │   ├── SearchGroup.js      # One heading + its rows, all links
                │   ├── SearchNav.js        # Thoughts | Overview | Search | Analyze
                │   ├── searchModel.js      # Pure: the groups and where a row goes
                │   ├── useSearch.js        # Debounced query -> one request
                │   └── useDebouncedValue.js# Generic: a value that has settled
                ├── Overview/           # /overview — the whole canon on one axis
                │   ├── Overview.js         # Page shell; owns the two fetches
                │   ├── ScriptureAxis.js    # The axis: book and chapter ticks + labels
                │   ├── TierRails.js        # The rails being shown, and their headings
                │   ├── TierStems.js        # One stem per anchor, axis -> one rail
                │   ├── TierArcs.js         # One chained path per group, on one rail
                │   ├── TierToggles.js      # Which rails are drawn; writes the URL
                │   ├── OverviewSearch.js   # The filter box: local text, debounced into ?q=
                │   ├── ZoomBand.js         # The band a shift-drag pulls down the axis
                │   ├── ArcTooltip.js       # What a hovered chain says: tier, title, refs
                │   ├── TierDrawer.js       # One note/idea/topic, opened by its chain
                │   ├── axisModel.js        # Pure: /api/books -> every mark, yForIndex/indexForY
                │   ├── anchorPoints.js     # Pure: one tier -> validated points on the axis
                │   ├── stemModel.js        # Pure: those points -> one stem each
                │   ├── arcModel.js         # Pure: those points -> one chained path per group
                │   ├── tierLabels.js       # Pure: a label tier -> tooltip text, nearest ref
                │   ├── arcSearch.js        # Pure: a term -> which groups, on which rails
                │   ├── tierDetail.js       # Pure: one endpoint's row -> what the drawer shows
                │   ├── overviewLayout.js   # The 560 x 1000 world every coordinate is in
                │   ├── overviewParams.js   # Pure: the ?tiers= / ?topicId= / ?q= contract
                │   ├── viewport.js         # Pure: pan, zoom, zoom-to-range, the thresholds
                │   ├── pointerCapture.js   # The two drags' shared, forgiving capture calls
                │   ├── usePanZoom.js       # Writes the transform to the DOM, not to state
                │   ├── useZoomRegion.js    # Shift-drag: the band, and the range it resolves to
                │   ├── useArcInteraction.js# Delegated hover and click; highlight via the DOM
                │   ├── useArcSearch.js     # Writes the search's marks onto the drawing
                │   ├── useTierDetail.js    # Loads the one group the drawer opened
                │   ├── useOverviewParams.js# Reads/writes ?tiers=, ?topicId= and ?q=
                │   └── useOverviewData.js  # Loads /api/overview for the rails shown
                └── Styling/
                    ├── Form.css        # Auth/form container styles
                    ├── Home.css        # Landing page + .industrial-button
                    ├── Navbar.css      # Profile icon + dropdown panel
                    ├── Analyze.css     # Analyze page panels, footers, modals, multi-select
                    ├── Search.css      # Search page: the box, the nav, the result groups
                    ├── Overview.css    # The axis, rails, stems, arcs, tooltip, drawer, counter-transforms
                    └── Thoughts.css    # The canvas, the cards, the fan and orbit, the pinned panel
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React 18 (Create React App) | Bootstrapped quickly, widely understood |
| Routing (client) | React Router DOM v6 | Declarative, nested routes, loaders |
| HTTP client | `fetch` (native) | No extra deps; consistent with browser APIs |
| Auth token storage | `localStorage` | Simple; survives page refresh |
| Token decoding | `jwt-decode` | Reads JWT payload without a round-trip |
| Markdown | `marked` (v4) | Renders note bodies. Pinned to the v4 line, which ships CommonJS — v5+ is ESM-only and CRA's Jest does not transform ESM in `node_modules`, so tests would fail to import it |
| HTML sanitizing | `dompurify` | Markdown permits raw HTML and the output goes to `dangerouslySetInnerHTML`; nothing rendered from a note body skips this |
| Backend | Express.js | Lightweight, large ecosystem |
| Database | MySQL2 (promise pool) | Matches the original codebase |
| Password hashing | bcryptjs | Industry standard for at-rest credentials |
| JWT signing | jsonwebtoken | Stateless auth; 8h expiry |
| Session (optional) | express-session | Required if you add OAuth (passport) |
| Environment config | dotenv | Keeps secrets out of source |

---

## Auth Flow

```
1. User fills Register form
   └─ POST /api/auth/register  { name, email, password }
      ├─ bcrypt.hash(password, 10)
      ├─ INSERT INTO admin (access_level = 0)   ← pending approval
      └─ 201 → redirect to /post-register

2. Admin grants access_level >= 1 (out of band — direct DB or admin UI)

3. User fills Login form
   └─ POST /api/auth/login  { email, password }
      ├─ SELECT * FROM admin WHERE email = ?
      ├─ bcrypt.compare(password, hash)
      └─ jwt.sign({ email, id, access }, JWT_SECRET, { expiresIn: '8h' })
         └─ 200 { token } → localStorage.setItem('token', token)
                          → navigate('/dashboard')

4. Protected API calls
   └─ fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      └─ isAuth middleware: jwt.verify(token, JWT_SECRET)
         ├─ 401 if token missing
         ├─ 403 if token invalid/expired
         └─ sets req.user = decoded payload → next()

5. Logout
   └─ localStorage.removeItem('token') → navigate('/')
```

---

## Scripture Data

Static, read-only reference tables holding a public-domain Bible. Loaded once by
the importer; nothing in the app writes to them at runtime.

| Table | Rows | Holds |
|-------|------|-------|
| `books` | 66 | Name, abbrev, testament (`OT`/`NT`), `chapter_count`, `canonical_order` |
| `chapters` | 1,189 | `verse_count` plus precomputed `start_index` / `end_index` |
| `verses` | 31,095 (WEB) / 31,102 (KJV) | Verse text keyed by `verse_index` |

### `verse_index`

Every verse carries a single monotonic integer, `verse_index`, running 1..N over
the whole Bible in canonical order. It is computed **once at import time** and
never at query time. It turns:

- the Overview y-axis into a linear mapping, with no per-book math
- reference overlap into an integer range comparison
  (`start_index <= :chapter_end AND end_index >= :chapter_start`)
- canonical sorting into a plain `ORDER BY start_index`

`chapters.start_index` / `end_index` are the same values denormalized to chapter
granularity, so fetching a chapter never has to scan for its bounds.

Caveat: the WEB omits ~31 verses the KJV numbers (Acts 8:37, Matthew 17:21, ...),
so verse *numbers* skip — Acts 8 runs ...36, 38... — while `verse_index` stays
gapless. Never derive one from the other.

### Loading it

```bash
# 1. Create the tables (once). Migrations apply in order; 002 depends on 001.
mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/001_scripture.sql
mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/002_notes.sql
mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/003_ideas_topics.sql
mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/004_search.sql
mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/005_pins.sql

# 2. Import the text
npm run import:scripture                        # World English Bible (default)
npm run import:scripture -- --translation=kjv   # King James Version
npm run import:scripture -- --file=./web.json   # local JSON; no network needed
npm run import:scripture -- --dry-run           # build + check, write nothing
```

**Idempotency — clear-and-reload.** The importer deletes all three tables and
rewrites them inside a single transaction. Re-running always yields identical
contents, and a failure part-way rolls back to the previous state.

It ends with a verification step that exits non-zero and prints every problem it
found unless: there are 66 books and 1,189 chapters; the verse total matches the
translation (exactly 31,102 for KJV, range-checked and logged for WEB, whose
distributions vary slightly); `verse_index` is a gapless 1..N run; each chapter's
range agrees with its verses and abuts its neighbours; and `verse_index = 1` is
Genesis 1:1.

Switching translations is just another run — `--translation=kjv` replaces the
whole dataset. Recompute anything storing a `verse_index` (e.g. `note_references`)
alongside it, since the two translations number differently.

### Source

Both feeds come from getbible.net's v2 API and share one JSON shape:

| Translation | URL |
|-------------|-----|
| WEB (default) | `https://api.getbible.net/v2/web.json` |
| KJV | `https://api.getbible.net/v2/kjv.json` |

WEB is the default because its distribution metadata declares Public Domain
outright; getbible tags the KJV feed "GPL", though the KJV text itself is public
domain in the US (it remains under Crown copyright in the UK).

Book names, abbreviations, testament and canonical order come from
`src/scripts/scripture/canon.js`, not from the feed — the schema looks the same
whichever translation is loaded, and a feed that disagrees on chapter counts is
rejected rather than imported.

---

## Analyze Page

Three side-by-side panels at `/analyze`: a **compare** scripture panel, the
**primary** scripture panel in the centre, and a notes-and-ideas panel.

### The centre panel is primary

The centre panel holds the passage under study. It is the only one that cannot
be pushed aside, and it is what the notes panel follows — moving it moves the
notes with it, which is the only cascade on the page. The compare panel is
deliberately outside that cascade: a second passage read *against* the first is
no use if it is dragged along.

Either side panel can be collapsed, and the centre takes the room. A collapsed
panel becomes a **spine** — turned on its end, still naming the passage it will
return to, and the whole spine reopens it. Which panels are open is component
state, not URL state: it is how one reader has arranged the room right now, not
part of the passage a shared link is about.

### Panel state lives in the URL

`/analyze?l=40.5&r=45.5` — each param is `bookId.chapter`. `l` is the **primary**
(centre) panel and `r` the compare panel; the notes panel has no position of its
own and renders the primary's, so `l` drives both. The param names are still `l`
and `r` from when the panels were simply left and right — they keep those
spellings so links already shared still resolve, and `panelParams.js` exports
them as `PRIMARY_PARAM` and `COMPARE_PARAM`.

A third param, `?note=<id>`, opens the editor on one note. Unlike `l` and `r` it
is a one-shot instruction rather than state: nothing writes it back, and closing
the editor does not reopen the note even though the param is still in the URL.
It exists so another page can hand a note over — the Thoughts canvas, the search
results and the Overview drawer all link to
`/analyze?l=<book>.<chapter>&note=<id>`, the chapter of the note's first anchor.
A note with no anchor still opens, from the notes panel's `unreferenced` list,
which is the same whatever chapter the panels show.

Putting positions in the query string is what makes the back button, reload and
shared links work without extra state plumbing. `usePanelPositions` normalizes
the URL once the canon has loaded (a `replace`, not a push), so a bare
`/analyze` becomes `?l=1.1&r=40.1` — Genesis 1 and Matthew 1, the defaults.
A param naming a book that does not exist, or a chapter past the end of one,
falls back to that panel's default rather than blanking it.

### `data-verse-index`

Every verse row carries `data-verse-index` with its gapless whole-Bible
`verse_index`. Verse-range selection reads it straight off the DOM (see
[Notes → Verse selection](#verse-selection)), so it must survive any re-work of
`ScripturePanel` or `VerseRow`. Its counterpart is `data-note-id` on a notes
panel row and on each gutter marker: between them the two panels link to each
other without either holding a ref into the other.

### Endpoints

| Route | Returns |
|-------|---------|
| `GET /api/books` | All 66 books plus every chapter's verse count — everything the picker grids need, in one request. Sent with `Cache-Control: private, max-age=31536000, immutable`: the data only changes when the importer re-runs. `private`, not `public`, because it is served behind `isAuth` and a shared cache must not hand an authorized response to another client. |
| `GET /api/chapter/:bookId/:chapter` | That chapter's verses, plus book/chapter metadata, plus the `references` overlapping it — one round trip per panel navigation, as the plan calls for. |

Both routes reject a malformed `:bookId`/`:chapter` with 400 before touching the
database, and answer a well-formed reference that does not exist with 404.

---

## Notes

A note is markdown plus zero or more **references**, each anchoring it to a
verse range. Highlights are not stored — they are rendered from references, so
there is exactly one place a highlight can come from and no second object to
keep in sync.

### `note_references`

The table is `note_references`, **never** `references` — `REFERENCES` is a
reserved word in MySQL and the bare name would need backticking forever.

Each row carries `book_id`, `chapter`, `start_verse`, `end_verse` *and* the
denormalized `start_index` / `end_index` bounds of that range. Those two columns
are what make "which notes touch this chapter?" an integer comparison against an
index:

```sql
WHERE nr.start_index <= :chapter_end
  AND nr.end_index   >= :chapter_start
  AND n.user_id = :uid
```

**The indexes are computed server-side, always.** `src/lib/references.js` reads
them out of `verses` on every insert; a client-supplied `start_index` is
ignored. That resolution also snaps `start_verse`/`end_verse` to the verse
numbers that actually exist, because the WEB omits ~31 verses the KJV numbers —
a selection running 36..38 in Acts 8 covers two verses, not three.

Re-running the scripture importer against a different translation renumbers
`verse_index` and therefore invalidates every row in this table.

### Scoping

`note_references` has no `user_id` of its own; ownership is established by
joining to `notes` in the same statement that reads or writes the row. Every
query in `src/lib/notes.js` and `src/lib/references.js` takes `userId` as its
first argument and puts it in the `WHERE` clause — so "does this note exist?"
and "does it belong to the caller?" are one question, and a note belonging to
someone else answers 404 exactly like one that never existed.

### Endpoints

| Route | Does |
|-------|------|
| `GET /api/notes?bookId=&chapter=` | Two lists: `notes` (references overlapping this chapter, in the order their anchors appear in the text) and `unreferenced` (notes with no anchor at all, invisible in the scripture panels and reachable only here). Every note carries its complete reference set, so opening the editor needs no further request. |
| `POST /api/notes` | `{ title?, body?, reference? }`. One endpoint, two creation paths — omit `reference` for a standalone note; include it and the note and its anchor are written in one transaction. |
| `PATCH /api/notes/:id` | Partial update of `title` and/or `body`. |
| `DELETE /api/notes/:id` | References go with it via `ON DELETE CASCADE`. |
| `POST /api/notes/:id/references` | Adds an anchor to an existing note. |
| `DELETE /api/references/:id` | Removes one anchor. The note survives — losing its last reference just makes it standalone again, which is a legal state. |

### Highlight rendering

Verse-by-verse, from the `references` on the chapter payload: no references is
plain, one is a light tint, two or more is a deeper tint. Beside the verse runs
a narrow **rail**, cut into one segment per note covering it — so a verse three
notes deep reads as three stacked segments without the rail ever growing wider,
which is what keeps the margin tight however heavily a passage is worked over.
Hovering a segment highlights that note in the notes panel and hovering a note
lights up its verses; clicking a segment opens the note and scrolls the panel to
it. All tints are tokens (`--note-tint-*`) in `index.css`, and all of them are
gold — the palette gives every "a note is here" signal one hue, and reserves
lapis for the verses selected right now.

### Verse selection

Selection is **verse-granular, never character-offset**, and it is made by
**clicking verses** — a row toggles in and out of the selection, and the verse
number is a real button so the keyboard reaches it too. A click that ends a text
drag is ignored, so copying a passage still works.

`useSelectedVerses` holds one selection for the whole page. Clicking in the
other panel, or in another chapter of the same one, starts a new selection
rather than extending the old one: a note's anchors all live in one chapter, so
a selection spanning two could never be saved as it stands. The selection is
remembered with its chapter rather than cleared on navigation, so it is still
there when the reader comes back.

Once anything is selected, two buttons appear in that panel's top-right corner —
**Add note** and **Clear selection**. They are in the corner and not beside the
verses because a selection can run past the fold.

`selectionRuns.js` cuts the selected set into **contiguous runs**, one reference
each: clicking verses 3, 4 and 20 anchors *two* references, never one running
3–20. `verseSelection.js` then reads verse *numbers* off the loaded chapter
rather than deriving them from the indexes, since the two only correspond in a
translation with no gaps. `POST /notes` takes the first run and each remaining
run is added with `POST /notes/:id/references`, sequentially.

Both files read `[data-verse-index]` straight off the row, which is why that
attribute must survive any rework of `ScripturePanel`.

### Notes and ideas are made differently

A **note** is anchored to verses, so the only way to make one is to select them:
the notes panel has no button that creates a note. An **idea** is standalone,
which is exactly why it needs a place to start, and `+ New idea` in that panel
is its inline composer. Both are filed elsewhere — a note under ideas from its
editor, an idea under topics on `/thoughts` — so an idea row here links there
rather than opening anything.

### Note editor

The open note is resolved out of the chapter's lists whenever they hold it, and
otherwise from the last resolved copy (`useActiveNote`). The retention is not an
optimization: without it, navigating the primary panel to a chapter the note does
not touch closes the editor — which is exactly when the verses you want to
anchor it to come into view, making a note that spans a chapter boundary
impossible to build through the UI.

---

## Ideas and Topics

The two tiers above a note. A note may belong to any number of **ideas**, an
idea to any number of **topics**, and every one of those relationships is
optional in both directions. An orphan note, an idea under no topic and a topic
holding nothing are all legal rows — the Thoughts page draws the unfiled ideas
as a card of their own — so nothing in the API refuses a write for want of a
link.

`ideas.body` and `notes.body` are the same thing: markdown, rendered through the
same `markdown.js` (marked + DOMPurify). Nothing rendered from either skips the
sanitizer.

### Link tables replace, never patch

`note_ideas` and `idea_topics` are both `(parent, child)` primary keys with a
`sort_order` payload, and both are written **whole**:

| Route | Body | Does |
|-------|------|------|
| `PUT /api/notes/:id/ideas` | `{ ideaIds: [...] }` | Replaces the note's entire idea set |
| `PUT /api/ideas/:id/topics` | `{ topicIds: [...] }` | Replaces the idea's entire topic set |

There is deliberately **no add-one/remove-one pair**. The UI is a multi-select,
which already knows the complete membership; an endpoint shaped the same way
cannot end up holding a set the widget never showed. `src/lib/links.js` performs
both, since apart from the table names they are the same operation: check the
parent and every child against `user_id`, clear the parent's rows, insert the
new set with the array position as `sort_order` — all inside one transaction.

An **empty array is a normal request**, not an error: it unlinks everything and
leaves a legal orphan. A parent that is not the caller's answers 404 (the same
as one that never existed); a child id that is not answers 400 (the request
named something real to someone else).

### Scoping

Neither link table carries a `user_id`, exactly as `note_references` does not.
Ownership is proven by joining to the parent rows in the same statement that
reads or writes the link, and the count queries take their totals from the
*ownership* joins rather than the link columns, so a link whose target failed
the check is not counted rather than silently inflating a number.

`src/lib/ideas.js` reads only `ideas` and `src/lib/topics.js` only `topics`.
Routes that need both tiers compose them — which is what keeps the two link
directions from becoming a circular import.

### Slugs

`topics.slug` is derived from the name and is unique per user
(`UNIQUE (user_id, slug)`). The client derives it as you type (`Thoughts/slug.js`)
and the server derives it again from what it receives (`src/lib/slug.js`) — the
client's copy is a convenience for the form, never the authority. Uniqueness is
enforced by the index and surfaced as a **409**, not by a read-then-write that
two concurrent requests could both pass.

Renaming a topic does not silently re-slug it: a slug can already be in a saved
URL, so changing it is an explicit act and the form sends both fields.

### Endpoints

| Route | Does |
|-------|------|
| `GET /api/topics` | Every topic with `ideaCount` and `noteCount`. The note count walks topic → idea → note and counts DISTINCT notes, so a note reached through three of the topic's ideas counts once. |
| `GET /api/topics/:id` | The topic with the ideas filed under it, each carrying its `noteCount`. Notes are not nested — a topic's worth of notes would be fetched on every topic opened and displayed on almost none of them. The Thoughts page's pinned panel reads this endpoint for a pinned topic; the canvas itself never needs it, since `GET /api/topics` already carries the counts a card prints. |
| `POST/PATCH/DELETE /api/topics(/:id)` | CRUD. Deleting a topic cascades its links and leaves its ideas as unfiled ideas. |
| `GET /api/ideas` | Every idea with its topics and its `noteCount` — one payload serving the Thoughts canvas, which fans an idea out under the topic it names, and the note editor's multi-select. It is also where "unfiled" comes from: an idea whose `topics` is empty, computed on the client rather than asked for. |
| `GET /api/ideas/:id` | The idea with its linked topics *and* notes. The notes are compact rows — a title and `firstReference`, the one anchor a link into Analyze needs — with no bodies: a row here is a way to reach a note rather than a rendering of one. The idea view loads this to learn which notes orbit, in which order, then fetches each note for the body its card shows. |
| `POST/PATCH/DELETE /api/ideas(/:id)` | CRUD. Deleting an idea cascades its links and leaves its notes as unfiled notes. |

Every note payload from `/api/notes` carries `ideas` alongside `references`, for
the same reason it carries the full reference set: the editor shows both the
moment it opens, and a partial payload would mean a second round trip.

### The pages

One page reads and writes both tiers: `/thoughts` (see
[Thoughts page](#thoughts-page)). It replaced three — `/ideas` and `/topics`,
which were a list plus a form each, and `/topics-tree`, the three-level tree
that filed things — and it runs on the same endpoints all three did. **The
server side of this section is unchanged by that; only the client pages went.**

The note editor's ideas multi-select saves on the click rather than behind a
Save button. The checkbox list already holds the complete membership and the PUT
replaces the complete membership, so there is nothing left over to commit —
unlike the title and body, which are a draft until saved.

### Endpoints no client calls today

The tree left three groups of routes behind. They are live, tested and correct,
and nothing in the app requests them:

| Route | Was |
|-------|-----|
| `GET /api/notes/unfiled`, `GET /api/ideas/unfiled` | The tree's two orphan buckets. The Thoughts canvas derives its unfiled card from `GET /api/ideas` instead — an idea whose `topics` is empty — so it never asks. |
| `PUT /api/topics/order`, `PUT /api/topics/:id/ideas/order`, `PUT /api/ideas/:id/notes/order` | Drag-to-reorder. The canvas positions cards by layout function, not by a stored order, so nothing writes `sort_order` from the client any more. It is still *read*: an idea's notes orbit in the order `GET /api/ideas/:id` lists them. |
| `PUT /api/ideas/:id/topic`, `PUT /api/notes/:id/idea` | Drag-to-re-parent: rewrite ONE membership and leave the row's others alone. The pinned panel's Link uses the full-set `PUT /:id/topics` and `PUT /:id/ideas` instead. |

They were kept rather than deleted because they are the only endpoints that can
express those operations, and the two the client stopped using are the two a
keyboard-accessible filing UI would need first. Their details — the 409 on a
stale list, the null-means-unfile rule, why a move is never an UPDATE — are in
`src/lib/ordering.js` and `src/routes/orderingErrors.js`, which remain the
authority on them.

Do not confuse "unfiled" with the `unreferenced` list `GET /api/notes` returns.
That one is about scripture anchors, this one is about ideas, and a note can be
in both, one, or neither.

---

## Thoughts page

`/thoughts` — topics, ideas and notes as one canvas, with a right-docked pinned
panel beside it. It replaced `/ideas`, `/topics` and `/topics-tree`, and runs on
the endpoints those three already had plus one new tier, `/api/pins`.

The page has exactly **two views**, and which one is showing is the query
string:

| URL | Shows |
|-----|-------|
| `/thoughts` | The topics view: one card per topic on a field, plus an unfiled card when there is anything unfiled |
| `/thoughts?idea=<id>` | The idea view: that idea enlarged at the centre, its notes ringing it |

`Thoughts/thoughtsUrl.js` owns that contract and is what other pages import to
link here, the same way `Analyze/analyzeUrl.js` owns links into Analyze. A topic
has no param of its own because it has no view of its own — the field IS every
topic — so a link to one topic can only be a link to the field.

### Why the pinned panel is the only editing surface

Nothing on the canvas is editable. A card is a card; to change a topic's
description or a note's body you **pin** it, and the panel is where the form
appears. That is one rule with three consequences worth stating outright:

- Creating pins. `+ Topic` and `+ Idea` pin what they make, because otherwise
  the button would produce a card the reader had just named and could no longer
  touch — they would have to find it on the canvas and pin it by hand before
  they could write a word of it.
- The panel is a working set, not a selection. It survives changing views, and
  it is the same list in both, which is why `usePins` takes no arguments and
  never reloads when the view changes.
- Linking happens between pinned rows rather than on the cards. Two adjacent
  tiers in the panel, select them, press Link.

### Three hooks, composed by the page

`Thoughts.js` is a shell. It holds three hooks and joins them, and every piece
below it reads state from there rather than fetching again:

| Hook | Holds |
|------|-------|
| `useThoughtsView` | Which view is showing — reads and writes `?idea=` and nothing else |
| `useThoughtsData` | The corpus: every topic, every idea, and the notes of whichever idea is open, plus every write the canvas and the panel can make |
| `usePins` | The pinned set |

`useThoughtsData` takes the open idea's id, because that is what decides whether
any notes are loaded at all; `usePins` knows nothing about the view. None of the
three knows about the others, and that is why the panel and the canvas cannot
disagree: they are handed the same arrays from the same two hooks.

The corpus is `GET /api/topics` + `GET /api/ideas` in parallel, and — in the
idea view — `GET /api/ideas/:id` for which notes orbit in which order, then one
`GET /api/notes/:id` per row for the body a card shows. **There is no unfiled
endpoint in that list.** The unfiled card is derived on the client from
`GET /api/ideas`: an idea whose `topics` array is empty.

Writes go through a `revision` counter that refetches rather than patching, for
the reason `useCollection` does the same on Analyze — a link write changes counts
on rows the response never mentions, and only the server can be right about them.
`usePins` is the one exception; see below.

### Layout is computed, not stored

Three pure modules place every card, each taking a count and a canvas size and
returning boxes:

| Module | Places |
|--------|--------|
| `fieldLayout.js` | The topic cards on the field |
| `fanLayout.js` | A topic's ideas, arcing out of it on hover |
| `orbitLayout.js` | An idea's notes, ringing it in the idea view |

Two things follow. First, `sort_order` is **read but never written** from this
page: an idea's notes orbit in the order `GET /api/ideas/:id` lists them, and
nothing here reorders anything. Second, the canvas size must be measured before
anything can be placed, which is `useCanvasSize` — a layout function is handed a
size, so the size cannot be a guess.

The fan is the navigation: hovering a topic is the only route to its ideas, so
every card `fanLayout` places has to land somewhere a cursor can reach. It turns
to face the middle of the canvas before drawing, clamps each box into the canvas
as a backstop, and caps the arc rather than letting a well-filled topic walk its
cards past a full turn and back onto the first.

### Linking: one authority, two adjacent tiers

`linkRules.evaluateLink` answers three questions from one call — whether Link is
enabled, what the hint under it says when it is not, and which writes fire when
it is pressed. Splitting the enable-check from the write-builder is the bug this
module exists to prevent: they drift, and the failure is a button enabled for a
selection the builder then reads differently, against the reader's real corpus,
with no undo on this page.

The rule is that a link joins a tier to the tier immediately under it, because
those are the only two link tables that exist:

| Selection | Result |
|-----------|--------|
| Notes + ideas | Links, `PUT /api/notes/:id/ideas` |
| Ideas + topics | Links, `PUT /api/ideas/:id/topics` |
| Notes + topics | Refused — there is no topic-to-note edge to write |
| One tier | Refused — that is half a link |
| All three | Refused — genuinely ambiguous, and picking a reading writes edges nobody asked for |

Pairs come out `[parent, child]`, child-major, so the caller can collapse one
child's pairs into the single full-set PUT the endpoint wants instead of
re-writing the same note once per idea.

---

### Pins

A pin is a user saying *keep this where I can edit it*. `005_pins.sql` adds the
table:

```sql
PRIMARY KEY (`user_id`, `item_type`, `item_id`)   -- item_type ENUM('topic','idea','note')
```

The composite key is what makes pinning **idempotent**: re-pinning is an INSERT
that collides with a row already saying the same thing, so a double click leaves
one pin and one 201 rather than a duplicate or an error.

The reference to the item is **polymorphic, with deliberately no foreign key**.
MySQL cannot express a constraint pointing at a different table depending on a
column's value, and the alternatives — three nullable columns, or a shared items
table — would distort three well-shaped tables to serve one small one. Nothing
is lost, because a pin is never read on its own: `findPins` joins the table
`item_type` names to fetch the title and carries the `user_id` check into that
join, so a pin whose item was deleted, or was never the caller's, produces no
joined row and is simply invisible. The three DELETE routes clear matching pins
as well (`removePinsForItem`), so the rows do not accumulate — but correctness
does not depend on their doing so.

`src/lib/pins.js` is the one lib module that reads more than one table, and it
reaches `topics`, `ideas` and `notes` through SQL of its own rather than through
`src/lib/topics.js` and friends. So the pin tier hangs off the three content
tiers without any of them knowing it exists. A table name cannot be a
placeholder in a prepared statement, so `item_type` is resolved through a map
the module owns (`ITEM_SOURCES`) — the second gate after validation, and the
reason no caller-supplied string ever reaches a query as SQL.

#### Endpoints

| Route | Does |
|-------|------|
| `GET /api/pins` | Every pin, hydrated with its item's title, in pin order. One `UNION ALL` branch per `item_type` rather than three round trips. |
| `POST /api/pins` | `{ itemType, itemId }`. Idempotent. |
| `DELETE /api/pins` | `{ items: [{ itemType, itemId }, ...] }` — unpin-selected, and single unpin as a list of one. Answers `{ removed }`. |
| `DELETE /api/pins/all` | The panel's Clear. Answers `{ removed }`. |

Per-item endpoints rather than a full-set PUT, because the widget driving them is
a per-card toggle. The full-set idiom lives where the widget is a multi-select —
the link tables — and copying it here would make one pin click send the whole
pinned set back.

Two status decisions worth not re-litigating:

- **POST on an item the caller does not own answers 404, not 403.** `pins` has
  no foreign key to the item, so the ownership check a foreign key would have
  given for free happens in the route; 403 would confirm that the id exists and
  belongs to somebody, which is the fact a stranger has no business learning.
  Same rule as every other `:id` in this API.
- **DELETE does no ownership check and cannot 404.** The delete is already
  scoped to the caller's `user_id`, so naming somebody else's pin removes
  nothing and reveals nothing. `removed` may be lower than the number of items
  sent — including for the ordinary race where two tabs unpin the same card —
  and that is a success.

`/api/pins` is mounted with `isAuth` but **not** with `invalidatesOverview`. A
pin is not content: it changes nothing the overview draws, and invalidating on
one would spend a full rebuild on a toggle.

#### Why usePins is optimistic when nothing else on the page is

Every other write here refetches, because a link write changes counts on rows the
response never mentions. A pin changes nothing but itself — no counts, no
cascade, no derived state anywhere — so `GET /api/pins` would come back saying
exactly what was just sent, and the refetch would buy nothing while costing a
visible lag on a toggle the reader expects to be instant.

So the toggle is applied locally and the request follows; on failure the previous
list goes back and the banner says why. **That rollback is the entire
justification for the optimism** — it is safe precisely because the guessed state
is one boolean the server cannot disagree with in any way more interesting than
"no". The list is mirrored in a ref beside the state because every callback here
is stable across renders, and rolling back out of a closure would restore
whichever list existed when the callback was made.

### Two kinds of failure, two banners

A **load** error means the page has nothing to draw; an **action** error means a
write did not land, over a page that is still correct. They are separate lines
because they are separate facts and either can be true without the other. Each
hook reports both, and the page shows whichever spoke — two hooks failing the
same way at once is one server being down, and one banner says that.

### Opening a note

A note card links to `/analyze?l=<book>.<chapter>&note=<id>` — the chapter of its
first anchor, with the editor opened on it — built by `Analyze/analyzeUrl.js`.
The alternative, an editor embedded in the canvas, would mean a second home for
the note editor, its reference list and its ideas multi-select, all of which
exist on `/analyze` and all of which are only useful beside the scripture they
point at.

---

## Search

`/search` — one box, four groups: notes, ideas and topics first, scripture
second. `GET /api/search?q=` answers all four in one request.

### Two halves, two mechanisms

| Group | Matched by | Cap |
|-------|-----------|-----|
| Notes, ideas, topics | `LIKE '%term%'` on title/name and body/description, scoped by `user_id` | 20 each |
| Scripture | `MATCH (v.text) AGAINST (? IN NATURAL LANGUAGE MODE)` | 50 |

LIKE for the content tiers because at the plan's scale — low thousands of rows,
all of them already behind a `user_id` — a scan is cheap and the ordering is
ours to write. Scripture is 31,000-odd verses that nothing narrows first, so it
gets a real index: migration `004_search.sql` adds `FULLTEXT KEY ft_verses_text`
on `verses.text`.

**Natural language mode, not boolean mode.** Boolean mode reads `+`, `-`, `*`
and `"` out of whatever was typed as operators, so an apostrophe or a hyphen in
a phrase would become a syntax the reader never asked for.

Two InnoDB defaults show through and are not worked around. `innodb_ft_min_token_size`
is 3, so a two-character term matches no verse; and the default stopword list
holds the common English words, so "the" matches none either. Lowering either
means rebuilding the index to answer "a" with a few thousand rows.

### Ranking

`match_rank` is 0 for a title hit and 1 for a body-only hit, so `ORDER BY
match_rank, sort_order, id` puts every title match above every body match and
leaves the row's own order to break ties inside each half. It is one rule and it
lives in one place — `src/lib/search.js` builds the clause for all three content
tiers rather than each tier's own module holding a copy to drift from.

Scripture is ranked by the relevance score instead, with `verse_index` breaking
ties, so equally relevant verses list in canonical order.

### The query is validated before anything is read

`src/lib/searchInput.js`: absent, blank or one character is **400**, as is a
repeated `?q=` and anything over 100 characters. This is not politeness — an
empty term makes the LIKE patterns `'%%'`, which matches every row the caller
has, and the caps would quietly become the answer.

The minimum is 2 rather than 3 because a two-character term still matches note
titles and topic names through LIKE. It only means the scripture group comes
back empty, which is a property of the index and not a bad request.

`%`, `_` and `\` are escaped before they reach a LIKE pattern, so a search for
"100%" is a search for "100%".

### A missing index is loud

`MATCH ... AGAINST` against a column with no FULLTEXT index is MySQL 1191, which
means migration 004 was never applied. The route answers **503** and names the
migration in the log rather than degrading to an empty scripture group — that
would be indistinguishable from a search that genuinely matched no verse.

### Where a result goes

Every row is a link and nothing more. A result is a way to reach the thing, not
a second rendering of it — a note's body belongs in the editor beside the
scripture it points at, and an inline copy here would be a second place to keep
it right.

| Group | Lands on |
|-------|----------|
| Note | `/analyze?l=<book>.<chapter>&note=<id>` — the editor, at its first anchor |
| Idea | `/thoughts?idea=<id>` — the idea view, its notes orbiting it |
| Topic | `/thoughts` — the topics view, where every topic is a card |
| Scripture | `/analyze?l=<book>.<chapter>` — the primary panel on that chapter |

How many topics an idea is filed under does not change its link, and neither
does being filed under none. The tree this replaced could only reach an idea
through a topic — or through the unfiled bucket — so both were special cases
there; the idea view is reached by id, so neither is a case at all now.

A topic gets the bare field because a topic has no view of its own to open. That
is the honest limit of the link and not an oversight: adding a param that merely
scrolled the field would be a second URL contract for a hover's worth of state.

Those URLs are built by two pure modules and not by the search page:
`Analyze/analyzeUrl.js` owns every link **into** Analyze (the Thoughts note cards
use it too), and `Thoughts/thoughtsUrl.js` owns `?idea=`. The page that reads a
param owns the name of it.

### An idea that no longer exists

`/thoughts?idea=7` where idea 7 has since been deleted is not handled on the
client, deliberately. Whether an id names a live row is a question about the
corpus and only the server can answer it — it answers 404, which the page shows
as its error banner with the URL still saying what was asked for.

What *is* handled on the client is a malformed value: anything that is not a
positive integer (`abc`, `-1`, `0`, `1.5`, absent) is the topics view rather than
an error, the same rule `overviewParams` follows for a stale `?topicId=`. A saved
link must not become an error page.

### The page, not the Navbar

The Navbar is the account menu, and it is shown on `/analyze` too, where
horizontal room is the scarce thing. Results are four groups of up to twenty
rows each, all of them links elsewhere, so they want a page's width and a page's
scroll; a dropdown would have to cut the groups short, and a result nobody can
see is how a reader concludes something is not there. The Navbar and
`SearchNav` both link to `/search` instead.

### Debounce

`useDebouncedValue` at 300ms, and the in-flight request is aborted whenever the
query changes. Typing "shepherd" is one request rather than eight, and a slow
answer to "shep" can never land after the answer to "shepherd".

A query below the minimum is not sent at all — the server would refuse it with a
400, and asking it to is a round trip to be told what the page already knows.

---

## Overview page

`/overview` is the whole canon as one vertical axis with three rails beside it.
Phase 6a built the axis — book and chapter ticks, labels, pan and zoom. Phase 6b
added the stems: one horizontal line per note reference, from the axis across to
the notes rail. Phase 6c completed the notes tier — each note's anchors chained
into one arc, a tooltip on hover, and a drawer on click. Phase 6d gave the
ideas and topics rails the same two things, from the same components over the
same references grouped differently, and added the two controls that decide what
is drawn: checkboxes per rail and a filter to one topic, both held in the URL.
Phase 6e — the last, and the one the plan calls "genuinely optional" — adds the
two interactions left on its list: a box that dims every arc whose group is not
called what the reader typed, and a shift-drag that flies the view to the
stretch of canon it encloses.

### One renderer, three rails

The plan's table is the whole of what separates the tiers:

| Tier | Group by | Anchors |
| :---- | :---- | :---- |
| Notes | note | that note's references |
| Ideas | idea | references of all notes linked to it |
| Topics | topic | references of all notes under all its ideas |

They are three readings of one set of rows, so everything downstream of the
query is shared: `anchorPoints` places any tier, `stemModel` and `arcModel` take
a tier and a rail x, `TierStems` and `TierArcs` take a `rail` prop,
`tierLabels` reads any label tier, and `useArcInteraction` resolves a hover to
`(rail, groupId)` rather than to a note. `Overview.js` loops over the rails
being shown; there is no per-tier component and no per-tier branch in the
drawing.

That matters for one property above all: **the same verse is at the same y on
every rail**. It is true by construction rather than by three implementations
agreeing — all three go through `axisModel.yForIndex`. A second copy of the
renderer per tier is exactly how three rails would come to tell three different
stories about one corpus.

One note therefore appears three times over — once as itself, once under each
idea it is linked to, once under each of those ideas' topics. That is the
picture, not duplication to be removed.

### `GET /api/overview?tiers=notes,ideas,topics&topicId=`

Every anchor point the page plots, grouped by the thing it belongs to, in the
compact arrays the build plan specifies, plus a parallel tier of what the page
*says* about each group:

```json
{
  "notes":       [[17, [3, 34, 1051, 19203]], [22, [26136]]],
  "noteLabels":  [[17, "Justified by faith", [[3, 1, 1, 1, 5], [34, 1, 2, 1, 3]]]],
  "ideas":       [[4, [3, 34, 1051, 19203, 26136]]],
  "ideaLabels":  [[4, "Faith as a thread", [[3, 1, 1, 1, 5], ...]]],
  "topics":      [[1, [3, 34, 1051, 19203, 26136]]],
  "topicLabels": [[1, "Faith", [[3, 1, 1, 1, 5], ...]]]
}
```

Six keys, two shapes: a geometry tier and a label tier per rail, built by one
pair of functions from rows that differ only in what they are grouped by. The
three joins are in `src/lib/overviewQueries.js`.

An **anchor** is the midpoint of one reference's `verse_index` range, rounded:
`ROUND((start_index + end_index) / 2)`. A reference is a span, but a stem is one
line and an arc endpoint is one point, so each reference has to collapse to a
single number, and the midpoint is the only choice that does not pull long
passages toward their opening verse.

Anchors are sorted ascending and deduplicated **within a group**, server-side.
That is what the chained arcs need — sort the points, chain the consecutive
pairs — so doing it here means no client ever sorts anything. Two *different*
notes anchored to the same verse keep their own anchor and get their own stem;
deduplication never crosses a group.

Groups with no reference at all — an orphan note, an idea gathering nothing —
are absent from the payload rather than present with an empty array. They are a
legal state, but they anchor to nothing and so draw nothing.

Arrays, not objects: nothing on the page looks a field up by name, and `[17,
[3]]` is a fifth of what `{ "id": 17, "anchors": [3] }` costs once the key is
repeated a few thousand times.

Every one of the three queries is `SELECT DISTINCT` over the reference's own id.
The joins fan out: a note filed under two of a topic's ideas is reached twice,
so its references would arrive twice in that topic's group. The anchor Set would
absorb it, but the reference list a reader reads would print the same passage
twice for a reason that has nothing to do with the passage. Collapsing it at the
source is where it can be seen. The same fan-out reaches the *notes* tier the
moment `topicId` filters it, which is why that query is DISTINCT too.

### The two query params

`tiers` names the rails to return, defaulting to all three, and is applied
**after** the cache rather than before it: the payload is built whole, so a
reader toggling the topics rail off and on is served from memory both times
instead of re-running the widest of the three joins on the way back. The client
requests exactly the rails the URL says to draw, so a rail switched off costs
nothing on the wire and nothing in the join.

`topicId` restricts every tier to what falls under one topic — the plan's own
answer to its open question 2, the cross-testament noise a topic like "Faith"
produces when the whole canon is on one axis. It changes which rows are *read*,
so unlike `tiers` it is part of the cache key. A `topicId` naming a topic the
caller does not own is a **404**, not an empty diagram: every join would simply
match nothing, and "you have written nothing under this topic" and "this is not
your topic" are answers a reader must not have to tell apart by squinting at an
empty rail.

`q` was reserved for 6e and is still not parsed here, because 6e did not need
it: see "Search is client-side, and why" below. An unknown param is ignored
rather than refused, so the plan's `?q=` on this endpoint remains available to a
later phase without breaking the links written today.

#### The label tiers, and why they are parallel

The tooltip has to name what an arc is: "Romans 5:1–5; Hebrews 11:1", under the
group's title. An anchor cannot answer that — the midpoint of 45:1..45:5 is a
verse_index with no memory of the range it came from — so the display data is
shipped too, as `[groupId, title, references]` with each reference the fixed
5-tuple `[anchor, bookId, chapter, startVerse, endVerse]`.

Parallel rather than a third element on each pair, for three reasons. The
geometry tier is read while drawing and the label tier only when a pointer stops
on something. Pairing the two halves of a rail by name (`ideas`/`ideaLabels`)
keeps them obviously the same rail. And nothing that already read `notes` had to
learn a new element when 6d arrived.

A topic's label carries every reference of every note under every one of its
ideas, which is hundreds — so `tierLabels.js` caps what the *summary line*
names at six and counts the rest ("… and 214 more"). The `references` array
itself is never trimmed: `nearestReference` still has to search all of it, or a
click past the sixth passage of a topic would open the wrong chapter.

Two details:

- The anchor is **repeated** from the geometry tier. Those six bytes are what
  let the client answer "which reference did the reader click nearest to?" with
  an equality test rather than by re-deriving chapter spans from `/api/books`.
- References are **not** deduplicated the way anchors are. Two references that
  collapse to the same anchor are still two references and both belong in the
  list a reader reads; it is only the point on the axis they share.

Only the book *id* travels — the client has the canon loaded for the axis
already, and joining the name on there rather than repeating "Romans" a few
thousand times is most of why this tier is affordable. Measured against 250
notes and 1,003 references, the notes tier is 33 KB, or ~390 KB extrapolated to
the plan's ceiling of a few thousand notes. The two tiers above it re-list the
same references under their ideas and topics, so the ceiling is that figure
times (1 + ideas per note + topics per note) — low single digits for a corpus
anyone has actually filed. Still inside the megabyte the plan budgets, and
`?tiers=` is how a reader who does not want the wide ones stops paying.

What is deliberately absent is the note **body**: it is the one field with no
bound on its length, and a few thousand of them would make the request the whole
page waits on scale with how much the reader has written, to draw a picture that
never shows a body. `GET /api/notes/:id` fetches the one that is opened.

### The cache, and what invalidates it

This is the one endpoint that reads a user's entire corpus — three times over,
once per tier — and its answer only changes when the reader writes something. So
`src/lib/overviewCache.js` holds the built payload in memory, per user and per
**topic scope**, until a write makes it wrong.

Per scope, because only `topicId` changes what has to be read; `tiers` is a
selection from a payload built whole and is applied in the route. The number of
entries a user can hold is therefore bounded by the number of topics they have
written plus one, and an invalidation drops all of them — a write to any of the
six tables can change what falls under any topic.

`src/middleware/invalidateOverview.js` is mounted in `server.js` between
`isAuth` and the router on all four content mounts:

```js
app.use('/api/notes',      isAuth, invalidatesOverview, noteRoutes);
app.use('/api/references', isAuth, invalidatesOverview, referenceRoutes);
app.use('/api/ideas',      isAuth, invalidatesOverview, ideaRoutes);
app.use('/api/topics',     isAuth, invalidatesOverview, topicRoutes);
```

Those four routers are the only place `notes`, `note_references`, `note_ideas`,
`idea_topics`, `ideas` and `topics` are written. Mounting the invalidation there
rather than calling it from each of their ~15 write handlers is deliberate: a
write handler added in a later phase is covered the day it is written, and there
is no line for anyone to forget.

Two details that are load-bearing:

- It invalidates on `res.on('finish')`, not on the way in. Dropping the entry
  before the handler runs would leave a window in which the write has not
  committed but the cache is empty — a read arriving in it would rebuild from
  the old rows and cache them, and the page would stay wrong until the next
  write.
- A cache entry carries a **version**, bumped by every invalidation. A rebuild
  that started before a write and finished after it declines to store its
  result. Without that, the interleaving `read → write commits → read stores`
  caches a payload that was stale before it was written. The version is on the
  user's entry, not on one scope of it, so a write invalidates every scope at
  once and a rebuild of any of them is checked against the same counter.

Verified against the live database: a `PUT` returning 200 — which is what both
full-set link endpoints, `PUT /api/notes/:id/ideas` and `PUT /api/ideas/:id/topics`,
return — drops every cached scope, while a `PUT` that 400s and a `GET` drop
none. Both of those endpoints sit behind the `/api/notes` and `/api/ideas`
mounts, so they were covered by the middleware the day it was written; that is
the property the mount-level placement exists to guarantee.

Only 2xx and 3xx invalidate. A 400 or a 404 wrote nothing, and rebuilding for
them would spend a full scan on the requests most likely to be retried.

### Why the stems are not inside the rail group

Everything in the diagram lives in one transformed `<g>`, and the horizontal
half of the zoom is undone by CSS in two different ways:

| Feature | At | Counter-transform |
|---|---|---|
| Axis line, label columns, rail lines | one fixed x | `translateX` (`.overview-pinned`) |
| Book/chapter ticks, **stems** | two fixed x | `scaleX` (`.overview-ticks`, `.overview-stems`) |

The translation holds one x still and lets everything else drift from it by the
zoom factor — right for a column of labels, wrong for a stem, whose axis end
would sit a thousand units off the world at 10x. So `TierStems` is a *sibling*
of `TierRails` rather than a child of a rail, and takes the colour of its tier
from a `data-rail` attribute instead of by inheritance. `TierArcs` sits the same
way, for the same reason: an arc spans the rail it starts on and the bulge out
from it.

That is also what makes three rails fit the frame 6a fixed without moving
anything. `ARC_BULGE.max` is 80 and the rails are 120 apart, so a tier's arcs
stay clear of the tier outside it; a quadratic reaches half way to its control
point, so the outermost rail at x 510 bulges to 550 — inside the 560-unit
world. The numbers 6a chose for an empty page were chosen for this.

Verified in the browser: a stem's horizontal span is pixel-identical from 1x to
400x, left end on the axis and right end on the rail, and an arc's screen
bounding box is 13.6px wide at both 1x and 400x while its height goes from 461px
to 184,496px.

### The one stroke that is not `design × --ov-inverse-scale`

Every other stroke on the page is sized that way, and for a stem it is exactly
right: a stem is horizontal, its stroke is measured vertically, and the vertical
half of the zoom is the half that survives the counter-scale.

An arc is neither horizontal nor vertical. Under the scene's `scale(s)` followed
by the group's `scaleX(1/s)`, x is left alone and y is multiplied by s — so a
near-vertical stretch of an arc comes out at its drawn width and a near-
horizontal one comes out s times wider, and no single multiplier corrects both.
The inverse-scale multiplier would make the vertical stretches — most of a long
arc — vanish at high zoom.

So the arcs use `vector-effect: non-scaling-stroke`, which computes the stroke
after the transform and is therefore constant on screen everywhere along the
curve, at every zoom, with no per-frame work. It is the exception, and the
highlight rules keep arcs and stems in separate selectors so neither is handed
the other's rule by accident.

### Pointing at a curve

Two paths per note, not one: the drawn chain about a pixel wide, and beneath it
the same `d` with a 12px transparent stroke that is the pointer's target. That
is 3 elements per note (a group and two paths) rather than 3 per *arc*, which is
what the chain being one continuous `M ... Q ... Q ...` buys.

`pointer-events: stroke` on the hit path is load-bearing. Without it the browser
also fills the region a curve encloses for hit-testing, and a long arc's sweep
covers much of the rail — every short chain drawn inside it would be
unclickable, and the reader would be pointing at one note and hovering another.

### The highlight is a DOM write, not a render

Hovering a note lights all of its arcs and stems and dims the rest of the tier.
Expressed as React state that is a prop change on every arc and every stem —
a full reconciliation of the drawing per pointer crossing, on the page that goes
to some length to avoid one per wheel notch.

So `useArcInteraction` writes two attributes and CSS does the rest:
`data-focused` on the `<svg>` turns every tier down, and `data-active` on the
handful of elements belonging to one group turns those back up.

A group is `(rail, id)`, never an id alone: note 7, idea 7 and topic 7 are three
different rows and, with all three rails drawn, three different chains on screen
at once. `TierArcs` and `TierStems` publish `data-group-id`, and the rail is
already on the tier group above them as `data-rail`, so the highlight selects
`[data-rail="ideas"] [data-group-id="7"]` rather than stamping the tier onto
every one of a few thousand elements. The previous active set is remembered, so
changing the highlight touches only what enters or leaves it.

Dimming all three rails rather than only the hovered one is deliberate: the
question a lit chain answers is "where does this land, and what else is there?",
and leaving the other two at full strength would drown the answer in the thing
it is being read against.

React still commits once per hovered note, because the tooltip's text is
content — but every child is memoised on props a pointer never changes, so that
commit reaches the tooltip and nothing else.

The listeners are on the `<svg>`, one per event, and resolve the group by walking
up from `event.target` to the nearest `data-group-id` and on to the enclosing
`data-rail`. Stems are
`pointer-events: none`: they light up with their note, but a rail carrying a
thousand hair-thin stems would flicker between notes on every pixel of travel.

### Why a click is not simply a click

`usePanZoom` captures the pointer on every `pointerdown` so a drag running off
the `<svg>` keeps panning. Capture can retarget the events that follow, so the
press is recorded on the way down — where `event.target` is still the arc — and
the click consults that. The same record answers the other half: a click landing
more than 4px from where the press started was a pan, and opens nothing.

Where the click landed *along* the chain decides where the drawer's link goes.
`usePanZoom.toWorldY` removes the viewBox fit and the pan/zoom from the client
y, `axisModel.indexForY` turns that into a verse_index, and
`tierLabels.nearestReference` picks the reference whose anchor is closest. That
is why the anchor is repeated into the label tier: the last step is an equality
test on integers rather than a re-derivation of chapter spans. It earns most on
the upper rails, where a topic's chain runs the height of the canon and its
first reference says nothing about where the reader was pointing.

The drawer itself is one component for all three tiers. `tierDetail.js` maps
whichever of `GET /api/notes/:id`, `/api/ideas/:id` or `/api/topics/:id` was
read into one shape — title, body, a list heading and rows — so the shell never
asks which tier it is showing except at the two places the answer changes what a
reader can *do*: only a note's link opens the Analyze editor (`?l=&note=`) where
the other two position the panel alone, and only a topic offers "show only this
topic", which is the plan's filter reached from the diagram rather than from the
URL bar. Those three endpoints already existed — they are what the Thoughts
page's pinned panel reads too — so there is no `/api/overview/:something` to keep
in step.

The rows inside the drawer are links of their own: an idea's notes and a topic's
ideas each lead to the page that shows one — `/analyze?l=&note=` for a note,
`/thoughts?idea=` for an idea — while a note's references are text and nothing
more, since the drawer was opened from the diagram those references drew.

Verified in the browser against 250 notes and 751 arcs: hovering lit one chain's
5 stems and its arc group and dimmed every other arc to 0.08; the tooltip read
"Exodus 8:31–32; Judges 14:15–19; Ezra 3:9–13; Proverbs 31:5–9; Acts 20:21–25";
clicking near the foot of that chain opened the drawer with the rendered body
and a link reading "Open in Analyze at Acts 20:21–25"; a drag beginning on an
arc panned and opened nothing; and all of it still worked at 5x zoom.

### The URL is the page's state

Which rails are drawn, which topic the diagram is restricted to and what the
reader is searching for live in the query string, the same convention the
Analyze page's panel positions follow:

```
/overview                       all three rails, the whole corpus
/overview?tiers=notes,topics    two rails
/overview?topicId=3             all three rails, restricted to topic 3
/overview?q=faith               everything drawn, arcs named "faith" lit
```

The back button undoes a toggle, a reload keeps it, and "look at this, topics
only, under Faith" is a link rather than a list of instructions. `overviewParams.js`
holds the names and the parsing and is pure, so a link *into* the page — the
drawer's "show only this topic" — needs no hook; `useOverviewParams` is the
`useSearchParams` half. Nothing normalises, so nothing replaces on the toggle
path: a bare `/overview` stays bare and the param appears the moment a default
stops being true.

Typing is the one exception to that last rule, and `?q=` is **replaced** into
the current history entry rather than pushed. A search term is not one decision
but a stream of them; pushing per settled burst would bury the page the reader
came from under one entry per word, and a reader who searched and then wanted
to leave would press back eight times to get out. They still get both things
the URL is for — a reload that keeps the filter and a link that carries it —
without a back button that walks backwards through their own typing.

A whitespace-only `?q=` reads as no search at all. Dimming the whole diagram
over a stray space is the one reading of it that helps nobody; beyond that the
value is taken as typed, because case and punctuation are the matcher's
business and normalising here would leave the box and the address bar
disagreeing about what the reader wrote.

Two parsing rules earn their place. `?tiers=nonsense` falls back to all three
rather than to nothing — a stale or hand-edited link should show the page, not a
blank frame with no way back — while `?tiers=` (the empty value) really does
mean none, because a reader who unticks every box has said something specific.
And a malformed `?topicId=` is ignored rather than refused, so a link from a
deleted topic still draws; a *well-formed* id naming a topic that does not exist
is the server's answer to give, and it gives a 404.

### Search is client-side, and why

The plan's API surface reserves `?q=` on `/api/overview`, and 6e does not use
it. Every group's **title** is already in the payload — it is what the tooltip
prints — so narrowing to "the ones I called covenant" is a substring test over
data that has arrived, not a round trip. The request path in `useOverviewData`
is built from `tiers` and `topicId` alone and does not move when the term does,
so typing costs nothing on the wire and never re-runs the three joins.

What that buys beyond the request: the filter cannot get out of step with the
picture. A served `q` would mean a payload that answers one term while the
drawing on screen was built from another, for as long as the request is in
flight — a page that is briefly, invisibly wrong on precisely the control whose
feedback loop is one keystroke long.

What is deliberately **not** matched is the note body. It is the one field with
no bound on its length and it is not in this payload at all, by the same
decision that keeps the payload affordable. `/search` is the page that reads
bodies; this box narrows the picture already on screen.

#### Filter, not hide

The plan's own wording — "filter to matching arcs rather than hiding others
outright" — and nothing in `useArcSearch` uses `display`. This page's entire
content is *where* a chain falls, and an arc taken out of the drawing takes its
position with it: every arc left would then look equally central against an
axis with nothing else on it. So the unmatched are dimmed to 0.06 and stay
exactly where they were.

A term that matches nothing therefore dims the whole diagram, which is the
honest answer and looks exactly like a page that has lost its data. The status
line beside the box is what tells the two apart, the same job the `?topicId=`
banner does for the other filter.

#### Two filters, along two axes

`?topicId=` is structural and served: it asks the database what falls under one
topic, and every rail is restricted to that. `?q=` is textual and local: it asks
which groups the reader *called* something. They compose, and each answers a
question the other cannot — a note titled "faith" is a real answer to "what did
I name this?" whether or not anyone ever filed it under the topic, and a note
filed under Faith is a real answer to "what is here?" whatever it is called.
That is also why the search matches each rail on its own titles rather than
following the links between the tiers: the transitive reading of "show me Faith"
already exists, better, one control over.

#### The marks are a DOM write, for the third time

`data-searching` on the `<svg>` turns the tiers down and `data-match` on the
groups that matched turns those back up — the highlight's mechanism exactly,
with different attribute names because the two states are independent. A reader
can hover a chain while a search is running, and the search rules sit **above**
the highlight rules in `Overview.css` so hover wins: a search narrows the field,
and a hover then picks one thing out of what is left, including out of what the
search dimmed.

Passing the matched set down as a prop would work and would re-reconcile a few
thousand paths per settled keystroke, on a page that declined that trade for the
hover highlight and for the whole of pan and zoom.

Two details in `useArcSearch` are load-bearing:

- The write is **per rail**, not per matched group. A one-letter term matches
  nearly everything, and a `querySelectorAll` per match would then be thousands
  of selector runs on a keystroke; asking each drawn rail once and testing
  membership against a `Set` bounds it at three queries whatever matched.
- Its callback ref does **not** close over the matches. React calls a callback
  ref with null and then with the node again whenever the callback's identity
  changes, and `Overview.js` composes four such refs onto one `<svg>` — so a ref
  that changed per keystroke would detach the element from all four hooks,
  taking `usePanZoom`'s wheel listener off and putting it back, and clearing
  this hook's record of what it had marked while the marks stayed on the
  elements. The first search then leaves its highlight behind for the next one
  to add to. That was found by a test, not by looking.

### Magnify: zoom to a region, not a fisheye

The plan offers "a fisheye on the axis, or simpler, a zoom-to-region on drag",
and names magnify "the feature most likely to be cut". The second is what is
built, and the reason is the same one that shapes everything above it.

A fisheye is a second, non-linear mapping from `verse_index` to y running
alongside the linear one, and every tick, stem and arc on the page is placed
through the mapping. Non-linear means it cannot be applied as a transform, so it
would have to be re-derived per frame for a few thousand elements — the one cost
this page is arranged from top to bottom not to pay. It would also mean two
mappings that have to agree, on a page whose central property is that the same
verse is at the same y on every rail *by construction*.

A region drag produces a scale and a translation — the same pair a wheel notch
produces. So everything already written to hold strokes, labels and stems still
under zoom holds them still under this, and the magnified view is the ordinary
view. `viewport.viewportForRange` is the whole of it.

**Shift, not a mode.** Plain drag already means pan and has to keep meaning it.
A toolbar toggle would free the plain drag but adds a state the reader has to
remember being in; a modifier lasts exactly as long as the key is held and
cannot be left switched on. The hint line beside the toggles is what makes it
discoverable, since a modifier is otherwise invisible. `Overview.js` routes the
`pointerdown` — region, or pan-and-maybe-click — so neither `usePanZoom` nor
`useArcInteraction` knows this gesture exists. A shift-press deliberately does
not reach the arc hook either, or a short shift-drag would land inside the click
slop and open a drawer on top of the view it had just flown to.

**Two coordinate systems, on purpose.** The band is *drawn* in fitted
coordinates, as a sibling of the transformed scene, so it needs no
counter-transform and sits under the pointer at any zoom — it is a report of
where the pointer has been, not part of the drawing. The range it *resolves* to
is in world coordinates, because that is what is flown to and it must not move
when the transform does. Both ends of the drag are recorded through both
conversions at the moment they happen; converting one to the other afterwards
would mean reading a transform the flight is in the middle of changing.

**Why it is animated.** A hard cut from the whole canon to a tenth of it leaves
nobody any way to tell what they are now looking at. The flight is 320ms of
`requestAnimationFrame` writing the transform through the same `apply` a wheel
notch uses — so it is frames of two DOM writes and still no re-render, and the
wheel, a drag and the reset button interrupt it simply by calling `apply`
themselves. Scale is interpolated **geometrically** and the content point at the
centre of the box **linearly**: zoom is multiplicative, so a linear lerp of the
scale spends most of a 1x → 40x flight already past 20x and reads as a lurch
then a crawl. `prefers-reduced-motion` gets the destination and not the journey.

Reset — the plan's "fit all" — stays instantaneous and cancels any flight. It is
the escape hatch for a reader who is lost, and an escape hatch that takes a
third of a second to open is one you press twice.

A drag shorter than `MIN_REGION_SPAN` (10 fitted units, a few pixels on any
screen) is discarded rather than obeyed: a shift-click is a slip of the hand,
and flying to the ceiling zoom somewhere the reader never chose is the one
outcome of this feature that is genuinely hard to recover from. A *cancelled*
pointer flies nowhere either — the reader never let go, so they never said
where.

#### Verified in the browser

Against the seeded corpus of 20 notes, 6 ideas and 4 topics (30 groups, 89
stems, 18 chains):

- Typing "faith" put `?q=faith` in the URL and lit 6 of 30 groups across all
  three rails, with the unmatched arcs at computed opacity 0.06 and the matched
  at 1 — and all 18 chains and all 89 stems still in the DOM. Clearing the box
  removed the param and every mark.
- A shift-drag from fitted y 400 to 500 drew a full-width band at exactly
  `y=400, height=100`, left the scene transform untouched while it was pulled,
  and on release flew to `scale 9.9998` — where world y 300 projected to fitted
  **0.04** and world y 400 to **1000.02**, i.e. the selected range filling the
  1000-unit box.
- In that landed view `--ov-inverse-scale` was 0.100002, the book label measured
  8.5px tall, a stem 78.4px wide and a book tick 8.96px — the same on-screen
  sizes as at rest, so the counter-scales survive a region zoom exactly.
- `/overview?tiers=notes,topics&topicId=12&q=babylon` drew two rails, showed the
  topic banner, reported "1 of 7 highlighted", and still opened the drawer with
  its body, references and Analyze link on a click. Hovering a chain the search
  had dimmed lit it to opacity 1, which is the composition the CSS ordering
  exists to give.

### Where virtualisation would go

The plan reserves it for "when you actually have thousands", which is not yet.
When it is, the filter belongs in `TierArcs` and nowhere else: take the current
viewport (`usePanZoom` already holds it) and render only the arcs whose y span
intersects it, keyed by `groupId` so React reuses the paths that survive. Two
things make it safe to defer — `buildArcs` is pure and returns each group's
points, so the filter is a predicate over data the component already has, and
the highlight walks the live DOM by attribute, so an arc out of the tree is
simply not found rather than found and stale. What it will cost is a re-render
per pan, which is the thing this page is arranged to avoid; hence it waits for a
page that is measurably too slow without it.

### Verifying a stem is where it claims to be

A stem in the wrong place is not a visible failure — it is a line that reads
perfectly well and points at the wrong book. The check the plan asks for, and
the numbers it produced, are recorded in the header of
`components/Overview/stemModel.js`: four notes across the canon, each anchor's y
inverted back to a `verse_index`, that index resolved to a book and chapter
through the spans `/api/books` ships, and the answer compared with the chapter
whose `GET /api/notes?bookId=&chapter=` returns the note — which is the list the
Analyze page's notes panel renders.

---

## Testing

```bash
npm run test:client              # watch mode, from the repo root
CI=true npm run test:client      # single run (CI, pre-commit)
```

Run it through the root script (or `npm test --prefix src/client`) rather than
invoking `react-scripts` from the repo root: CRA derives `rootDir` from the
working directory, and from the root it fails to find `src/setupTests.js` — the
jest-dom matchers then silently go missing and assertions fail for the wrong
reason.

Client tests live beside the code they cover (`components/Analyze/*.test.js`,
`components/Thoughts/*.test.js`). The pure modules are tested directly —
`navigation.test.js` for chapter stepping (book boundaries, canonical order,
clamping at both ends of the canon), `highlights.test.js` for the per-verse tint
rules, `verseSelection.test.js` for turning a verse-index range into a reference,
`selectionRuns.test.js` for cutting a clicked selection into contiguous runs,
`markdown.test.js` for rendering and sanitizing a note body, `slug.test.js` for
the topic slug rule, `MultiSelect.test.js` for toggling a selection immutably,
`format.test.js` for the count labels, `linkRules.test.js` for which selections
of pinned rows may be linked and into which pairs — the module three separate
reads of the Link button all go through — `fieldLayout`/`fanLayout`/
`orbitLayout.test.js` for the three card placements, including the two ways a
fan fails (a topic at an edge, a topic with many ideas), `useThoughtsView.test.js`
for the `?idea=` contract in both directions, and `searchModel.test.js` for where
each kind of search result leads, which is the part of that page a wrong answer
hides best: the link looks fine and the destination is simply not the thing that
matched.

`Analyze.test.js` drives the rendered page against a **stateful** mock API. It
is stateful on purpose: the flows worth testing are round trips — create a note,
then assert the highlight the server reports on the next chapter fetch — and a
canned response would let a client-side guess pass. The mock recomputes
`start_index`/`end_index` and re-runs the overlap query exactly as the server
does, and it holds the ideas tier and its link table so a note payload carries
`ideas` the way the real one does.

`Thoughts.test.js` drives `/thoughts` against a mock of the same kind, and what
it exists for is the one property neither hook can assert alone: **creating pins
what it created.** `useThoughtsData` makes the row and `usePins` pins it, and the
page is the only thing that knows they are about the same item — so the test runs
the whole round trip through the real components, the bar's button into the
modal's fields into the panel's list. A create that forgot to pin, or pinned the
wrong id, fails here and nowhere else.

`PinnedPanel.test.js` covers the panel as the page's only editing surface: that
a checked selection puts both actions in front of the reader and that Unpin acts
on exactly the rows checked, by checkbox or by row click; that Link is enabled,
hinted and fired from the one `evaluateLink` call; and that Clear asks twice.

`TopicsField.test.js` drives the real `useThoughtsView` rather than a stub prop,
so "clicking a fanned idea card opens the idea view" is an assertion about the
URL and not about a callback having been called.

`Search.test.js` drives `/search` against a mock that matches the way
`src/lib/search.js` does rather than returning canned rows: one word has to
reach a note body, an idea title, a topic description and a verse, and each
group has to rank a title hit above a body hit. A fixed payload would let the
page pass while the query it sent was wrong — and the query is half of what that
page does. It runs on fake timers, because the debounce is the other half:
"five keystrokes, one request" is an assertion about time.

`Overview.test.js` holds four lines no screenshot can. The first is that pan
and zoom never re-render: a `Profiler` counts commits across a wheel gesture and
a drag, and expects none — with the stems and the arcs in the tree as well as
the ticks, since a few thousand of them redrawing per wheel notch is the failure
the whole page is arranged to avoid. The second is that a stem and the axis mark
for the same verse land on the same y, asserted against the linear rule spelled
out in the test rather than imported from the page, so the two cannot be wrong
together.

The third is the count of the arcs. A note with four references has to produce
three curves and not six, and that is the phase's one failure that looks like a
feature: pairwise arcs read as a denser, richer note rather than as a bug, and
by the time anyone notices, the cost is quadratic in what the reader has
written. So a fixture note carries four references specifically to tell 3 from
6, and the same property is asserted on the geometry directly in
`arcModel.test.js` — including that it survives an anchor being dropped for
naming no verse.

The fourth arrived with 6d, and it is why that suite's mock **derives** the
ideas and topics tiers from two link tables the way `src/lib/overviewQueries.js`
derives them, rather than shipping a fixture for each rail. A hand-written ideas
tier would let the page pass while the grouping it exists to show was wrong. So
the store holds notes, their references, `note_ideas` and `idea_topics`, and
answers `/api/overview` by walking them — which makes "link a note to an idea
and its anchors appear on the idea's chain" an assertion about a round trip, and
"the same verse is at the same y on all three rails" an assertion about one
mapping rather than three fixtures that happen to agree. The mock also reads the
query string it was sent, so "the request asked for one tier" and "the response
carried one tier" are the same fact.

One more line that no screenshot and no DOM assertion can hold: `buildArcs` must
run when a payload lands and at no other time. Hovering legitimately commits
React — the tooltip is content — and a rebuilt arc has a byte-identical `d`, so
the only way to see the difference is to count the calls. The suite wraps
`arcModel` in a counter and asserts that a dozen pointer events across two rails
rebuild nothing. It fails without the `useMemo` in `useOverviewParams`, which is
the point: `tiers` is parsed out of the URL on every render, and an unmemoised
array would re-derive every chain on every rail per pointer crossing.

The rest of that suite covers the two controls: a toggle removes a rail's arcs,
stems and heading and writes `?tiers=` (and *removes* the param when every rail
is back on, since a URL carries departures from the default); a URL arriving
with `?tiers=topics` draws only that rail and asks the server only for it;
`?tiers=` asks for nothing at all; and `?topicId=` restricts every rail, is sent
to the server rather than applied to the answer, is announced on the page with a
way back, and reports a topic that is not the reader's without losing the axis.

`arcModel.test.js` and `stemModel.test.js` cover the rail parameterisation
directly — the same tier hung on two different rails has identical ys and
different xs, and a whole-canon arc on the outermost rail stays inside the
world. `tierLabels.test.js` covers the summary cap: a topic's tooltip names the
first few passages and counts the rest, while the `references` array it searches
for a click keeps all of them.

The rest of the arc suite is about the interaction rather than the drawing:
hovering one arc lights that note's whole chain *and* its stems and dims
everything else; the pointer crossing to another note moves the highlight;
leaving the drawing puts everything back; and the arc elements are asserted to
be the *same DOM nodes* before and after a hover, which is the assertion that
the highlight is not quietly re-rendering the tier. Clicking asserts the drawer
opens on the right note, that its body is fetched rather than carried in the
overview payload, that the "open in Analyze" link follows the *end of the chain
the reader clicked* — the same chain clicked at its head and at its foot has to
give two different chapters, or the nearest-anchor rule is not being applied at
all — and that a drag beginning on an arc opens nothing.

`stemModel.test.js` and `arcModel.test.js` also cover the payload boundary:
an anchor naming no verse on the axis, a malformed pair, an empty tier.
`tierLabels.test.js` covers the other half of it — a reference tuple missing a
field, an untitled group (named after the rail it is on, since "Untitled note"
over a topic arc is a sentence about the wrong thing), and the canon not having
loaded yet, which is reachable because the page's two requests resolve
independently and a hover can land between them. `axisModel.test.js` asserts `indexForY` is the exact inverse of
`yForIndex`, since a click goes one way through that pair and the drawing goes
the other.

6e adds two more suites and two more lines. `arcSearch.test.js` covers the
matching directly, and the assertion worth having there is that an *empty* box
is "no search" rather than "a search for nothing": a term that matches nothing
legitimately dims the whole diagram, so the two states are indistinguishable on
screen until a reader clears the box and the page goes blank. It also asserts
the property that makes this a filter rather than a search — typing more of a
word can only take matches away.

In `Overview.test.js`, every test that asserts something is dimmed also asserts
it is still in the DOM, and the arc counts per rail are compared before and
after. That is the plan's "filter, don't hide" written down as something that
can fail. Alongside it: the term reaches `?q=` and leaves again when the box is
cleared; a link arriving with `?q=` fills the box and marks the drawing; a rail
switched on *during* a search arrives already filtered (which is why the search
effect depends on the geometry and not only on the term); a hover still lights a
chain the search dimmed; and the server is asked nothing at all while the reader
types. One test exists purely for a bug the suite found — that changing the term
must not leave the previous term's marks behind, which is what an unstable
callback ref on a shared `<svg>` produces.

The magnify tests lean on jsdom running a real animation-frame loop, so the
flight is left to fly and waited out. They assert that nothing has moved by the
time the release returns (it flies, it does not cut), that the landed transform
projects the selected range onto exactly the fitted box, that
`--ov-inverse-scale` is still the reciprocal of the scale afterwards, that a
drag shorter than `MIN_REGION_SPAN` and a cancelled pointer both fly nowhere,
that a shift-drag beginning on a chain opens no drawer, that a wheel notch takes
over from a flight already under way, and that none of it rebuilds a single arc.
`viewport.test.js` covers `viewportForRange` and `interpolateViewports` as
arithmetic: a range dragged upwards reads the same as one dragged down, a
hairline band is clamped to `MAX_SCALE` and *centred* rather than pinned to the
top, and the flight steps the scale by a constant ratio while moving the centre
of the view at an even rate.

Note what this cannot cover: jsdom dispatches the drag events, it does not
implement dragging. That the browser starts a drag from a `draggable` row, and
that `preventDefault` in `dragover` is what makes a row droppable, are verified
by reading the spec and by using the page, not by this suite.

The same limit applies to the Overview arcs, and further. jsdom has no layout
and no SVG geometry, so it cannot answer whether a 1px curve can actually be
hit, whether `pointer-events: stroke` keeps a long arc from swallowing the
clicks inside its sweep, or whether `vector-effect: non-scaling-stroke` holds a
stroke still at 400x. Those were checked in a browser against a seeded corpus of
250 notes; the numbers are recorded in the Overview page section above. 6e's
two gestures were checked the same way — the band's position and the landed
transform read straight off the live DOM, and the on-screen size of a label, a
stem and a tick compared against their resting sizes to confirm the
counter-scales survive a region zoom. Those numbers are recorded there too.

The server has no test runner of its own — the root `package.json` has only
`test:client`. The three joins of 6d were therefore verified by seeding a
corpus directly into MySQL and reading `buildOverviewPayload` back: an idea
anchored every note linked to it, a topic anchored every note under all of its
ideas, a note reached through two of a topic's ideas was listed once rather than
twice (the DISTINCT), an unfiled note appeared on the notes rail and vanished
under `topicId`, and `selectTiers(payload, ['ideas'])` returned exactly
`ideas` and `ideaLabels`. The cache invalidation was checked the same way, by
driving the middleware directly: a `PUT` returning 200 dropped every cached
scope, a `PUT` returning 400 and a `GET` dropped none.

---

## How to Add a New Page

### Client side

1. Create the component: `src/client/src/components/FeatureName/FeatureName.js`
2. Import it in `src/client/src/routes.js`
3. Add an entry to the routes array:
   ```js
   { path: '/feature', element: <ProtectedRoute><FeatureName /></ProtectedRoute> }
   ```
   - Wrap with `<ProtectedRoute>` for JWT-gated pages
   - Wrap with `<UnprotectedRoute>` for pages that redirect logged-in users away
   - No wrapper = fully public

### Server side (new API route)

1. Create `src/routes/featureName.js` following the pattern in `src/routes/user.js`
2. Import and mount it in `src/server.js`:
   ```js
   const featureRoutes = require('./routes/featureName');
   app.use('/api/feature', isAuth, featureRoutes);   // protected
   // or
   app.use('/api/feature', featureRoutes);             // public
   ```
3. Call it from the frontend:
   ```js
   fetch(`${process.env.REACT_APP_URL}/feature/endpoint`, {
       headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
   })
   ```

---

## TODO Placeholders

| File | Placeholder | What to fill in |
|------|------------|-----------------|
| `.env.example` | `DB_HOST/USER/PASSWORD/NAME` | Your MySQL connection details |
| `.env.example` | `JWT_SECRET` | Strong random string (≥32 chars) |
| `.env.example` | `SESSION_SECRET` | Strong random string (≥32 chars) |
| `src/client/.env.example` | `REACT_APP_URL` | Your API base URL |
| `src/db/db.js` | env var comments | Filled by `.env` — no code change needed |
| `src/routes/auth.js` | `admin` table name | Replace with your actual users table |
| `src/routes/auth.js` | JWT payload fields | Add/remove to match your user schema |
| `src/routes/user.js` | `admin` table name + columns | Match your schema |
| `src/server.js` | route imports | Add new route files as you build features |
| `src/client/src/components/Home.js` | Logo, tagline, CTAs | Brand assets |
| `src/client/src/components/Navbar.js` | SVG icon, nav links | Your profile icon and navigation |
| `src/client/src/components/Dashboard/Dashboard.js` | Quick links section | Real feature pages |
| `src/client/src/index.css` | `--color-primary` etc. | Your brand color palette |

---

## CSS Variable System

All design tokens live in `:root` in `src/client/src/index.css`. Component CSS
files reference variables by name — change a token once, it applies everywhere.

Key groups:

```css
--color-primary / --color-primary-hover / --color-primary-active  /* main action color */
--color-accent  / --color-accent-hover                             /* secondary action */
--color-danger                                                     /* errors */
--bg-dark / --bg-card / --bg-alt / --bg-input                     /* backgrounds */
--text-primary / --text-secondary / --text-muted / --text-white   /* type */
--space-xs through --space-xl                                       /* spacing scale */
--radius-sm / --radius-md / --radius-lg                            /* border radius */
--shadow-sm / --shadow-md / --shadow-lg                            /* box shadows */
--font-sm / --font-base / --font-md / --font-lg / --font-xl        /* type scale */
```

To theme the app, only edit the `:root` block. Do not hardcode color or spacing
values in component CSS — always reference a variable.

---

## Conventions

- **Components** — PascalCase filenames, one component per file, under `src/components/<Domain>/`
- **CSS** — one `.css` per domain in `src/components/Styling/`, imported by the component that owns it
- **Routes** — all client routes defined in `routes.js` as a flat array; never use `<Route>` directly in components
- **API calls** — always use `process.env.REACT_APP_URL` as the base; never hardcode `localhost`
- **Auth header** — always `Authorization: Bearer ${localStorage.getItem('token')}`
- **Error handling** — handle every HTTP status code explicitly; never silently swallow errors
- **Immutability** — use spread `{ ...obj, field: value }` for state updates; never mutate state directly
- **No console.log in production** — remove debug logs before committing

---

## Quick Start

```bash
# 1. Copy env files and fill in TODOs
cp .env.example .env
cp src/client/.env.example src/client/.env

# 2. Install server deps
npm install

# 3. Install client deps
npm install --prefix src/client

# 4. Run both in parallel (requires concurrently)
npm run dev
#   server → http://localhost:3001
#   client → http://localhost:3000
```
