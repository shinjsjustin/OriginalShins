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
    │       ├── 005_pins.sql        # pins: the Thoughts page's editable set
    │       ├── 006_reading_location.sql # where each reader left off
    │       ├── 007_chapter_ideas.sql# ideas filed against a chapter
    │       ├── 008_note_topics.sql # notes filed directly under a topic
    │       └── 009_topic_books.sql # topics + ideas gain book_id; slug unique per (user, book)
    ├── lib/                        # Query + validation modules the routes share
    │   ├── params.js               # Positive-integer parsing, canon bounds
    │   ├── chapters.js             # Chapter lookup + a chapter's verses
    │   ├── references.js           # note_references reads/writes; index resolution
    │   ├── notes.js                # notes reads/writes, all scoped by user_id
    │   ├── ideas.js                # ideas reads/writes + the cross-tier lookups
    │   ├── ideaTopics.js           # Hydrates a list of ideas with their topics; the ideas/topics seam
    │   ├── topics.js               # topics reads/writes, list counts, both note_topics reads
    │   ├── chapterIdeas.js         # chapter_ideas reads/writes: the ideas imported into one chapter
    │   ├── links.js                # note_ideas / idea_topics / note_topics: full-set replace
    │   ├── ordering.js             # sort_order + re-parenting (server-side only)
    │   ├── slug.js                 # Topic slug derivation + validation
    │   ├── textInput.js            # Shared body-validation primitives
    │   ├── noteInput.js            # Request-body validation for the notes API
    │   ├── ideaInput.js            # Request-body validation for the ideas API
    │   ├── chapterIdeaInput.js     # Request-body validation for PUT /api/chapter-ideas
    │   ├── topicInput.js           # Request-body validation for the topics API
    │   ├── pinInput.js             # Request-body validation for the pins API
    │   ├── locationInput.js        # Request-body validation for PUT /api/user/location
    │   ├── pins.js                 # pins reads/writes + the hydrating joins
    │   ├── location.js             # Reads/writes the saved Analyze location on the admin row
    │   ├── searchInput.js          # The one query param /api/search takes
    │   ├── search.js               # The four search queries + their ranking rule
    │   ├── snippet.js              # Pure: the excerpt a result shows
    │   └── passages.js             # The scripture text behind a note's anchors (Thoughts page only)
    ├── scripts/
    │   ├── import-scripture.js     # CLI: npm run import:scripture
    │   └── scripture/
    │       ├── canon.js            # the 66-book canon (names, abbrevs, testament)
    │       ├── source.js           # download or read the source JSON
    │       ├── build-rows.js       # transform + assign verse_index
    │       ├── load-rows.js        # transactional clear-and-reload
    │       └── verify.js           # post-import count assertions
    ├── middleware/
    │   └── isAuth.js               # JWT Bearer token validator
    └── routes/
        ├── auth.js                 # POST /api/auth/register, /api/auth/login
        ├── user.js                 # GET  /api/user/me  (protected)
        ├── books.js                # GET  /api/books    (protected, cached)
        ├── chapter.js              # GET  /api/chapter/:bookId/:chapter
        ├── notes.js                # GET/POST/PATCH/DELETE /api/notes (+ one note, references, ideas, topics)
        ├── references.js           # DELETE /api/references/:id
        ├── ideas.js                # CRUD /api/ideas (?book=, bookId required) + PUT /api/ideas/:id/topics
        ├── chapterIdeas.js         # GET/PUT /api/chapter-ideas (one chapter's imported idea set)
        ├── topics.js               # CRUD /api/topics (?book=, bookId required; list carries counts + direct notes)
        ├── search.js               # GET /api/search?q= (four groups)
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
            │   ├── UnprotectedRoute.js # Redirects to /analyze if logged in
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
                ├── Books/              # The 66-book grid, shared by two pages
                │   └── BookGrid.js         # Split by testament; reports a book id and nothing more
                ├── Analyze/            # The Analyze page: scripture + notes
                │   ├── Analyze.js          # Page shell; owns cross-panel state only
                │   ├── ScripturePanel.js   # One chapter + its footer (controlled)
                │   ├── VerseRow.js         # One verse: rail, tint, click-to-select
                │   ├── NotesPanel.js       # Notes + ideas; follows the PRIMARY panel
                │   ├── PanelHeader.js      # Label, passage, and the collapse tab
                │   ├── CollapseTab.js      # Pushes a side panel aside
                │   ├── PanelSpine.js       # What a pushed-aside panel becomes
                │   ├── PendingSelectionTray.js # What's selected right now, across the canon
                │   ├── NoteListItem.js     # One row of the notes list
                │   ├── IdeaListItem.js     # One row of the ideas list
                │   ├── IdeaComposer.js     # Inline capture for a standalone idea
                │   ├── NoteEditor.js       # Read/edit one note + its references
                │   ├── NoteFiling.js       # An open note's idea + topic membership, and the picker to change it
                │   ├── PanelFooter.js      # ← | Book | Chapter | →
                │   ├── BookPicker.js       # Modal grid of all 66 books
                │   ├── ChapterPicker.js    # Modal grid of one book's chapters
                │   ├── Modal.js            # Overlay shell (Escape / backdrop)
                │   ├── navigation.js       # Pure position + chapter-step helpers
                │   ├── panelParams.js      # The names of the ?l= ?r= ?note= params
                │   ├── analyzeUrl.js       # Pure: every link INTO this page
                │   ├── highlights.js       # Pure: references -> per-verse tints
                │   ├── pendingSelection.js # Pure: the reader's clicked-verse basket, across chapters
                │   ├── selectionRuns.js    # Pure: clicked verses -> contiguous refs
                │   ├── chapterIdeas.js     # Pure: which of the chapter's ideas to shortlist in the panel
                │   ├── noteFilingSets.js   # Pure: add/remove one id from a note's idea or topic set
                │   ├── savedLocation.js    # Pure: the saved-location payload <-> the page's query params
                │   ├── markdown.js         # marked + DOMPurify; list excerpts
                │   ├── useBooks.js         # Loads /api/books once
                │   ├── usePanelPositions.js# Reads/writes ?l= (primary) and ?r=
                │   ├── useNotes.js         # The chapter's notes + every write
                │   ├── useCollection.js    # One list + its fetch/revision plumbing
                │   ├── useIdeas.js         # /api/ideas + PUT :id/topics
                │   ├── useChapterIdeas.js  # /api/chapter-ideas + its import/remove writes
                │   ├── useActiveNote.js    # Which note the editor is showing
                │   ├── useSelectedVerses.js# The page's one verse selection
                │   └── useSavedLocation.js # Reads the saved location on arrival, writes it as the reader moves
                ├── Thoughts/           # /thoughts — the three tiers as one canvas, scoped to one book
                │   ├── Thoughts.js         # Page shell; owns which card is selected
                │   ├── TopBar.js           # Reset View, the two Create buttons, the crumb
                │   ├── BookTitle.js        # The clickable "${Book} Topics" title; the page's book control
                │   ├── IdeaOrbit.js        # The idea view: one idea, its notes ringing it
                │   ├── PinnedPanel.js      # The right-docked panel: the page's only editor
                │   ├── PinnedItem.js       # One pinned row, and the form it becomes
                │   ├── CreateModal.js      # Make a topic or an idea, without leaving
                │   ├── ConfirmButton.js    # Two-press Clear and Delete
                │   ├── orbitLayout.js      # Pure: an idea's notes -> the ring they orbit
                │   ├── linkRules.js        # Pure: a pinned selection -> may it be linked
                │   ├── slug.js             # Client half of the slug rule
                │   ├── format.js           # "2 ideas", "0 notes"
                │   ├── thoughtsUrl.js      # Pure: every link INTO this page
                │   ├── useThoughtsView.js  # Reads/writes ?idea= — which view is showing
                │   ├── useThoughtsData.js  # The three tiers + every write the canvas makes
                │   ├── usePins.js          # /api/pins, optimistically
                │   └── useBookScope.js     # Resolves the book in scope: ?book=, the open idea, saved location, or Genesis
                ├── Bubbles/            # The field-of-bubbles UI shared by the topics view and the import picker
                │   ├── BloomCluster.js     # One anchor card + the fan it opens on hover
                │   ├── BubbleCard.js       # One card on the Thoughts canvas: topic, idea, note, or unfiled
                │   ├── BubbleOverlay.js    # Full-screen shell a field of bubbles floats in (Escape / backdrop)
                │   ├── ImportPicker.js     # Picking one topic or idea out of the field, with a confirm step
                │   ├── TopicIdeaField.js   # The topics view: a card per topic + unfiled, each blooming its ideas
                │   ├── cardGeometry.js     # Pure: the box sums both canvases share
                │   ├── fanLayout.js        # Pure: a topic's ideas -> the fan they open on
                │   ├── fieldLayout.js      # Pure: N topics + a canvas -> where each sits
                │   ├── useBloom.js         # Which card is blooming — hover, lock, Esc — shared by both canvases
                │   ├── useCanvasSize.js    # The measured pixel size a layout is given
                │   ├── useImportCorpus.js  # The import picker's own book-scoped topics + ideas read
                │   └── Bubbles.css         # The overlay shell + cluster geometry; cards styled by Thoughts.css
                ├── Search/             # /search — one box across all four tiers
                │   ├── SearchPage.js       # Page shell: the input and the states
                │   ├── SearchGroup.js      # One heading + its rows, all links
                │   ├── SearchNav.js        # Thoughts | Search | Analyze
                │   ├── searchModel.js      # Pure: the groups and where a row goes
                │   ├── useSearch.js        # Debounced query -> one request
                │   └── useDebouncedValue.js# Generic: a value that has settled
                └── Styling/
                    ├── Form.css        # Auth/form container styles
                    ├── Home.css        # Landing page + .industrial-button
                    ├── Navbar.css      # Profile icon + dropdown panel
                    ├── Books.css       # BookGrid's own rules, ported from Analyze.css's book-picker block
                    ├── Analyze.css     # Analyze page panels, footers, modals
                    ├── Search.css      # Search page: the box, the nav, the result groups
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
                          → navigate('/analyze')

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
mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/006_reading_location.sql
mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/007_chapter_ideas.sql
mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/008_note_topics.sql
mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/009_topic_books.sql

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
It exists so another page can hand a note over — the search results link to
`/analyze?l=<book>.<chapter>&note=<id>`, the chapter of the note's first
anchor, built by `Analyze/analyzeUrl.js`'s `analyzeUrlForNote`.
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
| `GET /api/topics?book=` | Every topic in that book with `ideaCount` and `noteCount`. The note count walks topic → idea → note and counts DISTINCT notes, so a note reached through three of the topic's ideas counts once. |
| `GET /api/topics/:id` | The topic with the ideas filed under it, each carrying its `noteCount`. Notes are not nested — a topic's worth of notes would be fetched on every topic opened and displayed on almost none of them. The Thoughts page's pinned panel reads this endpoint for a pinned topic; the canvas itself never needs it, since `GET /api/topics` already carries the counts a card prints. |
| `POST/PATCH/DELETE /api/topics(/:id)` | CRUD. `POST` requires a `bookId`. Deleting a topic cascades its links and leaves its ideas as unfiled ideas. |
| `GET /api/ideas?book=` | Every idea in that book with its topics and its `noteCount` — one payload serving the Thoughts canvas, which fans an idea out under the topic it names. Called without the scope by Analyze's chapter shortlist, which resolves imported ideas across every book. It is also where "unfiled" comes from: an idea whose `topics` is empty, computed on the client rather than asked for. |
| `GET /api/ideas/:id` | The idea with its linked topics *and* notes. The notes are compact rows — a title and `firstReference`, the one anchor a link into Analyze needs — with no bodies: a row here is a way to reach a note rather than a rendering of one. The idea view loads this to learn which notes orbit, in which order, then fetches each note for the body its card shows. |
| `POST/PATCH/DELETE /api/ideas(/:id)` | CRUD. `POST` requires a `bookId`. Deleting an idea cascades its links and leaves its notes as unfiled notes. |

Every note payload from `/api/notes` carries `ideas` alongside `references`, for
the same reason it carries the full reference set: the editor shows both the
moment it opens, and a partial payload would mean a second round trip.

### A topic and an idea belong to a book

Both list endpoints take an optional `?book=<bookId>`, restricting the answer
to one book; a malformed value is a **400**, the same rule every other
`bookId`/`chapter` param in this API follows. `POST` to either endpoint
requires a `bookId` in the body — a topic or an idea always belongs to
exactly one book now, and there is no account-wide tier above it to fall back
to. Migration `009_topic_books.sql` is why: a topic's slug is unique per
`(user_id, book_id)` rather than per `user_id` alone, so "faith" in Matthew
and "faith" in Mark are two different topics with different ideas filed
under them, and the first book a reader works through no longer claims the
name for the other sixty-five.

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
| `/thoughts` | The topics view: one card per topic in the book showing, plus an unfiled card when there is anything unfiled |
| `/thoughts?idea=<id>` | The idea view: that idea enlarged at the centre, its notes ringing it |

`Thoughts/thoughtsUrl.js` owns that contract and is what other pages import to
link here, the same way `Analyze/analyzeUrl.js` owns links into Analyze. A topic
has no param of its own because it has no view of its own — the field IS every
topic — so a link to one topic can only be a link to the field.

### One book at a time

The page shows one book's topics, not the whole account's — a reader works
through one book at a time, and the topics they want in front of them are
that book's (see `db/migrations/009_topic_books.sql`). The title reads
`${Book} Topics` and is also the control: `Thoughts/BookTitle.js` opens the
same 66-book grid `/analyze` uses (`components/Books/BookGrid.js`, shared by
both pickers) in this page's own `BubbleOverlay`, and picking a book writes
`?book=`.

`Thoughts/useBookScope.js` resolves which book that is, in priority order:
`?book=` in the URL if one is there; failing that, the `bookId` of the idea
`?idea=` names, when the page arrived already pointed at one; failing that,
the reader's saved Analyze location; and Genesis for an account with neither.
The last two are a request, so the page holds every fetch until
`useBookScope` reports `isResolving: false` — fetching one book's topics and
then immediately refetching a different book's is the failure this exists to
avoid.

Unlike `useThoughtsView`'s `showIdea`, `useBookScope`'s `showBook`
**replaces** the history entry rather than pushing one. The scope is not
somewhere the reader navigated to — every entry to the page writes a `?book=`
of its own — so pushing would leave back stepping through book picks instead
of leaving the page, with the picker itself one press away the whole time.

Changing book deletes nothing. Pins carry no book of their own — `findPins`
returns every pin the reader has, across every book — so the page filters
instead: **the panel may only hold pins whose item is in the book the canvas is
drawing.** Without it a topic pinned in Matthew would still be in the panel
when the reader next *entered* Thoughts in Mark, selectable beside a Mark idea,
and Link would file that idea under a topic Mark's field does not draw — an
idea on no canvas at all. One rule covers every way into a book, the title
block included, which is why nothing is cleared on a book change. Notes pass
the filter whatever the scope is: a note has no book by design, and filing one
under another book's topic is a thing the import picker deliberately offers.
Nothing is deleted by the filter; return to that book and the pins are still
there.

If the corpus itself fails to load there is nothing to read the scope off, so
the panel drops the filter, shows every pin the reader has, and says so in a
line above the list. Hiding them behind a filter that can no longer answer
would take away the page's only editing surface at the moment it is least
recoverable.

The panel's **Clear** is deliberately wider than that. It is
`DELETE /api/pins/all` and unpins every book at once, because a book-scoped
clear would mean a book-scoped pins API and widening `/api/pins` is a non-goal.
The button says so — "Clear all books", asking "Unpin everything, in every
book?" — and stays enabled while pins exist in books the reader is not looking
at, since it can reach those too.

### Why the pinned panel is the only editing surface

Nothing on the canvas is editable. A card is a card; to change a topic's
description or a note's body you **pin** it, and the panel is where the form
appears. That is one rule with three consequences worth stating outright:

- Creating pins. `+ Topic` and `+ Idea` pin what they make, because otherwise
  the button would produce a card the reader had just named and could no longer
  touch — they would have to find it on the canvas and pin it by hand before
  they could write a word of it.
- The panel is a working set, not a selection. It survives changing views, and
  `usePins` holds the same list in both, which is why it takes no arguments and
  never reloads when the view changes. What the panel *shows* is that list
  filtered to the book in scope — see "One book at a time" above.
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
any notes are loaded at all; `usePins` knows nothing about the view or the book.
None of the three knows about the others. Joining them is the page's job, and it
is why the panel and the canvas cannot disagree: the panel's list is `usePins`'
list read through the very arrays the canvas draws, so an item in one is an item
in the other by construction. It also follows that the panel cannot say what it
holds until the corpus has loaded — until then it says it is still loading
rather than that nothing is pinned.

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

`buildFan` is shared: the same arc draws a topic's ideas and, with `PASSAGE_FAN`
as a style override, a note's passages in both canvases. Two things about that
override are worth knowing before touching it.

**Its radius is derived, not chosen.** Cards on an arc are separated by the
CHORD between their centres, and the test that chord has to pass is the card's
**diagonal** — not its width. Two axis-aligned boxes clear each other when their
centres are a width apart in x OR a height apart in y, so a chord running
diagonally can be short of both at once and the cards overlap while a
width-based test still passes. Comparing the chord to the width is what
`PASSAGE_FAN` used to do, and at the old 260px radius it drew passages on top of
each other at roughly one anchor direction in nine — invisible to the whole test
suite, because nothing in it measured a layout. `radiusClearing` in
`IdeaOrbit.js` now derives the radius from the card, the spread and the row
capacity, taking the longest that any count on one arc demands. Change the card
size or the spread and the radius follows; do not put a literal back.

**Its second arc is still a known shortcoming.** A note with more than
`PASSAGE_FAN.rowCapacity` (5) passages opens a second arc only 144px beyond the
first, which is less than a passage card's own height — so a card on that arc
can overlap one on the first.

The `+N more` chip now holds those cards back, so nothing overlaps until a
reader presses it: `TopicIdeaField` stows every row-1 passage and reveals them
on the chip, the way `BloomCluster` already does for a topic's ideas. It has to
do that itself rather than borrow BloomCluster, for the same offset reason the
passage fan is drawn outside the cluster at all, and it needs its own CSS
because `.thoughts-fan-item`/`.thoughts-fan-chip` are revealed by
`.thoughts-cluster.is-active`, which this layer is deliberately not inside.

What the chip does not fix is the arc behind it — press it and those cards are
still drawn over the first arc. Two things that look like cheap fixes are not:
offsetting the second arc by half a step only takes the overlapping pairs from
734 to 596 of 10440 across counts 6–10, and giving the arc enough radial gap to
clear a card from every angle needs ~280px, putting row two ~560px from the note
and off most canvases. A real fix means capping the fan or shrinking the card,
which is a product decision rather than another tuning pass.

### Linking: one authority, two adjacent tiers

`linkRules.evaluateLink` answers three questions from one call — whether Link is
enabled, what the hint under it says when it is not, and which writes fire when
it is pressed. Splitting the enable-check from the write-builder is the bug this
module exists to prevent: they drift, and the failure is a button enabled for a
selection the builder then reads differently, against the reader's real corpus,
with no undo on this page.

The rule is that a link joins a tier to any tier BELOW it. It used to be "the
tier immediately under it", because `note_ideas` and `idea_topics` were the only
link tables there were; `note_topics` ended that, so the corpus is a DAG rather
than a chain and descent rather than adjacency is what makes a pair linkable:

| Selection | Result |
|-----------|--------|
| Notes + ideas | Links, `PUT /api/notes/:id/ideas` |
| Ideas + topics | Links, `PUT /api/ideas/:id/topics` |
| Notes + topics | Links, `PUT /api/notes/:id/topics` — no idea in between |
| One tier | Refused — that is half a link |
| All three | Links all three downward edges: note→idea, idea→topic and note→topic |

A note therefore owns TWO link sets, its ideas and its topics, and they are
written by two separate full-set replaces. `useThoughtsData`'s `LINK_TARGETS` is
keyed by `parent:child` for exactly that reason — keyed by the child alone, a
three-tier selection would send both sets to one endpoint and silently empty the
other.

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

### Notes are not edited here

A note on this canvas is something to pin, not something to open: its card's
only action is `onTogglePin`, the same as a topic's or an idea's. There is no
note editor on this page and no link to one.

The alternative, an editor embedded in the canvas, would mean a second home for
the note editor, its reference list and its ideas multi-select, all of which
exist on `/analyze` and all of which are only useful beside the scripture they
point at. The one page that does hand a note to that editor is `/search`, whose
note results link to `/analyze?l=<book>.<chapter>&note=<id>` — see
`Search/searchModel.js`, the only caller of `analyzeUrlForNote`.

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
an error, the same rule `parsePosition` follows for a stale panel position in
`Analyze/navigation.js`. A saved link must not become an error page.

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

## Testing

```bash
npm run test:client                 # whole suite, one run, exits
npm run test:client -- -t "name"    # only tests whose name matches
npm run test:client:watch           # interactive watch, for a human
```

Run it through the root script (or `npm test --prefix src/client`) rather than
invoking `react-scripts` from the repo root: CRA derives `rootDir` from the
working directory, and from the root it fails to find `src/setupTests.js` — the
jest-dom matchers then silently go missing and assertions fail for the wrong
reason.

**Do not "simplify" `test:client` back to `npm test --prefix src/client`.** The
`CI=true` and the trailing `--` are both load-bearing, and dropping either fails
in a way that looks like something else:

  * Without the `--`, npm appends `-t "name"` inside its own argument list
    instead of after the separator, and the nested `npm` eats the `-t` as one of
    its flags. Jest then receives the bare word and reads it as a FILENAME
    pattern — so the command reports passes from whatever files happen to match
    and silently ignores the name you asked for. It does not error.
  * Without `CI=true`, `react-scripts test` opens interactive watch mode, and a
    non-interactive caller hangs with no output until it is killed.

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

The server has no test runner of its own — the root `package.json` has only
`test:client`.

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
