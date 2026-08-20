# Bible Study Site — Build Plan

## Locked decisions

| Decision | Value |
| :---- | :---- |
| Text source | Public domain (KJV or WEB), loaded into MySQL |
| Reference granularity | Verse ranges (book, chapter, start\_verse, end\_verse) |
| Audience | Single user, but `user_id` on every content table |
| Highlights | Rendered from references; not a separate object |
| Scripture panels | Fully independent; notes panel follows the left panel |
| Note creation | Standalone **or** from a verse selection |
| Note relationships | All optional — orphan notes are legal |
| Ordering | `sort_order` everywhere, defaults to chronological |
| Scale assumption | Low thousands of notes; SVG, no canvas |

---

## 1\. The verse index trick

Before anything else: give every verse in the Bible a single monotonic integer, `verse_index`, from 1 to \~31,102 in canonical order.

This one column does a disproportionate amount of work:

- The Overview page's y-axis becomes a linear mapping. No per-book math.  
- Reference overlap queries become integer range comparisons.  
- "Which notes touch Romans 5?" is `start_index <= X AND end_index >= Y`.  
- Sorting references canonically is `ORDER BY start_index`.

Compute it once at import time and denormalize it onto both `verses` and `note_references`. Never compute it at query time.

---

## 2\. Schema

### Scripture (static, loaded once)

books (

  id            TINYINT PK,

  name          VARCHAR(32),

  abbrev        VARCHAR(8),

  testament     ENUM('OT','NT'),

  chapter\_count TINYINT,

  canonical\_order TINYINT

)

chapters (

  id          SMALLINT PK,

  book\_id     TINYINT FK,

  number      TINYINT,

  verse\_count TINYINT,

  start\_index MEDIUMINT,   \-- verse\_index of verse 1

  end\_index   MEDIUMINT,

  UNIQUE (book\_id, number)

)

verses (

  id           MEDIUMINT PK,

  book\_id      TINYINT FK,

  chapter      TINYINT,

  verse        TINYINT,

  verse\_index  MEDIUMINT UNIQUE,

  text         TEXT,

  INDEX (book\_id, chapter, verse)

)

`chapters` is technically derivable from `verses`, but having `start_index` / `end_index` precomputed makes both the chapter fetch and the Overview axis trivial. Keep it.

### Notes

topics (

  id, user\_id, name, slug, description,

  sort\_order, created\_at, updated\_at,

  UNIQUE (user\_id, slug)

)

ideas (

  id, user\_id, title, body,

  sort\_order, created\_at, updated\_at

)

notes (

  id, user\_id, title, body,

  sort\_order, created\_at, updated\_at

)

idea\_topics (

  idea\_id FK, topic\_id FK, sort\_order,

  PRIMARY KEY (idea\_id, topic\_id)

)

note\_ideas (

  note\_id FK, idea\_id FK, sort\_order,

  PRIMARY KEY (note\_id, idea\_id)

)

note\_references (

  id, note\_id FK,

  book\_id, chapter, start\_verse, end\_verse,

  start\_index MEDIUMINT,   \-- denormalized

  end\_index   MEDIUMINT,   \-- denormalized

  sort\_order,

  INDEX (start\_index, end\_index),

  INDEX (note\_id)

)

**Name it `note_references`, not `references`.** `REFERENCES` is a reserved word in MySQL and you will be backticking it forever otherwise.

`notes.body` should be markdown text for now. You said notes will get complicated and be revised — resist building a block editor or a versioning table in v1. Adding `note_versions (note_id, body, created_at)` later is a pure addition, not a migration.

### The queries that matter

Highlights for a chapter:

SELECT nr.\*, n.title

FROM note\_references nr

JOIN notes n ON n.id \= nr.note\_id

WHERE nr.start\_index \<= :chapter\_end

  AND nr.end\_index   \>= :chapter\_start

  AND n.user\_id \= :uid

Unfiled notes (needed by the Topic page):

SELECT n.\* FROM notes n

LEFT JOIN note\_ideas ni ON ni.note\_id \= n.id

WHERE ni.note\_id IS NULL AND n.user\_id \= :uid

---

## 3\. API surface

GET    /api/books                          \-\> book \+ chapter grid data (cache forever)

GET    /api/chapter/:bookId/:chapter       \-\> verses \+ overlapping references

GET    /api/notes?bookId=\&chapter=         \-\> notes for the notes panel

POST   /api/notes                          \-\> create (optional reference in body)

PATCH  /api/notes/:id

DELETE /api/notes/:id

POST   /api/notes/:id/references

DELETE /api/references/:id

PUT    /api/notes/:id/ideas                \-\> replace the full link set

PUT    /api/ideas/:id/topics

GET    /api/topics                         \-\> list with counts

GET    /api/topics/:id                     \-\> ideas \+ notes, nested

GET    /api/ideas/:id

GET    /api/overview?tiers=notes,ideas,topics\&topicId=\&q=

GET    /api/search?q=                      \-\> notes, ideas, topics, scripture

Two notes on this surface:

- Use `PUT` with the full set for link tables rather than add/remove endpoints. The UI is a multi-select; matching that shape avoids a class of sync bugs.  
- `/api/chapter` returns verses *and* references together. One round trip per panel navigation.

---

## 4\. Analyze page

### Layout

Three panels, each with the same four-button footer: `← | Book | Chapter | →`. Book and Chapter open modal grids (66 books; 1–150 chapters).

The notes panel's footer navigates the **left scripture panel** — otherwise you have two controls for one piece of state. Consider hiding its arrows entirely and keeping only the book/chapter display as a label.

### State

Put both panels in the URL: `/analyze?l=40.5&r=45.5&notes=40.5`. You get back-button navigation, shareable positions, and reload persistence for free.

### Highlight rendering

Render verse-by-verse. For each verse, collect the references covering it:

- 0 refs — plain  
- 1 ref — light background tint  
- 2+ refs — deeper tint, and a stacked left gutter marker per note

Hovering a gutter marker highlights the note in the notes panel and vice versa. Clicking scrolls to it.

### Note creation

Two paths, one endpoint:

1. **Standalone** — "New note" button in the notes panel. `POST /api/notes` with no reference. It appears in the panel immediately but is invisible in the scripture panel until it gets a reference.  
2. **From selection** — select verses, a floating button appears, `POST` with `{ bookId, chapter, startVerse, endVerse }`.

Selection maps to verse elements, not character offsets, since your references are verse-range. Attach `data-verse-index` to each verse row and read the selection's anchor and focus nodes. This is meaningfully simpler than character-offset anchoring — a good reason to stay at verse granularity.

---

## 5\. Topic page

A three-level tree: Topic → Idea → Note. Lazy-load each level.

Because notes and ideas can be orphaned, you need two extra buckets at the root of the tree:

- **Unfiled notes** — notes with no idea  
- **Unfiled ideas** — ideas with no topic

Without these, orphans are unreachable and the page silently loses data.

Drag-to-reorder writes `sort_order`. Drag-between-parents rewrites the link table row.

---

## 6\. Overview page

This is the risky one. Budget for it accordingly and build it in stages.

### Geometry

- Vertical axis, y mapped linearly from `verse_index` 1 to 31,102.  
- Book boundaries as tick marks with labels; chapter ticks appear on zoom.  
- Three vertical rails to the right of the axis: notes, ideas, topics.  
- A horizontal stem from the axis to the rail for each anchor point.

### Arcs — chained, not pairwise

A note with five references should **not** produce ten arcs. Sort its anchor points by `verse_index` and draw four arcs chaining consecutive points. The result reads as one connected structure, and arc count stays O(n) instead of O(n²).

Same rule at every tier:

| Tier | Group by | Anchors |
| :---- | :---- | :---- |
| Notes | note | that note's references |
| Ideas | idea | references of all notes linked to it |
| Topics | topic | references of all notes under all its ideas |

One note therefore appears on all three rails — once as itself, once per idea, once per topic. Deduplicate anchors within a group before chaining.

### Payload

Precompute arcs server-side and ship compact arrays, not objects:

{ "notes": \[\[id, \[1234, 5678, 9012\]\], ...\] }

At a few thousand notes this is well under a megabyte. Cache it and invalidate on any note/idea/topic write.

### Rendering

SVG with a pan/zoom transform on a single `<g>`. Do not re-render on zoom — transform the group and scale stroke widths inversely. Reserve virtualization (render only arcs whose span intersects the viewport) for when you actually have thousands.

### Interaction

- Hover an arc — highlight it, dim the rest, show a tooltip  
- Click an arc — open that note/idea/topic in a side drawer  
- Search — filter to matching arcs rather than hiding others outright  
- Magnify — a fisheye on the axis, or simpler, a zoom-to-region on drag

Build hover before magnify. Magnify is the feature most likely to be cut.

---

## 7\. Build order

| Phase | Deliverable | Notes |
| :---- | :---- | :---- |
| 0 | Scripture importer | Books, chapters, verses, `verse_index`. Verify counts against a known total. |
| 1 | Analyze page, read-only | Three panels, four-button nav, book/chapter grids, URL state. No notes. |
| 2 | Notes schema \+ notes panel | List, create standalone, create from selection, highlight rendering. |
| 3 | Ideas and topics | CRUD plus the linking UI on the note editor. |
| 4 | Topic page | Tree, unfiled buckets, drag-to-reorder. |
| 5 | Search | Notes/ideas/topics first; scripture full-text second. |
| 6a | Overview: axis | Books, chapters, ticks, pan/zoom. Nothing else. |
| 6b | Overview: stems | One stem per reference. Verify positions against the Analyze page. |
| 6c | Overview: notes tier | Chained arcs, hover, click-through. |
| 6d | Overview: idea \+ topic tiers | Same renderer, different grouping. |
| 6e | Overview: search \+ magnify | Last, and genuinely optional. |

Phases 1–5 are conventional CRUD work. Phase 6 is where the interesting problems are, which is exactly why it goes last — by then the data model has survived real use and you will know whether the arcs are showing you anything you didn't already know.

---

## 8\. Open questions to revisit

1. **Does the arc structure earn its complexity?** You'll know after phase 3, when you have real notes. If the answer is no, phase 6 becomes a much simpler density heatmap and you save weeks.  
2. **Cross-testament noise.** With the whole Bible on one axis, a topic like "Faith" may produce arcs spanning nearly the full height, and enough of them will look like static. Plan for a filter-to-one-topic default rather than showing everything at once.  
3. **Note body format.** Markdown now. If you find yourself wanting structured blocks, that's a signal to add a `note_blocks` table, not to reach for a rich-text editor.

