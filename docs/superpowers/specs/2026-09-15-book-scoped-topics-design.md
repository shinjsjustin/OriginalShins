# Book-scoped topics and ideas — Design

Date: 2026-09-15
Status: approved in brainstorming session

## Summary

A topic and an idea now belong to a book. `topics` and `ideas` each grow a
`book_id` column; every existing row becomes Matthew; and the Thoughts page
becomes a view of one book at a time, titled `${Book} Topics`, with the title
block itself the control that changes which book.

The scope is seeded from where the reader left the Analyze page, so walking
from Genesis in the centre scripture panel to `/thoughts` lands on Genesis
topics. It is then the page's own — changing it there never moves the scripture
panel back.

The Analyze import picker gets the same title block, so a note anchored in
Matthew can be filed under a Mark topic without leaving the chapter.

`/overview` is deleted in the same change, client and server.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Sync direction | **One-way.** Thoughts *seeds* its scope from `last_primary_book_id`; its title block is a page-local `?book=` override that never writes the saved location. |
| Import picker scope | Opens on the centre panel's book, **resets every time it opens**. No sticky state. |
| Deep links | **The result wins.** `?idea=123` with no `?book=` adopts the idea's own book; search's topic results carry `?book=`. |
| Slug uniqueness | **Per book** — `UNIQUE (user_id, book_id, slug)`. "faith" may exist in Matthew and in Mark as two different topics. |
| Where filtering happens | **Server-side**, via an optional `?book=` on the two list endpoints. |
| Pins on book change | **Left alone.** The panel is filtered to the book on screen, so nothing has to be deleted to keep the pair rule. |
| Overview | **Deleted**, client and server, including `ownsTopic` which only it called. |
| Moving a topic between books | **Not supported.** `PATCH` does not accept `bookId`. |

## Non-goals

- No moving a topic or an idea between books after creation.
- No book scoping for `/api/search` itself. Its *links* learn about books; its
  queries still search the whole corpus, which is what a search is for.
- No book column on `notes`. A note's book is its anchor, and an unanchored
  note belongs to no book — adding one would be a second, disagreeing answer.
- No change to `/api/pins` at all. Pins gain no book column and no scoped
  delete; the panel is scoped on the client, by filtering what it shows.
- No rework of the two `/order` endpoints. Nothing in the client calls them.

## 1. Backend

### Migration `src/db/migrations/009_topic_books.sql`

Three beats, because a `NOT NULL` column cannot be added to a populated table
before there is an answer for the rows already in it.

```sql
-- 1. Nullable, so the existing rows survive the ALTER.
ALTER TABLE `topics` ADD COLUMN `book_id` TINYINT UNSIGNED NULL AFTER `user_id`;
ALTER TABLE `ideas`  ADD COLUMN `book_id` TINYINT UNSIGNED NULL AFTER `user_id`;

-- 2. Backfill. Every topic and idea in the database today was written while
--    reading Matthew, which is book 40 in the canon `books` holds.
UPDATE `topics` SET `book_id` = 40 WHERE `book_id` IS NULL;
UPDATE `ideas`  SET `book_id` = 40 WHERE `book_id` IS NULL;

-- 3. Tighten: the column is now true of every row, so say so.
ALTER TABLE `topics`
  MODIFY COLUMN `book_id` TINYINT UNSIGNED NOT NULL,
  DROP INDEX `uq_topics_user_slug`,
  ADD UNIQUE KEY `uq_topics_user_book_slug` (`user_id`, `book_id`, `slug`),
  DROP INDEX `idx_topics_user_order`,
  ADD KEY `idx_topics_user_book_order` (`user_id`, `book_id`, `sort_order`, `id`),
  ADD CONSTRAINT `fk_topics_book` FOREIGN KEY (`book_id`) REFERENCES `books` (`id`);

ALTER TABLE `ideas`
  MODIFY COLUMN `book_id` TINYINT UNSIGNED NOT NULL,
  DROP INDEX `idx_ideas_user_order`,
  ADD KEY `idx_ideas_user_book_order` (`user_id`, `book_id`, `sort_order`, `id`),
  ADD CONSTRAINT `fk_ideas_book` FOREIGN KEY (`book_id`) REFERENCES `books` (`id`);
```

`TINYINT UNSIGNED` referencing `books`.`id` is the same type and the same
target `note_references`.`book_id` and `chapter_ideas`.`book_id` already use, so
a book coordinate means one thing and holds one range everywhere in this
schema. Not a `book` name string: the canon is a table, and a VARCHAR would
accept "Mathew" and defer the argument to whoever read it next.

No `ON DELETE` clause on either foreign key, matching `fk_chapter_ideas_book` —
books are never deleted, and if one somehow were, silently discarding a
reader's topics would be the wrong answer.

The two index swaps follow from the new `WHERE user_id = ? AND book_id = ?`:
leaving `sort_order` in the second position would leave the scoped list sorting
a filtered result rather than reading it in order.

**Step 2 is the migration's whole risk surface.** It is two `UPDATE`s over a
handful of rows, and both users have only ever written Matthew topics — but
step 3 is not reversible without a backup, so take a `mysqldump` of `topics`
and `ideas` first.

### `src/lib/params.js` — `parseBookScope`

A new parser beside `parseRowId`, for the one new query param. A positive
integer within canon bounds; anything else is a 400 rather than a silent
whole-corpus read, because a caller that sent a malformed scope asked a
question this API cannot answer and should be told so.

**This is a different rule from the client's `?book=`, and deliberately so.**
The two params share a name and nothing else. `/thoughts?book=999` is a URL —
bookmarked, shared, hand-edited — and a bad one falls through to the next
source rather than erroring (§2, §6). `GET /api/topics?book=999` is a request a
program composed, and a program that composed a nonsense scope has a bug worth
reporting. The client never turns the first into the second: a `?book=` it
refuses is one it never sends.

### Reads take an optional scope

`GET /api/topics?book=40` and `GET /api/ideas?book=40` return only that book's
rows. Omitting the param returns every book's, so nothing that exists today
changes shape — only the callers that want a slice pass one.

The predicate lands in `findTopics`, `findIdeas` and `findNotesForTopics`'s
caller. `findTopicsForIdeas`, `findTopicsForNotes` and `findIdeasForTopic` are
**not** scoped: they hydrate a payload whose membership is already decided by a
link table, and filtering there would silently drop a real edge from a display
of what that row is actually filed under.

### Writes take a required book

`POST /api/topics` and `POST /api/ideas` gain a required `bookId`, validated in
`topicInput.js` and `ideaInput.js` by the same canon-bounds rule
`parseBookScope` applies.

Required rather than defaulted. A default here would be a guess about which
book the reader meant, and the only caller that cannot say which book it is in
is a caller that should not be creating a topic.

`PATCH` deliberately does **not** accept `bookId`. Moving a topic between books
would have to move or orphan the ideas filed under it, and nothing in this
feature asks for that. If it is wanted later it is its own change, with its own
answer for the tier below.

### `bookId` on every payload

`toTopic` and `toIdea` carry `bookId`, so list rows and single rows both have
it. The client's deep-link rule reads it off a single idea, and it cannot do
that unless the single-idea payload says.

### Consequences

- `insertTopic` and `insertIdea` allocate `sort_order` as `MAX(sort_order) + 1`
  scoped to the user. That becomes scoped to `(user_id, book_id)`, or every new
  book starts its cards numbered after Matthew's.
- The duplicate-slug 409 becomes "You already have a topic with that slug in
  this book". The old wording is now false.
- `ownsTopic` in `src/lib/topics.js` loses its only caller with `/overview` and
  is deleted. The comment in `src/lib/pins.js` that cites it is reworded.
- `PUT /api/topics/order` and `PUT /api/topics/:id/ideas/order` are unreachable
  from the client — nothing calls them. The first is now per-account across
  books and would need a book scope if it were ever wired up. Both are left
  untouched, with a comment saying so, rather than churning a dead endpoint.

## 2. The Thoughts page

### Scope resolution

`?book=` joins `?idea=` in the query string. `useThoughtsView` grows to own
both, parsing the new one as defensively as `parseIdeaId` parses the old: a
value that is not a positive integer in canon is not an error, it is a URL that
has been bookmarked, shared or hand-edited, and the page it lands on has to be
a page.

The scope has four sources, in priority order. Two of them are asynchronous:

| Priority | Source | When |
|---|---|---|
| 1 | `?book=` in the URL | present — resolved instantly, no fetch |
| 2 | the open idea's own `bookId` | `?idea=123` with no `?book=` |
| 3 | `last_primary_book_id` via `GET /user/location` | a bare `/thoughts` |
| 4 | Genesis (book 1) | a new account, or the location read fails |

So a new hook `useBookScope(ideaId)` returns `{ bookId, isResolving, showBook }`,
and `useThoughtsData` holds its fetches until `isResolving` goes false.

That gate is `useRestoreLocation`'s `isRestoring` applied a second time, for
exactly the reason its comment gives: two things writing the query string in
one pass leave whichever ran last in charge. Here the collision would be the
seed and the reader's own pick racing on entry.

Sources 2 and 3 write `?book=` with `replace: true`. The scope was seeded, not
chosen, and the back button should not step through a value the reader never
picked.

Source 4 is a fallback and not an error. A reader who has never opened Analyze
has no saved place, exactly as `parseSavedLocation` already reports, and
Genesis is where the Analyze page opens in the same situation.

### `showBook` replaces rather than pushes

This is the one place the page deliberately diverges from `showIdea`, which
pushes.

Opening an idea has no side effect, so back can undo it cleanly. Changing book
clears the pinned set, and back cannot un-clear it. A history entry that
restores `?book=40` over a pinned panel that is now empty is a back button
lying about what it did, so there is no history entry.

### The title block

`${book.name} Topics`, centred in `thoughts-topbar-row` between Reset View and
the two create buttons. `TopBar` gains a third slot and the row becomes a
three-column grid rather than the current space-between pair — the centre
element has to be centred against the row, not against whatever the two groups
beside it happen to measure.

The breadcrumb below it is unchanged. It says which idea is open; the title
block says which book is in scope; they are different facts and neither
replaces the other.

### `components/Books/BookGrid.js` — the one refactor this feature justifies

The 66-book testament-split grid already exists inside `Analyze/BookPicker`.
Rather than write a second one, it is extracted as a pure presentational
component taking `books`, `selectedBookId` and `onSelect(bookId)`, with neutral
classnames in a small `Styling/Books.css`. Then:

- `Analyze/BookPicker` becomes `Modal` + `BookGrid`, mapping
  `bookId → { bookId, chapter: 1 }`. Its behaviour is unchanged, including
  landing on chapter 1 — see its existing comment for why.
- `Thoughts/BookTitle` is the button + `BubbleOverlay` + `BookGrid`, with no
  chapter anywhere: a topic scope is a book, and there is nothing for a chapter
  to mean in it.

The shells differ because the two pages' overlays differ. The grid is the part
that is actually the same.

Reusing `BookPicker` whole would render correctly today, but only because CRA
bundles every stylesheet globally — Thoughts would be borrowing `analyze-*`
classes it never imports, a coupling that breaks silently the first time
anything is lazy-loaded.

### Pins

Changing book deletes no pins. The panel shows `pins` filtered to the items
the page has loaded for the book in scope, so a pin placed in another book is
hidden rather than destroyed, and returning to that book brings it back.

That filter is the whole of the rule, which is why there is no clear on book
change. A clear would only have covered a book changed *on* the page — pins
carry no book, so entering Thoughts in a different book leaves yesterday's
pins in place regardless — and `DELETE /api/pins/all`, the only clear the API
has, would have reached books the reader never touched.

The filter is applied in the page shell rather than inside either hook,
preserving the property that file's header claims — `useThoughtsView`,
`useThoughtsData` and `usePins` know nothing about each other, and joining them
is the page's job.

The panel's **Clear** button keeps the wide `DELETE /api/pins/all` reach and
says so in its own words ("Clear all books"), because a book-scoped clear
would mean widening `/api/pins`, which is a non-goal.

When the corpus itself fails to load there is nothing to filter against, so the
panel shows every pin the reader has and says so above the list. It is the one
window in which the panel can offer a cross-book pair, which is why the
same-book rule is enforced by the server rather than by this filter alone —
see the asymmetry section below.

### An empty book

The field draws its unfiled bubble and a message: "No topics in Mark yet. Press
+ Topic to start one."

Not an error state. An empty book is the expected state for sixty-five of them.

### `+ Topic` and `+ Idea`

Both send the page's current scope as `bookId`. `CreateModal` does not ask
which book — the title block above it already says, and a second control
saying the same thing is a second control that can disagree.

## 3. The Analyze import picker

### The title block, again

`ImportPicker` gains the same `BookTitle` header and a `bookId` of its own,
initialised from the centre panel's `position.bookId` every time it opens and
discarded when it closes.

Resetting rather than persisting is the decision above: the common case is
filing into the book you are reading, and an overlay that remembered a
one-off excursion into Mark would quietly file the next note wrong.

### `useImportCorpus(bookId)`

Because the filter is server-side, the picker needs its own scoped read.

Today `Analyze.js` loads `useTopics()` and `useIdeas()` on every page load, and
the picker is the only consumer of both lists. So the read moves into the
overlay: `useImportCorpus(bookId)` loads scoped topics and ideas together and
refetches when the picker's book changes. Two fewer requests on every Analyze
load that never opens the picker, and the scope lives where it is chosen.

`useIdeas` stays in `Analyze.js` — `IdeaComposer` still needs `createIdea` —
but loses its list consumer. `Analyze/useTopics.js` has no consumer left and is
deleted.

### `+ New idea`

`IdeaComposer` sends `bookId: position.bookId`. An idea composed while reading
Matthew 5 is a Matthew idea.

### `NoteFiling`

The same picker with the same default. Its `bookId` threads
`NotesPanel → NoteEditor → NoteFiling`, the chain `books` and `position`
already take.

### The asymmetry this creates, stated on purpose

Filing is free across books: a note anchored in Matthew may be filed under a
Mark topic, because you switched the picker to Mark to do it. That is the
point of the feature.

A topic's *ideas*, by contrast, are always same-book, and `PUT
/api/ideas/:id/topics` is what makes that true: it compares each topic's
`book_id` to the idea's inside the transaction that writes the links, and
answers 422 with the reason rather than writing a pair from two books. The
Thoughts panel's per-book filter is the reason the refusal is almost never
reached — it keeps the pair from being selected in the first place — but the
filter is dropped when the corpus cannot load, so it is a convenience and the
server check is the rule.

So a topic's fan may hold notes from any book while its ideas are all its own.
That is intended, but it is the one place the model is not uniform, and it is
written down here rather than discovered later.

## 4. Search

`searchModel.js` learns about books:

- Idea results keep linking to `thoughtsUrlForIdea(id)`. No `?book=` is needed
  — the page adopts the idea's own book (priority 2 above), so an old bookmark
  behaves the same way a fresh search result does.
- Topic results link to `thoughtsUrl(bookId)` rather than the bare field, so a
  Mark topic lands on Mark's field instead of dropping the reader on Matthew's
  with no sign of what happened.

`thoughtsUrl()` gains an optional `bookId`. The search payload must therefore
carry `bookId` on its topic rows — `src/lib/search.js`'s topic query selects it.

The search itself stays unscoped. Searching one book at a time is not what a
search is for.

## 5. Deleting `/overview`

Deleted outright:

```
src/client/src/components/Overview/            35 files, 8 of them tests
src/client/src/components/Styling/Overview.css
src/routes/overview.js
src/lib/overview.js
src/lib/overviewCache.js
src/lib/overviewInput.js
src/lib/overviewQueries.js
src/middleware/invalidateOverview.js
```

Edited:

- `src/client/src/routes.js` — the import and the `/overview` route.
- `src/client/src/components/Navbar.js` — the nav entry.
- `src/client/src/components/Search/SearchNav.js` — the nav entry.
- `src/server.js` — the `/api/overview` mount, and `invalidatesOverview` off
  the five mounts that carry it.
- `src/lib/topics.js` — `ownsTopic` and its export.

Staying, because Thoughts uses both: `GET /api/notes/:id` and
`src/lib/passages.js`. Their comments cite the Overview drawer as the reason
they exist and are reworded to cite the Thoughts orbit and bloom, which is what
actually calls them now.

Stale references reworded in `src/client/src/components/Thoughts/thoughtsUrl.js`,
`useThoughtsView.js`, `IdeaOrbit.js`, `src/lib/pins.js` and
`src/client/src/components/Styling/Thoughts.css`.

`AGENTS.md`'s directory tree is trued up in the same pass. It is already behind
reality — it lists a `Thoughts/BubbleCard.js` that has moved and misses the
`Bubbles/` directory entirely — and removing a whole page from it without
fixing what is already wrong would leave it no more trustworthy than before.

## 6. Error handling

| Situation | Answer |
|---|---|
| `?book=` names nothing in canon | Falls through to the saved location. It is a URL; it survives hand-editing, and the rule matches `parseIdeaId`'s. |
| `?book=` valid, no topics in it | The empty-book message. Not an error. |
| `bookId` missing or out of canon on create | 400 from the input parser. |
| Duplicate slug within a book | 409, "You already have a topic with that slug in this book". |
| `GET /user/location` fails while seeding | Genesis. A convenience lost, not a page broken — the rule `useRestoreLocation` already follows. |
| `clearPins` fails on book change | Navigation proceeds; the action banner reports it. |
| `?idea=` names an idea that is gone | Unchanged: the load 404s and the page shows its error banner, with the URL still saying what was asked for. |

## 7. Testing

Everything runs in the existing CRA jest suite (`npm run test:client`). There is
no server-side suite; route behaviour is exercised through `Analyze.test.js`'s
fetch harness, and that is where the new route behaviour goes too.

**Pure units**

- `useBookScope`'s four-source priority, each source in turn.
- `?book=` parsing: `abc`, `0`, `-1`, `1.5`, `2e3`, `67` and absent all fall
  through; `1` and `66` resolve.
- `BookGrid` selection and its testament split.
- `thoughtsUrl(bookId)` with and without a book.

**Thoughts**

- The title block renders `Matthew Topics`.
- Picking Mark refetches scoped and replaces rather than pushes the history
  entry, and leaves the pinned set on the server untouched.
- `?idea=` with no `?book=` adopts the idea's book, and Reset View lands on
  that book's field.
- An empty book shows the message, not the error banner.
- A pin from another book is not in the panel; a pin from this book is, and
  survives a round trip through another book.
- A corpus that fails to load shows the pins unfiltered with a notice, rather
  than an endless "Loading pins…".

**Analyze**

- The picker opens on the centre panel's book.
- Switching its book refetches; closing and reopening resets it.
- `+ New idea` and `+ Topic` send the right `bookId`.
- A Matthew note files under a Mark topic, and its Matthew idea membership
  survives the write.

**Harness**

`Analyze.test.js`'s fake server gains `book_id` on its topic and idea stores and
`?book=` filtering on its two list handlers. Without it the scoping would be
asserted against a server that ignores it — the exact failure commit `5d39cb8`
fixed for `note_topics`.

**Removal**

Delete the eight Overview test files and confirm the suite is green, since
several surviving tests import modules that are going away.

**The migration is not covered by any of this.** It is verified by hand against
the database: count `topics` and `ideas` before, run it, confirm every row came
out `book_id = 40` and the counts match, then load `/thoughts` and check that
Matthew shows what it showed before and Mark is empty.

## Implementation order

1. Migration, applied and verified by hand.
2. Backend: `parseBookScope`, the scoped reads, the required `bookId` on
   writes, `bookId` on the payloads.
3. Delete `/overview`, client and server. Independent of everything above, and
   doing it early means the rest is written against a smaller tree.
4. `BookGrid` extraction; `Analyze/BookPicker` rewired onto it.
5. Thoughts: `useBookScope`, the title block, pin clearing, the empty state.
6. Analyze: `useImportCorpus`, the picker's title block, `bookId` on the two
   create paths.
7. Search links.
8. `AGENTS.md`.
