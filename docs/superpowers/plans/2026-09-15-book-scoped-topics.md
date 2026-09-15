# Book-scoped topics and ideas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scope every topic and idea to a book, make `/thoughts` a view of one book at a time with a clickable `${Book} Topics` title block, give the Analyze import picker the same block, and delete `/overview`.

**Architecture:** A `book_id` column on `topics` and `ideas`, backfilled to Matthew (40). The two list endpoints take an optional `?book=` and filter server-side. On the client the scope is a `?book=` query param resolved from four sources in priority order — the URL, the open idea's own book, the saved reading location, then Genesis — behind an `isResolving` gate that holds the data fetch, mirroring the existing `useRestoreLocation` pattern.

**Tech Stack:** Node/Express + MySQL2 (CommonJS, server), React 18 + react-router-dom + Create React App (client), Jest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-15-book-scoped-topics-design.md`

---

## Testing conventions in this repo — read before Task 1

This codebase has **no server-side test suite**. There is no jest at the repo root, and `npm run test:client` runs only what lives under `src/client/src`. Server behaviour is exercised indirectly: `Analyze.test.js` and `Thoughts.test.js` each stand up a stateful fake server over `global.fetch`, and the components drive it.

**Do not add a second test runner.** `src/lib/params.js`, `src/lib/topicInput.js` and the route modules ship without unit tests, exactly as `parseRowId` and every existing parser do. Follow that. Where this plan says "no test for this step", that is deliberate and consistent with the repo, not an oversight.

Every client-side change in this plan **is** TDD'd, against the two fakes.

Run the suite with:

```bash
npm run test:client
```

Run one file with:

```bash
npm run test:client -- --testPathPattern=Thoughts
```

---

## File structure

**Created**

| File | Responsibility |
|---|---|
| `src/db/migrations/009_topic_books.sql` | The column, the backfill, the re-keying |
| `src/client/src/components/Books/BookGrid.js` | The 66-book testament-split grid, shell-agnostic |
| `src/client/src/components/Books/BookGrid.test.js` | Its unit tests |
| `src/client/src/components/Styling/Books.css` | Neutral classnames for that grid |
| `src/client/src/components/Thoughts/BookTitle.js` | The `${Book} Topics` button + its overlay |
| `src/client/src/components/Thoughts/useBookScope.js` | The four-source scope resolution |
| `src/client/src/components/Thoughts/useBookScope.test.js` | Its unit tests |
| `src/client/src/components/Bubbles/useImportCorpus.js` | The picker's own scoped topics + ideas read |

**Deleted**

```
src/client/src/components/Overview/                   (35 files)
src/client/src/components/Styling/Overview.css
src/client/src/components/Analyze/useTopics.js
src/routes/overview.js
src/lib/overview.js  overviewCache.js  overviewInput.js  overviewQueries.js
src/middleware/invalidateOverview.js
```

**Modified**

`src/lib/params.js` · `src/lib/topics.js` · `src/lib/ideas.js` · `src/lib/topicInput.js` · `src/lib/ideaInput.js` · `src/lib/search.js` · `src/lib/pins.js` · `src/routes/topics.js` · `src/routes/ideas.js` · `src/server.js` · `src/client/src/routes.js` · `src/client/src/components/Navbar.js` · `src/client/src/components/Search/SearchNav.js` · `src/client/src/components/Search/searchModel.js` · `src/client/src/components/Analyze/BookPicker.js` · `src/client/src/components/Analyze/Analyze.js` · `src/client/src/components/Analyze/NotesPanel.js` · `src/client/src/components/Analyze/NoteEditor.js` · `src/client/src/components/Analyze/NoteFiling.js` · `src/client/src/components/Bubbles/ImportPicker.js` · `src/client/src/components/Thoughts/Thoughts.js` · `src/client/src/components/Thoughts/TopBar.js` · `src/client/src/components/Thoughts/thoughtsUrl.js` · `src/client/src/components/Thoughts/useThoughtsView.js` · `src/client/src/components/Thoughts/useThoughtsData.js` · `src/client/src/components/Thoughts/IdeaOrbit.js` · `src/client/src/components/Styling/Thoughts.css` · `AGENTS.md` · plus the three test files and their fakes.

---

## Task 1: The migration

**Files:**
- Create: `src/db/migrations/009_topic_books.sql`

This task has no automated test — see the testing note above. It is verified by hand against the database, in Step 4.

- [ ] **Step 1: Back up the two tables you are about to re-key**

Step 3 of the migration is not reversible without this.

```bash
mysqldump -u "$DB_USER" -p "$DB_NAME" topics ideas > ~/bibleapp-topics-ideas-backup.sql
wc -l ~/bibleapp-topics-ideas-backup.sql
```

Expected: a non-zero line count. If the file is empty, stop — the credentials or database name are wrong, and running the migration without a backup is not recoverable.

- [ ] **Step 2: Record the row counts you expect to survive**

```bash
mysql -u "$DB_USER" -p "$DB_NAME" -e \
  "SELECT (SELECT COUNT(*) FROM topics) AS topics, (SELECT COUNT(*) FROM ideas) AS ideas;"
```

Write both numbers down. Step 4 checks against them.

- [ ] **Step 3: Write the migration**

Create `src/db/migrations/009_topic_books.sql`:

```sql
-- 009_topic_books.sql — a topic and an idea belong to a book
--
-- Apply after 008_note_topics.sql:
--     mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/009_topic_books.sql
--
-- Until now a topic was an account-wide thing: one "faith" topic gathering
-- ideas from anywhere in the canon. That is the wrong shape for how the page
-- is actually read. A reader works through one book at a time, and the topics
-- they want in front of them are that book's — so the Thoughts page becomes a
-- view of one book, and this column is what it filters on.
--
-- `TINYINT UNSIGNED` referencing `books`.`id`, which is the same type and the
-- same target `note_references`.`book_id` and `chapter_ideas`.`book_id`
-- already use. A book coordinate means one thing and holds one range
-- everywhere in this schema. It is deliberately NOT a name string: the canon
-- is a table, and a VARCHAR here would accept "Mathew" and defer the argument
-- to whoever read it next.
--
-- Three beats, because a NOT NULL column cannot be added to a populated table
-- before there is an answer for the rows already in it.

SET NAMES utf8mb4;

-- 1. Nullable, so the existing rows survive the ALTER.
ALTER TABLE `topics` ADD COLUMN `book_id` TINYINT UNSIGNED NULL AFTER `user_id`;
ALTER TABLE `ideas`  ADD COLUMN `book_id` TINYINT UNSIGNED NULL AFTER `user_id`;

-- 2. Backfill. Every topic and idea written before this migration was written
--    while reading Matthew, which is book 40 in the canon `books` holds.
UPDATE `topics` SET `book_id` = 40 WHERE `book_id` IS NULL;
UPDATE `ideas`  SET `book_id` = 40 WHERE `book_id` IS NULL;

-- 3. Tighten: the column is now true of every row, so say so.
--
-- The unique key gains `book_id` because a slug is claimed per book, not per
-- account: "faith" in Matthew and "faith" in Mark are two different topics
-- with different ideas under them, and keying on the account alone would let
-- the first book a reader worked through block every name in the other 65.
--
-- Both ordering indexes gain `book_id` in second position to match the list
-- query's new `WHERE user_id = ? AND book_id = ?`. Leaving `sort_order` where
-- it is would leave the scoped read sorting a filtered result rather than
-- walking it in order.
--
-- No ON DELETE clause on either foreign key, as `fk_chapter_ideas_book` has
-- none: books are never deleted, and if one somehow were, silently discarding
-- a reader's topics would be the wrong answer.
ALTER TABLE `topics`
  MODIFY COLUMN `book_id` TINYINT UNSIGNED NOT NULL,
  DROP INDEX `uq_topics_user_slug`,
  ADD UNIQUE KEY `uq_topics_user_book_slug` (`user_id`, `book_id`, `slug`),
  DROP INDEX `idx_topics_user_order`,
  ADD KEY `idx_topics_user_book_order` (`user_id`, `book_id`, `sort_order`, `id`),
  ADD CONSTRAINT `fk_topics_book`
    FOREIGN KEY (`book_id`) REFERENCES `books` (`id`);

ALTER TABLE `ideas`
  MODIFY COLUMN `book_id` TINYINT UNSIGNED NOT NULL,
  DROP INDEX `idx_ideas_user_order`,
  ADD KEY `idx_ideas_user_book_order` (`user_id`, `book_id`, `sort_order`, `id`),
  ADD CONSTRAINT `fk_ideas_book`
    FOREIGN KEY (`book_id`) REFERENCES `books` (`id`);
```

- [ ] **Step 4: Apply it and verify by hand**

```bash
mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/009_topic_books.sql
mysql -u "$DB_USER" -p "$DB_NAME" -e \
  "SELECT book_id, COUNT(*) FROM topics GROUP BY book_id;
   SELECT book_id, COUNT(*) FROM ideas  GROUP BY book_id;"
```

Expected: exactly one row per table, `book_id = 40`, and the counts equal to what Step 2 recorded. Any `NULL` bucket, any second book, or a changed count means the backfill missed rows — restore from the Step 1 dump before going further.

- [ ] **Step 5: Commit**

```bash
git add src/db/migrations/009_topic_books.sql
git commit -m "feat: a topic and an idea belong to a book"
```

---

## Task 2: `parseBookScope`, and the scoped reads

**Files:**
- Modify: `src/lib/params.js`
- Modify: `src/lib/topics.js` (`findTopics`, `findNotesForTopics` is untouched)
- Modify: `src/lib/ideas.js` (`findIdeas`)
- Modify: `src/routes/topics.js:44` (`GET /`)
- Modify: `src/routes/ideas.js:41` (`GET /`)

No automated test — server module. Verified by Task 11's client tests, which drive the real request shape through the fake.

- [ ] **Step 1: Add the parser**

In `src/lib/params.js`, add above the `module.exports` block:

```js
// The `?book=` scope the two list endpoints take.
//
// This is a DIFFERENT rule from the client's `?book=` on /thoughts, and
// deliberately so — the two params share a name and nothing else. That one is
// a URL: bookmarked, shared, hand-edited, and a bad one falls through to the
// next source rather than erroring. This one is a request a program composed,
// and a program that composed a nonsense scope has a bug worth reporting. So
// anything out of canon is null here, and the route turns that into a 400.
const parseBookScope = (value) => parsePositiveInt(value, MAX_BOOK_ID);
```

And add `parseBookScope` to `module.exports`.

- [ ] **Step 2: Scope `findTopics`**

In `src/lib/topics.js`, change `findTopics` to take an optional book and add the predicate. Replace the whole function:

```js
// `bookId` is the optional scope: null reads every book, which is what the
// endpoint answers when no `?book=` is given. The predicate is built rather
// than always present because a constant-true clause would defeat the
// (user_id, book_id, sort_order, id) index for the unscoped read.
const findTopics = async (userId, bookId = null) => {
    const scope = bookId === null ? '' : ' AND t.book_id = ?';
    const params = bookId === null ? [userId] : [userId, bookId];

    const [rows] = await db.execute(
        `SELECT t.id, t.book_id, t.name, t.slug, t.description, t.sort_order,
                t.created_at, t.updated_at,
                COUNT(DISTINCT i.id) AS idea_count,
                COUNT(DISTINCT n.id) AS note_count
         FROM topics t
         LEFT JOIN idea_topics it ON it.topic_id = t.id
         LEFT JOIN ideas i        ON i.id = it.idea_id AND i.user_id = t.user_id
         LEFT JOIN note_ideas ni  ON ni.idea_id = i.id
         LEFT JOIN notes n        ON n.id = ni.note_id AND n.user_id = t.user_id
         WHERE t.user_id = ?${scope}
         GROUP BY t.id, t.book_id, t.name, t.slug, t.description, t.sort_order,
                  t.created_at, t.updated_at
         ORDER BY t.sort_order, t.id`,
        params
    );

    return rows.map(row => toTopic(row, {
        ideaCount: Number(row.idea_count),
        noteCount: Number(row.note_count),
    }));
};
```

- [ ] **Step 3: Carry `bookId` on the topic payload**

Still in `src/lib/topics.js`, add the field to `toTopic`:

```js
const toTopic = (row, extras = {}) => ({
    id: row.id,
    bookId: row.book_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...extras,
});
```

Then add `t.book_id` to the `SELECT` list of `findTopicById` (the single-row read), so a write's response carries it too.

- [ ] **Step 4: Do the same for ideas**

In `src/lib/ideas.js`, add `bookId: row.book_id` to `toIdea`, add `i.book_id` to the `SELECT` and `GROUP BY` of `findIdeas` and to the `SELECT` of `findIdeaById`, and give `findIdeas` the same optional scope:

```js
const findIdeas = async (userId, bookId = null) => {
    const scope = bookId === null ? '' : ' AND i.book_id = ?';
    const params = bookId === null ? [userId] : [userId, bookId];

    const [rows] = await db.execute(
        `SELECT i.id, i.book_id, i.title, i.body, i.sort_order, i.created_at, i.updated_at,
                COUNT(DISTINCT ni.note_id) AS note_count
         FROM ideas i
         LEFT JOIN note_ideas ni ON ni.idea_id = i.id
         LEFT JOIN notes n ON n.id = ni.note_id AND n.user_id = i.user_id
         WHERE i.user_id = ?${scope}
         GROUP BY i.id, i.book_id, i.title, i.body, i.sort_order, i.created_at, i.updated_at
         ORDER BY i.sort_order, i.id`,
        params
    );

    return rows.map(row => toIdea(row, { noteCount: Number(row.note_count) }));
};
```

Leave `findTopicsForIdeas`, `findTopicsForNotes`, `findIdeasForTopic` and `findNotesForTopics` unscoped. They hydrate a payload whose membership a link table already decided, and filtering there would silently drop a real edge from a display of what a row is actually filed under.

- [ ] **Step 5: Wire the two routes**

In `src/routes/topics.js`, replace the body of `GET /`:

```js
router.get('/', async (req, res) => {
    // Absent is legal and means every book. Present-but-nonsense is a 400
    // rather than a silent whole-corpus read — see parseBookScope.
    const bookId = req.query.book === undefined ? null : parseBookScope(req.query.book);
    if (req.query.book !== undefined && bookId === null) {
        return res.status(400).json({ error: 'book must be a book id between 1 and 66' });
    }

    try {
        const topics = await findTopics(req.user.id, bookId);
        const notes = await findNotesForTopics(req.user.id, topics.map(topic => topic.id));

        const notesByTopicId = notes.reduce((byTopicId, note) => ({
            ...byTopicId,
            [note.topicId]: [...(byTopicId[note.topicId] || []), note],
        }), {});

        res.status(200).json({
            topics: topics.map(topic => ({
                ...topic,
                notes: notesByTopicId[topic.id] || [],
            })),
        });
    } catch (err) {
        console.error('GET /api/topics error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
```

Add `parseBookScope` to the `require` of `../lib/params` at the top of the file.

Apply the identical shape to `GET /` in `src/routes/ideas.js`, passing `bookId` into `findIdeas` and adding the same import.

- [ ] **Step 6: Check the server still boots**

```bash
node -e "require('./src/routes/topics'); require('./src/routes/ideas'); console.log('ok')"
```

Expected: `ok`. A syntax error or a bad import fails here rather than at the first request.

- [ ] **Step 7: Commit**

```bash
git add src/lib/params.js src/lib/topics.js src/lib/ideas.js src/routes/topics.js src/routes/ideas.js
git commit -m "feat: the topic and idea lists can be scoped to one book"
```

---

## Task 3: A book is required to create

**Files:**
- Modify: `src/lib/topicInput.js`
- Modify: `src/lib/ideaInput.js`
- Modify: `src/lib/topics.js` (`insertTopic`)
- Modify: `src/lib/ideas.js` (`insertIdea`)
- Modify: `src/routes/topics.js` (`respondToWriteError`)

No automated test — server modules. Task 14's client tests assert the request body that reaches here.

- [ ] **Step 1: Validate the book on create**

In `src/lib/topicInput.js`, add near the other field parsers:

```js
const { MAX_BOOK_ID, parsePositiveIntField } = require('./params');

// Required, not defaulted. A default here would be a guess about which book
// the reader meant, and the only caller that cannot say which book it is in is
// a caller that should not be creating a topic.
const parseBookId = (value) => {
    const bookId = parsePositiveIntField(value, MAX_BOOK_ID);
    return bookId === null
        ? fail('bookId must be a book id between 1 and 66')
        : ok(bookId);
};
```

Then in `parseCreateTopic`, after the description parse:

```js
    const bookId = parseBookId(payload.bookId);
    if (bookId.error) return bookId;

    return ok({
        bookId: bookId.value,
        name: name.value,
        slug: slug.value,
        description: description.value,
    });
```

Leave `parseUpdateTopic` alone. `PATCH` deliberately does not accept `bookId`: moving a topic between books would have to move or orphan the ideas filed under it, and that is its own feature with its own answer for the tier below. Add that as a comment above `parseUpdateTopic`.

- [ ] **Step 2: Do the same for ideas**

In `src/lib/ideaInput.js`, add the identical `parseBookId` (same wording, same bounds) and thread it through `parseCreateIdea` so the returned value carries `bookId`. Leave `parseUpdateIdea` alone, with the same comment.

- [ ] **Step 3: Write the column, scoped per book**

In `src/lib/topics.js`, replace `insertTopic`:

```js
const insertTopic = async (userId, { bookId, name, slug, description }) => {
    // Scoped to (user, book), not to the user. Otherwise every new book would
    // start its cards numbered after Matthew's, and a book's first topic would
    // sort below topics it can never be shown beside.
    const [orderRows] = await db.execute(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM topics WHERE user_id = ? AND book_id = ?',
        [userId, bookId]
    );

    const [result] = await db.execute(
        'INSERT INTO topics (user_id, book_id, name, slug, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, bookId, name, slug, description, Number(orderRows[0].next_order)]
    );

    return result.insertId;
};
```

Apply the same change to `insertIdea` in `src/lib/ideas.js` — the same `AND book_id = ?` on the `MAX(sort_order)` read, and `book_id` in the `INSERT`.

- [ ] **Step 4: Correct the 409**

In `src/routes/topics.js`, the duplicate-slug message is now false — the key is per book. Change it:

```js
        return res.status(409).json({ error: 'You already have a topic with that slug in this book' });
```

- [ ] **Step 5: Note the dead ordering endpoints**

Add above `PUT /order` in `src/routes/topics.js`:

```js
// NOTE: unreachable from the client — nothing in src/client calls this, nor
// PUT /:id/ideas/order below. This one predates book scoping and is still
// per-account across books, so it would need a book scope before it could be
// wired up. Left as it is rather than churned, since there is no caller to
// keep working.
```

- [ ] **Step 6: Check it still boots**

```bash
node -e "require('./src/lib/topicInput'); require('./src/lib/ideaInput'); require('./src/routes/topics'); console.log('ok')"
```

Expected: `ok`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/topicInput.js src/lib/ideaInput.js src/lib/topics.js src/lib/ideas.js src/routes/topics.js
git commit -m "feat: creating a topic or an idea names its book"
```

---

## Task 4: Delete `/overview` — server

**Files:**
- Delete: `src/routes/overview.js`, `src/lib/overview.js`, `src/lib/overviewCache.js`, `src/lib/overviewInput.js`, `src/lib/overviewQueries.js`, `src/middleware/invalidateOverview.js`
- Modify: `src/server.js`, `src/lib/topics.js`, `src/lib/pins.js`, `src/routes/notes.js`, `src/lib/passages.js`

- [ ] **Step 1: Delete the six modules**

```bash
git rm src/routes/overview.js \
       src/lib/overview.js src/lib/overviewCache.js \
       src/lib/overviewInput.js src/lib/overviewQueries.js \
       src/middleware/invalidateOverview.js
```

- [ ] **Step 2: Unmount it**

In `src/server.js`, delete line 18 (`const overviewRoutes = ...`), line 24 (`const invalidatesOverview = ...`), the `/api/overview` mount and its comment block, and the comment block above the notes mount that explains `invalidatesOverview`. Then strip `invalidatesOverview` from all five mounts so they read:

```js
app.use('/api/notes', isAuth, noteRoutes);
app.use('/api/references', isAuth, referenceRoutes);
app.use('/api/ideas', isAuth, ideaRoutes);
app.use('/api/topics', isAuth, topicRoutes);
```

The fifth is the `chapter-ideas` mount — check its comment, which explains why it does *not* carry the middleware, and delete that comment too since there is no longer a middleware to contrast against.

- [ ] **Step 3: Delete `ownsTopic`**

In `src/lib/topics.js`, delete the `ownsTopic` function and its comment block, and remove it from `module.exports`. `/overview` was its only caller.

In `src/lib/pins.js`, reword the comment on line ~77 that says "This is the same cheapest-possible-form query as ownsTopic in src/lib/topics.js" — `ownsTopic` no longer exists. Make it state the rule on its own terms instead.

- [ ] **Step 4: Reword the two comments that cite the drawer**

In `src/routes/notes.js`, the comment above `GET /:id` says the Overview drawer is what needs it. That is now the Thoughts idea view, which fetches each note in full to draw its orbit — see `useThoughtsData.loadNotesForIdea`. Reword it to say so; the reasoning about bodies not shipping on list payloads is still correct and stays.

In `src/lib/passages.js`, the comment listing its callers names "the Overview drawer". Drop that clause; the remaining callers are `GET /api/ideas/:id/passages` and `GET /api/topics/:id/passages`.

- [ ] **Step 5: Confirm nothing still references it**

```bash
grep -rn -e overview -e Overview src/lib src/routes src/middleware src/server.js
```

Expected: no output.

```bash
node -e "require('./src/server.js')" 2>&1 | head -5
```

Expected: the server's own startup output, or a database-connection message — but no `MODULE_NOT_FOUND`. Kill it with Ctrl-C.

- [ ] **Step 6: Commit**

```bash
git add -A src/
git commit -m "refactor: delete the overview API and its cache"
```

---

## Task 5: Delete `/overview` — client

**Files:**
- Delete: `src/client/src/components/Overview/` (35 files), `src/client/src/components/Styling/Overview.css`
- Modify: `src/client/src/routes.js`, `src/client/src/components/Navbar.js`, `src/client/src/components/Search/SearchNav.js`, and four comment sites

- [ ] **Step 1: Delete the directory and its stylesheet**

```bash
git rm -r src/client/src/components/Overview
git rm src/client/src/components/Styling/Overview.css
```

- [ ] **Step 2: Unroute it**

In `src/client/src/routes.js`, delete line 10 (the import), and the `/overview` route object together with the comment above it that gives `/overview?tiers=...` as its query-string example.

- [ ] **Step 3: Remove both nav entries**

In `src/client/src/components/Navbar.js`, delete `{ path: '/overview', label: 'Overview' }` from the dropdown list.

In `src/client/src/components/Search/SearchNav.js`, delete the same entry. The nav is then `Thoughts | Search | Analyze`; check the file's header comment, which names all four, and correct it.

- [ ] **Step 4: Reword the stale client comments**

Four files mention Overview in prose that is now false:

- `Thoughts/thoughtsUrl.js` — its header says "Two now do (search results, and the Overview drawer)". Only search does now; say one.
- `Thoughts/useThoughtsView.js` — two references, one citing `useOverviewParams.js` as precedent and one citing `overviewParams.topicIdFromParams`. Replace both with the surviving precedent, `panelParams.js`.
- `Thoughts/IdeaOrbit.js:394` — "shared with the note editor and the overview drawer". Drop the second.
- `Styling/Thoughts.css:23` — "as on /overview". Drop the clause.

- [ ] **Step 5: Run the suite**

```bash
npm run test:client
```

Expected: PASS. The 8 Overview test files are gone; nothing else imported from that directory, so no other suite should break. If one does, it is importing a deleted module — fix the import rather than restoring the file.

- [ ] **Step 6: Commit**

```bash
git add -A src/client
git commit -m "refactor: delete the overview page"
```

---

## Task 6: Extract `BookGrid`

**Files:**
- Create: `src/client/src/components/Books/BookGrid.js`, `src/client/src/components/Books/BookGrid.test.js`, `src/client/src/components/Styling/Books.css`
- Modify: `src/client/src/components/Analyze/BookPicker.js`

- [ ] **Step 1: Write the failing test**

Create `src/client/src/components/Books/BookGrid.test.js`:

```js
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import BookGrid from './BookGrid';

const books = [
    { id: 1, name: 'Genesis', testament: 'OT', canonicalOrder: 1 },
    { id: 40, name: 'Matthew', testament: 'NT', canonicalOrder: 40 },
    { id: 41, name: 'Mark', testament: 'NT', canonicalOrder: 41 },
];

test('splits the canon into its two testaments', () => {
    render(<BookGrid books={books} selectedBookId={null} onSelect={() => {}} />);

    const oldTestament = screen.getByRole('group', { name: 'Old Testament' });
    const newTestament = screen.getByRole('group', { name: 'New Testament' });

    expect(within(oldTestament).getByRole('button', { name: 'Genesis' })).toBeInTheDocument();
    expect(within(newTestament).getByRole('button', { name: 'Mark' })).toBeInTheDocument();
    expect(within(oldTestament).queryByRole('button', { name: 'Mark' })).not.toBeInTheDocument();
});

test('marks the selected book as current', () => {
    render(<BookGrid books={books} selectedBookId={40} onSelect={() => {}} />);

    expect(screen.getByRole('button', { name: 'Matthew' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Mark' })).not.toHaveAttribute('aria-current');
});

test('reports the book id alone, with no chapter', () => {
    const onSelect = jest.fn();
    render(<BookGrid books={books} selectedBookId={40} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mark' }));

    expect(onSelect).toHaveBeenCalledWith(41);
});

test('orders books canonically whatever order they arrive in', () => {
    const shuffled = [books[2], books[0], books[1]];
    render(<BookGrid books={shuffled} selectedBookId={null} onSelect={() => {}} />);

    const names = screen.getAllByRole('button').map(button => button.textContent);
    expect(names).toEqual(['Genesis', 'Matthew', 'Mark']);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm run test:client -- --testPathPattern=BookGrid
```

Expected: FAIL — `Cannot find module './BookGrid'`.

- [ ] **Step 3: Write the component**

Create `src/client/src/components/Books/BookGrid.js`:

```js
import React from 'react';
import '../Styling/Books.css';

// The 66-book canon as a grid, split by testament — and nothing else.
//
// It carries no overlay of its own because its two callers wrap it in
// different ones: /analyze opens it inside Modal, /thoughts inside
// BubbleOverlay. The shells differ; the grid is the part that is actually the
// same, so the grid is what is shared.
//
// It reports a BOOK ID and nothing more. The Analyze picker's "always land on
// chapter 1" rule lives in that picker, where the chapter means something —
// here there is no chapter for it to be about.

// Testament sections, in canonical order.
const SECTIONS = [
    { testament: 'OT', label: 'Old Testament' },
    { testament: 'NT', label: 'New Testament' },
];

/**
 * @param books           every book, in any order — sorted here
 * @param selectedBookId  the book to mark as current, or null for none
 * @param onSelect        (bookId) -> void
 */
const BookGrid = ({ books, selectedBookId = null, onSelect }) => {
    const ordered = [...books].sort((a, b) => a.canonicalOrder - b.canonicalOrder);

    return (
        <>
            {SECTIONS.map(({ testament, label }) => (
                <section
                    key={testament}
                    className="book-grid-section"
                    // A named group rather than a bare heading, so a reader
                    // moving by landmark hears which testament they are in
                    // without having to infer it from the last heading passed.
                    role="group"
                    aria-label={label}
                >
                    <h3 className="book-grid-heading">{label}</h3>

                    <div className="book-grid">
                        {ordered
                            .filter(book => book.testament === testament)
                            .map(book => (
                                <button
                                    key={book.id}
                                    type="button"
                                    className={`book-grid-cell${
                                        book.id === selectedBookId ? ' book-grid-cell--selected' : ''
                                    }`}
                                    aria-current={book.id === selectedBookId ? 'true' : undefined}
                                    onClick={() => onSelect(book.id)}
                                >
                                    {book.name}
                                </button>
                            ))}
                    </div>
                </section>
            ))}
        </>
    );
};

export default BookGrid;
```

- [ ] **Step 4: Write the stylesheet**

Create `src/client/src/components/Styling/Books.css`, porting the `.analyze-grid--books` rules so the grid looks the same in the Analyze modal as it does today:

```css
/* ─── BookGrid ────────────────────────────────────────────────────────────────
   The 66-book canon as a grid, in whichever overlay the caller wraps it in.

   Its own stylesheet rather than Analyze.css because it now has two callers on
   two pages. CRA bundles every stylesheet globally, so borrowing `analyze-*`
   here would work today and break silently the first time anything is
   lazy-loaded.

   Every rule below is ported from the `.analyze-grid--books` block it replaces,
   so the Analyze modal looks exactly as it did. The three `--analyze-*` values
   those rules read are inlined, because they were declared on `.analyze-page`
   and this grid now renders outside it — a var() that resolves to nothing would
   silently drop the border and the cell width. */

.book-grid-section + .book-grid-section {
  margin-top: var(--space-lg);
}

.book-grid-heading {
  margin: 0 0 var(--space-sm);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1.6px;
  color: var(--ink-faint);
}

.book-grid {
  display: grid;
  gap: var(--space-xs);
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
}

.book-grid-cell {
  padding: var(--space-sm);
  background-color: var(--paper-alt);
  color: var(--ink);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--font-base);
  text-align: center;
  transition: background-color 0.15s ease,
              color 0.15s ease,
              border-color 0.15s ease;
}

.book-grid-cell:hover {
  background-color: var(--lapis);
  color: var(--text-white);
  border-color: var(--lapis);
}

.book-grid-cell--selected {
  background-color: var(--lapis-deep);
  color: var(--text-white);
  border-color: var(--lapis-deep);
}
```

- [ ] **Step 5: Run the tests**

```bash
npm run test:client -- --testPathPattern=BookGrid
```

Expected: PASS, all four.

- [ ] **Step 6: Rewire `Analyze/BookPicker` onto it**

Replace `src/client/src/components/Analyze/BookPicker.js` entirely:

```js
import React from 'react';
import Modal from './Modal';
import BookGrid from '../Books/BookGrid';

// The Analyze page's book picker: the shared grid, in this page's modal.
//
// Picking a book always lands on its chapter 1. The chapter currently shown
// may not exist in the book being moved to, and carrying it over would
// silently clamp to something the reader did not ask for. That rule lives here
// rather than in BookGrid because a chapter only means something to a caller
// that has panels pointed at one — /thoughts, the grid's other caller, has no
// chapter at all.
const BookPicker = ({ books, selectedBookId, onSelect, onClose }) => (
    <Modal title="Choose a book" onClose={onClose}>
        <BookGrid
            books={books}
            selectedBookId={selectedBookId}
            onSelect={(bookId) => onSelect({ bookId, chapter: 1 })}
        />
    </Modal>
);

export default BookPicker;
```

Then delete the now-unused `.analyze-grid--books` and `.analyze-picker-section` rules from `Styling/Analyze.css` — but **check first** whether `.analyze-picker-section` is used by `ChapterPicker` or `NotesPanel`, both of which use `.analyze-picker-heading`:

```bash
grep -rn "analyze-picker-section\|analyze-grid--books\|analyze-grid-cell" src/client/src
```

Delete only the rules with no remaining user.

- [ ] **Step 7: Run the full suite**

```bash
npm run test:client
```

Expected: PASS. `Analyze.test.js` drives the book picker in several tests and is the real check that this refactor changed nothing — if a test that clicks a book name now fails, the grid's markup diverged from what the picker used to render.

- [ ] **Step 8: Commit**

```bash
git add -A src/client
git commit -m "refactor: the book grid is shared, its overlay is not"
```

---

## Task 7: `?book=` in the Thoughts URL

**Files:**
- Modify: `src/client/src/components/Thoughts/thoughtsUrl.js`
- Modify: `src/client/src/components/Thoughts/useThoughtsView.js`
- Test: `src/client/src/components/Thoughts/useThoughtsView.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `src/client/src/components/Thoughts/useThoughtsView.test.js`:

```js
import { parseBookId, bookIdFromParams, BOOK_PARAM } from './useThoughtsView';
import { thoughtsUrl } from './thoughtsUrl';

describe('parseBookId', () => {
    test('accepts a book id inside the canon', () => {
        expect(parseBookId('1')).toBe(1);
        expect(parseBookId('40')).toBe(40);
        expect(parseBookId('66')).toBe(66);
    });

    test('returns null for anything that is not a canon book id', () => {
        // Every one of these is reachable by hand-editing the address bar or
        // following a link saved before the canon was what it is, so none of
        // them is an error — they all mean "the URL said nothing usable".
        ['abc', '', '0', '-1', '1.5', '2e3', '67', '999'].forEach(raw => {
            expect(parseBookId(raw)).toBeNull();
        });
    });

    test('returns null for a value that is not a string', () => {
        expect(parseBookId(null)).toBeNull();
        expect(parseBookId(40)).toBeNull();
    });
});

describe('bookIdFromParams', () => {
    test('reads the book off a URL', () => {
        expect(bookIdFromParams(new URLSearchParams('book=41'))).toBe(41);
    });

    test('is null when the URL does not name one', () => {
        expect(bookIdFromParams(new URLSearchParams('idea=7'))).toBeNull();
    });
});

describe('thoughtsUrl', () => {
    test('names a book when given one', () => {
        expect(thoughtsUrl(41)).toBe(`/thoughts?${BOOK_PARAM}=41`);
    });

    test('is the bare field when given nothing', () => {
        expect(thoughtsUrl()).toBe('/thoughts');
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
npm run test:client -- --testPathPattern=useThoughtsView
```

Expected: FAIL — `parseBookId is not a function`.

- [ ] **Step 3: Add the param to `thoughtsUrl.js`**

In `src/client/src/components/Thoughts/thoughtsUrl.js`, add beside `IDEA_PARAM`:

```js
// Which book's topics the field is showing.
//
// It is a param rather than a path segment for the same reason `idea` is: the
// back button leaves a scope, a reload stays in it, and "look at Mark's
// topics" is a link. It is also why a link INTO the page can name a book at
// all, which is what stops a search result for a Mark topic landing the reader
// on Matthew's field.
export const BOOK_PARAM = 'book';
```

And give `thoughtsUrl` the optional argument:

```js
// The topics view — the whole field of topic cards for one book.
//
// The book is optional because two callers want different things. Search names
// one, so a Mark topic's result lands on the field that actually holds it. The
// page's own Reset View names none, because leaving an idea should not also
// re-assert a scope the reader may have just changed.
export const thoughtsUrl = (bookId = null) =>
    bookId === null ? THOUGHTS_PATH : `${THOUGHTS_PATH}?${BOOK_PARAM}=${bookId}`;
```

- [ ] **Step 4: Parse it in `useThoughtsView.js`**

Add to the imports and re-exports beside `IDEA_PARAM`:

```js
import { IDEA_PARAM, BOOK_PARAM } from './thoughtsUrl';
export { IDEA_PARAM, BOOK_PARAM };
```

And add the parser beside `parseIdeaId`:

```js
// Widest legal book id. The canon is fixed at 66 books, and the client knows
// that as surely as the server does — waiting for /api/books to reject `?book=
// 999` would mean holding the whole page on a request just to learn something
// already true.
const MAX_BOOK_ID = 66;

/**
 * The book a raw `?book=` value names, or null when it names none.
 *
 * Defensive for the reason parseIdeaId is: the value is a URL. It survives
 * bookmarks, shared links and hand-editing, so anything that is not a book id
 * inside the canon — absent, empty, `abc`, `0`, `-1`, `1.5`, `67` — means "the
 * URL said nothing usable" and falls through to the next source of scope. It
 * is never an error, and it is never a 400: that rule belongs to the API's own
 * `?book=`, which is a different param with a different caller. See
 * parseBookScope in src/lib/params.js.
 */
export const parseBookId = (raw) => {
    if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;

    const bookId = Number(raw);
    return bookId >= 1 && bookId <= MAX_BOOK_ID ? bookId : null;
};

/** The same, read off a URL. */
export const bookIdFromParams = (searchParams) => parseBookId(searchParams.get(BOOK_PARAM));
```

- [ ] **Step 5: Run the tests**

```bash
npm run test:client -- --testPathPattern=useThoughtsView
```

Expected: PASS, including the file's existing `?idea=` tests.

- [ ] **Step 6: Commit**

```bash
git add src/client/src/components/Thoughts/thoughtsUrl.js src/client/src/components/Thoughts/useThoughtsView.js src/client/src/components/Thoughts/useThoughtsView.test.js
git commit -m "feat: the thoughts URL can name a book"
```

---

## Task 8: `useBookScope` — the four sources

**Files:**
- Create: `src/client/src/components/Thoughts/useBookScope.js`, `src/client/src/components/Thoughts/useBookScope.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/client/src/components/Thoughts/useBookScope.test.js`:

```js
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import useBookScope, { GENESIS_BOOK_ID } from './useBookScope';

let requests;

const jsonResponse = (body) => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
});

// The two endpoints the scope can be seeded from, and nothing else. A test
// that needs a different answer overrides `answers` before rendering.
let answers;

const handleRequest = (url) => {
    requests.push(url);

    if (url.endsWith('/user/location')) return jsonResponse({ location: answers.location });

    const idea = /\/ideas\/(\d+)$/.exec(url);
    if (idea) return jsonResponse({ idea: answers.idea });

    throw new Error(`unexpected request: ${url}`);
};

// A probe rather than renderHook, so the hook is exercised inside a real
// router — the thing it actually writes to is the query string.
const Probe = ({ ideaId }) => {
    const { bookId, isResolving } = useBookScope(ideaId);
    const location = useLocation();

    return (
        <>
            <span data-testid="book">{isResolving ? 'resolving' : String(bookId)}</span>
            <span data-testid="search">{location.search}</span>
        </>
    );
};

const renderScope = (entry, ideaId = null) => render(
    <MemoryRouter initialEntries={[entry]}>
        <Probe ideaId={ideaId} />
    </MemoryRouter>
);

beforeEach(() => {
    requests = [];
    answers = { location: { primary: null, compare: null, noteId: null }, idea: null };
    global.fetch = jest.fn(handleRequest);
});

test('1. the URL wins, and costs no request', async () => {
    renderScope('/thoughts?book=41');

    await waitFor(() => expect(screen.getByTestId('book')).toHaveTextContent('41'));
    expect(requests).toEqual([]);
});

test('2. an idea with no book in the URL contributes its own', async () => {
    answers.idea = { id: 7, bookId: 41, title: 'Sower' };
    renderScope('/thoughts?idea=7', 7);

    await waitFor(() => expect(screen.getByTestId('book')).toHaveTextContent('41'));
    // Written into the URL so a reload, and Reset View, stay in Mark.
    expect(screen.getByTestId('search')).toHaveTextContent('book=41');
});

test('3. a bare /thoughts falls back to where Analyze was left', async () => {
    answers.location = { primary: { bookId: 40, chapter: 5 }, compare: null, noteId: null };
    renderScope('/thoughts');

    await waitFor(() => expect(screen.getByTestId('book')).toHaveTextContent('40'));
    expect(screen.getByTestId('search')).toHaveTextContent('book=40');
});

test('4. with no saved place at all, Genesis', async () => {
    renderScope('/thoughts');

    await waitFor(() => expect(screen.getByTestId('book')).toHaveTextContent(String(GENESIS_BOOK_ID)));
});

test('a location that cannot be read is Genesis, not an error', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('network down')));
    renderScope('/thoughts');

    await waitFor(() => expect(screen.getByTestId('book')).toHaveTextContent(String(GENESIS_BOOK_ID)));
});

test('a nonsense ?book= falls through to the saved location rather than erroring', async () => {
    answers.location = { primary: { bookId: 40, chapter: 5 }, compare: null, noteId: null };
    renderScope('/thoughts?book=999');

    await waitFor(() => expect(screen.getByTestId('book')).toHaveTextContent('40'));
});

test('the scope is resolving until it is settled, so nothing fetches early', async () => {
    answers.location = { primary: { bookId: 40, chapter: 5 }, compare: null, noteId: null };
    renderScope('/thoughts');

    expect(screen.getByTestId('book')).toHaveTextContent('resolving');
    await waitFor(() => expect(screen.getByTestId('book')).toHaveTextContent('40'));
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
npm run test:client -- --testPathPattern=useBookScope
```

Expected: FAIL — `Cannot find module './useBookScope'`.

- [ ] **Step 3: Write the hook**

Create `src/client/src/components/Thoughts/useBookScope.js`:

```js
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchJson } from '../../config/api';
import { BOOK_PARAM, IDEA_PARAM, bookIdFromParams, parseBookId } from './useThoughtsView';
// The endpoint is spelled once, in the module that owns the saved location —
// this hook is a second reader of it, not a second definition.
import { LOCATION_PATH } from '../Analyze/savedLocation';

// Which book's topics the page is showing.
//
// ── Four sources, in priority order ───────────────────────────────────────
//
//   1. `?book=` in the URL          present -> resolved instantly, no request
//   2. the open idea's own bookId   `?idea=123` with no `?book=`
//   3. last_primary_book_id         a bare /thoughts
//   4. Genesis                      a new account, or the location read fails
//
// Two of them are asynchronous, which is the whole reason this is a hook and
// not a line in useThoughtsView. Until the question is settled the page has no
// scope, and a fetch issued before then would fetch the wrong book's topics
// and then immediately fetch again.
//
// ── Why `isResolving` exists ──────────────────────────────────────────────
//
// It is useRestoreLocation's `isRestoring` applied a second time, for the same
// reason its comment gives: two things writing the query string in one pass
// leave whichever ran last in charge. Here the collision would be the seed and
// the reader's own pick racing on entry. useThoughtsData holds its fetches
// until this goes false.
//
// ── Why sources 2 and 3 replace rather than push ──────────────────────────
//
// The scope was seeded, not chosen. A history entry for a value the reader
// never picked is a back button that steps through somebody else's decision.
//
// ── Why `showBook` ALSO replaces, unlike showIdea ─────────────────────────
//
// This is the one place the page diverges from its sibling, and it is on
// purpose. Opening an idea has no side effect, so back can undo it cleanly.
// Changing book clears the pinned set — see Thoughts.js — and back cannot
// un-clear it. A history entry that restores `?book=40` over a pinned panel
// that is now empty is a back button lying about what it did, so there is no
// history entry.

// Where the Analyze page opens for a reader who has been nowhere, so it is
// where this page opens for one too. Named rather than spelled `1` at the two
// sites that need it.
export const GENESIS_BOOK_ID = 1;

/**
 * @param ideaId the open idea, or null in the topics view
 * @returns { bookId, isResolving, showBook }
 */
const useBookScope = (ideaId = null) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const fromUrl = bookIdFromParams(searchParams);

    // The seed, once it has been worked out. Null while that is in flight.
    const [seeded, setSeeded] = useState(null);

    // Read once, at mount. The effect below writes the query string itself, so
    // re-reading it afterwards would be reading our own handwriting and
    // concluding the URL had named a book all along — the bug
    // useRestoreLocation avoids the same way.
    const urlNamedBook = useRef(fromUrl !== null).current;
    const seedIdeaId = useRef(ideaId).current;

    useEffect(() => {
        if (urlNamedBook) return undefined;

        const controller = new AbortController();

        // Source 2 before source 3: an idea the reader is looking at is a
        // better answer about which book they mean than where they last left a
        // different page.
        const seed = async () => {
            if (seedIdeaId !== null) {
                const payload = await fetchJson(`/ideas/${seedIdeaId}`, { signal: controller.signal });
                const bookId = payload && payload.idea && payload.idea.bookId;
                if (parseBookId(String(bookId)) !== null) return bookId;
            }

            const payload = await fetchJson(LOCATION_PATH, { signal: controller.signal });
            const primary = payload && payload.location && payload.location.primary;
            const bookId = primary && primary.bookId;

            return parseBookId(String(bookId)) === null ? GENESIS_BOOK_ID : bookId;
        };

        seed()
            .then(bookId => setSeeded(bookId))
            .catch(err => {
                if (err.name === 'AbortError') return;
                // A scope that cannot be seeded is a convenience lost, not a
                // page broken — the rule useRestoreLocation already follows.
                // Genesis is where Analyze opens in the same situation.
                setSeeded(GENESIS_BOOK_ID);
            });

        return () => controller.abort();
    }, [urlNamedBook, seedIdeaId]);

    // Written to the URL so a reload, a shared link and Reset View all stay in
    // the book that was seeded. Replaced, never pushed — see the header.
    useEffect(() => {
        if (seeded === null || fromUrl !== null) return;

        setSearchParams(previous => {
            const next = new URLSearchParams(previous);
            next.set(BOOK_PARAM, String(seeded));
            return next;
        }, { replace: true });
    }, [seeded, fromUrl, setSearchParams]);

    // Written through the same parser that reads it, so the URL can never
    // carry a value this hook would then refuse — the one way a scope could
    // get stuck. A bad id is ignored rather than written.
    const showBook = useCallback((id) => {
        const wanted = parseBookId(String(id));
        if (wanted === null) return;

        setSearchParams(previous => {
            const next = new URLSearchParams(previous);
            next.set(BOOK_PARAM, String(wanted));
            // Leaving the book leaves the idea: an idea from the book just
            // left is not on the field just arrived at, and an orbit over a
            // scope that does not contain it is a view of nothing.
            next.delete(IDEA_PARAM);
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    const bookId = fromUrl !== null ? fromUrl : seeded;

    return { bookId, isResolving: bookId === null, showBook };
};

export default useBookScope;
```

- [ ] **Step 4: Run the tests**

```bash
npm run test:client -- --testPathPattern=useBookScope
```

Expected: PASS, all seven.

- [ ] **Step 5: Commit**

```bash
git add src/client/src/components/Thoughts/useBookScope.js src/client/src/components/Thoughts/useBookScope.test.js
git commit -m "feat: the thoughts page resolves which book it is showing"
```

---

## Task 9: The title block

**Files:**
- Create: `src/client/src/components/Thoughts/BookTitle.js`
- Modify: `src/client/src/components/Thoughts/TopBar.js`, `src/client/src/components/Styling/Thoughts.css`
- Test: `src/client/src/components/Thoughts/TopBar.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `src/client/src/components/Thoughts/TopBar.test.js`:

```js
import { render, screen, fireEvent } from '@testing-library/react';
import TopBar from './TopBar';

const books = [
    { id: 1, name: 'Genesis', testament: 'OT', canonicalOrder: 1 },
    { id: 40, name: 'Matthew', testament: 'NT', canonicalOrder: 40 },
    { id: 41, name: 'Mark', testament: 'NT', canonicalOrder: 41 },
];

const renderBar = (props = {}) => render(
    <TopBar
        books={books}
        bookId={40}
        onChangeBook={() => {}}
        onResetView={() => {}}
        onCreateTopic={() => {}}
        onCreateIdea={() => {}}
        {...props}
    />
);

test('titles the page with the book in scope', () => {
    renderBar();
    expect(screen.getByRole('button', { name: /Matthew Topics/ })).toBeInTheDocument();
});

test('the title opens the book grid and reports the pick', () => {
    const onChangeBook = jest.fn();
    renderBar({ onChangeBook });

    fireEvent.click(screen.getByRole('button', { name: /Matthew Topics/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark' }));

    expect(onChangeBook).toHaveBeenCalledWith(41);
});

test('says nothing about a book until the canon is in', () => {
    // /api/books is still in flight. A title naming a book nobody has seen
    // would be a claim about a row that has not loaded.
    renderBar({ books: [] });
    expect(screen.queryByRole('button', { name: /Topics$/ })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
npm run test:client -- --testPathPattern=TopBar
```

Expected: FAIL — no button matching `Matthew Topics`.

- [ ] **Step 3: Write `BookTitle`**

Create `src/client/src/components/Thoughts/BookTitle.js`:

```js
import React, { useState } from 'react';
import BubbleOverlay from '../Bubbles/BubbleOverlay';
import BookGrid from '../Books/BookGrid';

// The Thoughts page's title, which is also its book control.
//
// It reads `${Book} Topics` because that is what the field below it is: not a
// heading that happens to sit above a filter, but the name of the thing being
// shown. Clicking it opens the same 66-book grid /analyze opens, in this
// page's own overlay — see components/Books/BookGrid.js for why the grid is
// shared and the shell is not.
//
// No chapter anywhere. A topic scope is a book, and there is nothing for a
// chapter to mean in it.
//
// It draws nothing while the canon is still loading. A title naming a book
// nobody has seen would be a claim about a row that has not arrived, and the
// same rule TopBar's breadcrumb follows for an idea still in flight.

/**
 * @param books     every book, from /api/books
 * @param bookId    the book in scope
 * @param onChange  (bookId) -> void
 */
const BookTitle = ({ books, bookId, onChange }) => {
    const [isPicking, setIsPicking] = useState(false);

    const book = books.find(item => item.id === bookId) || null;
    if (!book) return null;

    const pick = (picked) => {
        setIsPicking(false);
        // A press on the book already in scope is not a change. Letting it
        // through would clear the pinned set for nothing, which is the one
        // side effect on this page a reader cannot undo.
        if (picked !== bookId) onChange(picked);
    };

    return (
        <>
            <button
                type="button"
                className="thoughts-book-title"
                onClick={() => setIsPicking(true)}
            >
                {book.name} Topics
            </button>

            {isPicking && (
                <BubbleOverlay label="Choose a book" onClose={() => setIsPicking(false)}>
                    <div className="thoughts-book-picker">
                        <BookGrid books={books} selectedBookId={bookId} onSelect={pick} />
                    </div>
                </BubbleOverlay>
            )}
        </>
    );
};

export default BookTitle;
```

- [ ] **Step 4: Give `TopBar` its third slot**

In `src/client/src/components/Thoughts/TopBar.js`, import `BookTitle`, extend the signature, and put the title between the two existing groups:

```js
const TopBar = ({
    books = [],
    bookId = null,
    onChangeBook,
    idea = null,
    onResetView,
    onCreateTopic,
    onCreateIdea,
}) => {
    const crumb = breadcrumbFor(idea);

    return (
        <header className="thoughts-topbar">
            <div className="thoughts-topbar-row">
                {/* Left, and first in the DOM, because it is the one control
                    that always means the same thing wherever the reader is. */}
                <button type="button" className="thoughts-action" onClick={onResetView}>
                    ⟲ Reset View
                </button>

                <BookTitle books={books} bookId={bookId} onChange={onChangeBook} />

                <div className="thoughts-topbar-creates">
                    <button type="button" className="thoughts-action" onClick={onCreateTopic}>
                        + Topic
                    </button>
                    <button type="button" className="thoughts-action" onClick={onCreateIdea}>
                        + Idea
                    </button>
                </div>
            </div>

            {crumb && (
                <p className="thoughts-breadcrumb">
                    <span className="thoughts-breadcrumb-topic">{crumb.topic}</span>
                    {/* Decoration, not a word: a reader listening to the page
                        should hear the two names, not "single right-pointing
                        angle quotation mark" between them. */}
                    <span className="thoughts-breadcrumb-separator" aria-hidden="true">›</span>
                    <span className="thoughts-breadcrumb-idea">{crumb.idea}</span>
                </p>
            )}
        </header>
    );
};
```

Also update the file's header comment: it says the bar holds "the way back to the whole field, the two things a reader can create here, and — in the idea view — which idea they are inside". It now also holds which book is in scope, and that is a different fact from the breadcrumb's: the crumb says which idea is open, the title says which book the field is drawn from, and neither replaces the other.

- [ ] **Step 5: Make the row a three-column grid**

In `src/client/src/components/Styling/Thoughts.css`, replace the `.thoughts-topbar-row` rule and add the two new ones:

```css
/* Three columns rather than space-between, because the middle element has to
   be centred against the ROW — space-between would centre it against whatever
   the two groups beside it happen to measure, so the title would drift left
   and right as the breadcrumb below it changed the bar's width. */
.thoughts-topbar-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--space-sm);
}

.thoughts-topbar-creates {
  display: flex;
  gap: var(--space-sm);
  justify-self: end;
}

/* The same palette as `.thoughts-action` beside it — paper tokens, not ground
   ones. The title is a peer of the two buttons in this row, and a control that
   took a different palette would read as belonging to something else. It is
   transparent at rest because it is a title first and a button second. */
.thoughts-book-title {
  background: none;
  color: var(--text-primary);
  font-size: var(--font-lg);
  font-weight: 600;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  white-space: nowrap;
}

.thoughts-book-title:hover {
  background-color: var(--bg-card);
}

/* The overlay's surface is edge-to-edge and transparent by design, so the grid
   needs a panel of its own to sit on — and a scroll, because 66 cells plus two
   headings is taller than a short window. Paper, matching the grid's own cells:
   BookGrid uses --paper-alt and --ink throughout. */
.thoughts-book-picker {
  max-width: 720px;
  max-height: 80vh;
  margin: 0 auto;
  padding: var(--space-lg);
  overflow-y: auto;
  background-color: var(--bg-card);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}
```

- [ ] **Step 6: Run the tests**

```bash
npm run test:client -- --testPathPattern=TopBar
```

Expected: PASS, including the file's existing breadcrumb tests.

- [ ] **Step 7: Commit**

```bash
git add -A src/client/src/components/Thoughts src/client/src/components/Styling/Thoughts.css
git commit -m "feat: the thoughts page is titled by the book it shows"
```

---

## Task 10: The page fetches one book

**Files:**
- Modify: `src/client/src/components/Thoughts/useThoughtsData.js`
- Modify: `src/client/src/components/Thoughts/Thoughts.js`
- Test: `src/client/src/components/Thoughts/Thoughts.test.js`

- [ ] **Step 1: Teach the fake server about `?book=`**

In `src/client/src/components/Thoughts/Thoughts.test.js`, the two list handlers use `url.endsWith('/topics')`, which will not match `/topics?book=40`. Replace them:

```js
// Matches with or without the scope, and applies it when it is there — so a
// test asserting that the page asked for one book is asserting against a
// server that actually answers differently, rather than one that ignores the
// param. This is the failure commit 5d39cb8 fixed for note_topics.
const scopedList = (url, kind) => {
    const match = new RegExp(`/${kind}(\\?book=(\\d+))?$`).exec(url);
    if (!match) return null;

    const bookId = match[2] === undefined ? null : Number(match[2]);
    const rows = bookId === null
        ? store[kind]
        : store[kind].filter(row => row.bookId === bookId);

    return jsonResponse({ [kind]: rows });
};
```

and in `handleRequest`, ahead of the POST handlers:

```js
    if (method === 'GET') {
        const topics = scopedList(url, 'topics');
        if (topics) return topics;

        const ideas = scopedList(url, 'ideas');
        if (ideas) return ideas;
    }
```

Give `addTopic` a `bookId` (defaulting to 40) and store it on the row, and add a `location` to `resetStore` so `useBookScope`'s seed has something to read:

```js
const resetStore = () => {
    store = {
        topics: [], ideas: [], notes: [], passages: [], pins: [], nextTopicId: 1,
        location: { primary: { bookId: 40, chapter: 1 }, compare: null, noteId: null },
    };
};
```

and a handler for it:

```js
    if (url.endsWith('/user/location')) {
        return jsonResponse({ location: store.location });
    }
```

- [ ] **Step 2: Write the failing tests**

Append to `Thoughts.test.js`:

```js
test('asks for only the book in scope', async () => {
    await renderThoughts('/thoughts?book=41');

    const listReads = requests.filter(r => r.method === 'GET' && /\/(topics|ideas)/.test(r.url));
    expect(listReads).not.toHaveLength(0);
    listReads.forEach(read => expect(read.url).toContain('book=41'));
});

test('a book with nothing in it says so, and is not an error', async () => {
    addTopic({ name: 'Faith', bookId: 40 });
    await renderThoughts('/thoughts?book=41');

    expect(await screen.findByText(/No topics in Mark yet/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('nothing is fetched before the scope is settled', async () => {
    // A bare /thoughts has to read the saved location first. If the corpus
    // fetch did not wait, it would ask for the wrong book and immediately ask
    // again — two reads where there should be one.
    await renderThoughts('/thoughts');

    const topicReads = requests.filter(r => r.method === 'GET' && /\/topics/.test(r.url));
    expect(topicReads).toHaveLength(1);
    expect(topicReads[0].url).toContain('book=40');
});
```

`renderThoughts` already exists at `Thoughts.test.js:125` with the signature `async (entry = '/thoughts')`, so these tests can pass an initial URL straight in. Do not add a second render helper.

- [ ] **Step 3: Run them to verify they fail**

```bash
npm run test:client -- --testPathPattern=Thoughts
```

Expected: FAIL — the requests carry no `book=`.

- [ ] **Step 4: Scope the fetches**

In `src/client/src/components/Thoughts/useThoughtsData.js`, change `loadThoughts` and the hook's signature:

```js
const loadThoughts = async (bookId, ideaId, signal) => {
    const scope = `?book=${bookId}`;

    const [topicsPayload, ideasPayload, notes] = await Promise.all([
        fetchJson(`${TOPICS_PATH}${scope}`, { signal }),
        fetchJson(`${IDEAS_PATH}${scope}`, { signal }),
        loadNotesForIdea(ideaId, signal),
    ]);

    return {
        topics: topicsPayload.topics || [],
        ideas: ideasPayload.ideas || [],
        notes,
    };
};
```

```js
/**
 * @param bookId the book in scope, or null while it is still being resolved
 * @param ideaId the idea whose notes to load, or null in the topics view
 */
const useThoughtsData = (bookId = null, ideaId = null) => {
```

and gate the effect on the scope being settled:

```js
    useEffect(() => {
        // Nothing to ask for until the scope is known — see useBookScope's
        // `isResolving`. Staying in the loading state rather than fetching an
        // unscoped list is what stops the page asking twice on every entry.
        if (bookId === null) return undefined;

        const controller = new AbortController();
        setIsLoading(true);

        loadThoughts(bookId, ideaId, controller.signal)
            .then(loaded => {
                setData(loaded);
                setError('');
            })
            .catch(err => {
                if (err.name === 'AbortError') return;
                setData(EMPTY);
                setError(err.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            });

        return () => controller.abort();
    }, [bookId, ideaId, revision]);
```

- [ ] **Step 5: Wire the page**

In `src/client/src/components/Thoughts/Thoughts.js`, add the scope hook and `useBooks`, and pass both down:

```js
import useBooks from '../Analyze/useBooks';
import useBookScope from './useBookScope';
```

```js
    const { ideaId, showIdea, resetView } = useThoughtsView();
    const { books } = useBooks();
    const { bookId, isResolving, showBook } = useBookScope(ideaId);
    ...
    } = useThoughtsData(bookId, ideaId);
```

Pass `books`, `bookId` and `onChangeBook` into `TopBar` (the handler arrives in Task 11 — for now pass `showBook` directly), and fold the scope's resolution into the loading state:

```js
                        {(isResolving || isLoading) && <p className="thoughts-message">Loading your thoughts…</p>}
                        {!isResolving && !isLoading && !error && ideaId === null && (
```

- [ ] **Step 6: Add the empty-book message**

Still in `Thoughts.js`, beside the field:

```js
                        {!isResolving && !isLoading && !error && ideaId === null
                            && topics.length === 0 && ideas.length === 0 && (
                            <p className="thoughts-message">
                                No topics in {bookName} yet. Press + Topic to start one.
                            </p>
                        )}
```

with `const bookName = (books.find(book => book.id === bookId) || {}).name || 'this book';` above the return. It is a message and not an error: an empty book is the expected state for sixty-five of them.

- [ ] **Step 7: Run the tests**

```bash
npm run test:client -- --testPathPattern=Thoughts
```

Expected: PASS, including every existing test in the file. If the existing create-and-pin tests fail because the fake now filters by book, seed their topics with `bookId: 40` to match the default location.

- [ ] **Step 8: Commit**

```bash
git add -A src/client/src/components/Thoughts
git commit -m "feat: the thoughts page draws one book at a time"
```

---

## Task 11: Changing book clears the pins

**Files:**
- Modify: `src/client/src/components/Thoughts/Thoughts.js`
- Test: `src/client/src/components/Thoughts/Thoughts.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `Thoughts.test.js`:

```js
test('changing book clears the pinned set, with no confirmation', async () => {
    const topic = addTopic({ name: 'Faith', bookId: 40 });
    store.pins = [{ itemType: 'topic', itemId: topic.id }];

    await renderThoughts('/thoughts?book=40');

    fireEvent.click(await screen.findByRole('button', { name: /Matthew Topics/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark' }));

    await waitFor(() => expect(
        requests.some(r => r.method === 'DELETE' && r.url.endsWith('/pins/all'))
    ).toBe(true));
    // No dialog stood between the press and the clear — pins are temporary by
    // design, and the reader clears them constantly by hand already.
    expect(screen.queryByRole('dialog', { name: /sure/i })).not.toBeInTheDocument();
});

test('a failed clear still changes the book, and says what happened', async () => {
    addTopic({ name: 'Faith', bookId: 40 });
    await renderThoughts('/thoughts?book=40');

    const answer = global.fetch.getMockImplementation();
    global.fetch = jest.fn((url, options = {}) => (
        (options.method === 'DELETE' && url.endsWith('/pins/all'))
            ? Promise.reject(new Error('pins are down'))
            : answer(url, options)
    ));

    fireEvent.click(await screen.findByRole('button', { name: /Matthew Topics/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark' }));

    // The reader asked for the book change; a pin left behind is visible and
    // recoverable, and refusing the navigation over it would be the louder
    // wrong answer.
    expect(await screen.findByRole('button', { name: /Mark Topics/ })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(/pins are down/);
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
npm run test:client -- --testPathPattern=Thoughts
```

Expected: FAIL — no `DELETE /pins/all` is sent.

- [ ] **Step 3: Wire the handler**

In `src/client/src/components/Thoughts/Thoughts.js`, add above the return:

```js
    // Changing book clears the pinned set. Pins are temporary by design and
    // are cleared constantly by hand already, so there is no confirmation —
    // and a pinned panel carried across a book change would be an editing
    // surface for items no longer on the canvas behind it.
    //
    // Wired here rather than inside either hook, so useBookScope and usePins
    // go on knowing nothing about each other. Joining them is this component's
    // job, as it already is for the two write dispatchers above.
    //
    // The navigation is not conditional on the clear succeeding. The reader
    // asked for the book change; if the clear fails, usePins' own action error
    // says so over a page that is otherwise correct.
    const changeBook = useCallback(async (nextBookId) => {
        await clearPins();
        showBook(nextBookId);
    }, [clearPins, showBook]);
```

and pass `onChangeBook={changeBook}` to `TopBar` in place of `showBook`.

- [ ] **Step 4: Run the tests**

```bash
npm run test:client -- --testPathPattern=Thoughts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client/src/components/Thoughts/Thoughts.js src/client/src/components/Thoughts/Thoughts.test.js
git commit -m "feat: changing book clears the pinned set"
```

---

## Task 12: `+ Topic` and `+ Idea` name their book

**Files:**
- Modify: `src/client/src/components/Thoughts/Thoughts.js`
- Test: `src/client/src/components/Thoughts/Thoughts.test.js`

- [ ] **Step 1: Write the failing test**

Append to `Thoughts.test.js`:

```js
test('a topic created here belongs to the book in scope', async () => {
    await renderThoughts('/thoughts?book=41');

    fireEvent.click(await screen.findByRole('button', { name: '+ Topic' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Discipleship' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create topic' }));

    await waitFor(() => expect(
        requests.some(r => r.method === 'POST' && r.url.endsWith('/topics') && r.body.bookId === 41)
    ).toBe(true));
});
```

The label `Name` and the button `Create topic` come from `CREATE_FORMS.topic` in `CreateModal.js` — the same strings `CreateModal.test.js` already drives this form with.

- [ ] **Step 2: Run it to verify it fails**

```bash
npm run test:client -- --testPathPattern=Thoughts
```

Expected: FAIL — the POST body has no `bookId`.

- [ ] **Step 3: Inject the scope at the one place both creates pass through**

In `Thoughts.js`, `createAndPin` is where a created item's fields are assembled. Add the book there:

```js
    const createAndPin = useCallback(async (fields) => {
        const create = creatingKind === 'topic' ? createTopic : createIdea;
        // The scope, not a field on the form. The title block above the modal
        // already says which book this is, and a second control saying the
        // same thing is a second control that can disagree with it.
        const created = await create({ ...fields, bookId });

        if (!created) return null;

        await togglePin(creatingKind, created.id, TITLE_OF[creatingKind](created));

        return created;
    }, [creatingKind, createTopic, createIdea, togglePin, bookId]);
```

- [ ] **Step 4: Run the tests**

```bash
npm run test:client -- --testPathPattern=Thoughts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client/src/components/Thoughts/Thoughts.js src/client/src/components/Thoughts/Thoughts.test.js
git commit -m "feat: a topic or idea created on thoughts names its book"
```

---

## Task 13: The import picker gets its own scope

**Files:**
- Create: `src/client/src/components/Bubbles/useImportCorpus.js`
- Delete: `src/client/src/components/Analyze/useTopics.js`
- Modify: `src/client/src/components/Bubbles/ImportPicker.js`, `src/client/src/components/Analyze/Analyze.js`, `NotesPanel.js`, `NoteEditor.js`, `NoteFiling.js`
- Test: `src/client/src/components/Analyze/Analyze.test.js`

- [ ] **Step 1: Teach the Analyze fake about `?book=`**

In `Analyze.test.js`, the handlers at lines 293 and 297 use `url.endsWith`. Replace both with the same `scopedList` helper Task 10 added to `Thoughts.test.js` — copy it across; the two fakes are separate on purpose and already duplicate several helpers.

Give `addIdea` and `addTopic` a `bookId` parameter defaulting to 40, stored on the row.

- [ ] **Step 2: Write the failing tests**

Append to `Analyze.test.js`:

```js
test('the importer opens on the book the centre panel is in', async () => {
    addTopic('Faith', 40);
    await renderAnalyze('/analyze?l=40.1');

    fireEvent.click(await screen.findByRole('button', { name: 'Import idea' }));

    expect(await screen.findByRole('button', { name: /Matthew Topics/ })).toBeInTheDocument();
    const reads = requests.filter(r => r.method === 'GET' && /\/topics/.test(r.url));
    expect(reads[reads.length - 1].url).toContain('book=40');
});

test('switching the importer to another book refetches that book', async () => {
    addTopic('Faith', 40);
    addTopic('Servanthood', 41);
    await renderAnalyze('/analyze?l=40.1');

    fireEvent.click(await screen.findByRole('button', { name: 'Import idea' }));
    fireEvent.click(await screen.findByRole('button', { name: /Matthew Topics/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark' }));

    await waitFor(() => expect(
        requests.some(r => r.method === 'GET' && r.url.includes('/topics?book=41'))
    ).toBe(true));
    expect(await screen.findByText('Servanthood')).toBeInTheDocument();
});

test('the importer resets to the panel book each time it opens', async () => {
    addTopic('Faith', 40);
    await renderAnalyze('/analyze?l=40.1');

    fireEvent.click(await screen.findByRole('button', { name: 'Import idea' }));
    fireEvent.click(await screen.findByRole('button', { name: /Matthew Topics/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark' }));
    await screen.findByRole('button', { name: /Mark Topics/ });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import idea' }));

    // The common case is filing into the book you are reading. An overlay that
    // remembered a one-off excursion into Mark would quietly file the next
    // note wrong.
    expect(await screen.findByRole('button', { name: /Matthew Topics/ })).toBeInTheDocument();
});

test('a note anchored in Matthew can be filed under a Mark topic', async () => {
    const mark = addTopic('Servanthood', 41);
    const note = addNote({ title: 'On serving', body: '' });
    await renderAnalyze(`/analyze?l=40.1&note=${note.id}`);

    fireEvent.click(await screen.findByRole('button', { name: 'Import' }));
    fireEvent.click(await screen.findByRole('button', { name: /Matthew Topics/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark' }));
    fireEvent.click(await screen.findByText('Servanthood'));
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(
        requests.some(r => r.method === 'PUT'
            && r.url.endsWith(`/notes/${note.id}/topics`)
            && r.body.topicIds.includes(mark.id))
    ).toBe(true));
});
```

These use the file's existing helpers, whose signatures are `renderAnalyze(initialEntry = '/analyze')` at line 418 and `addNote({ title, body, reference })` at line 184. `addTopic`/`addIdea` gain the `bookId` parameter in Step 1 above. Do not add parallel helpers.

- [ ] **Step 3: Run them to verify they fail**

```bash
npm run test:client -- --testPathPattern=Analyze
```

Expected: FAIL — no `Matthew Topics` button in the picker.

- [ ] **Step 4: Write `useImportCorpus`**

Create `src/client/src/components/Bubbles/useImportCorpus.js`:

```js
import useCollection from '../Analyze/useCollection';

// The topics and ideas one import picker is offering, scoped to one book.
//
// The read lives in the overlay rather than on the page because the picker is
// the only thing that wants it, and because the book it wants is the picker's
// own — initialised from the centre panel and changed inside the overlay
// without moving it. A list fetched by the page could only ever be the page's
// book.
//
// Moving it here also takes two requests off every Analyze load that never
// opens the picker, which used to be most of them.
//
// Built on useCollection for the fetch-and-revision plumbing, and the scope
// rides in the `path` it is keyed on — so changing book IS the refetch, with
// no second effect to keep in step.
const useImportCorpus = (bookId) => {
    const topics = useCollection(`/topics?book=${bookId}`, 'topics');
    const ideas = useCollection(`/ideas?book=${bookId}`, 'ideas');

    return {
        topics: topics.items,
        ideas: ideas.items,
        isLoading: topics.isLoading || ideas.isLoading,
        // Either read failing leaves the field unable to draw the corpus, and
        // both failing at once is one server being down — so one message.
        error: topics.error || ideas.error,
    };
};

export default useImportCorpus;
```

- [ ] **Step 5: Give `ImportPicker` the title block and its own corpus**

In `src/client/src/components/Bubbles/ImportPicker.js`: drop the `topics` and `ideas` props, take `books` and `bookId` instead, and hold the scope in state.

```js
import BookTitle from '../Thoughts/BookTitle';
import useImportCorpus from './useImportCorpus';
```

```js
/**
 * @param label            the dialog's accessible name
 * @param books            every book, for the title block
 * @param bookId           the book to open on — the centre panel's
 * @param selectableKinds  which tiers may be picked: ['idea'] or ['idea','topic']
 * @param onImport         ({ kind, id }) -> void. Does NOT close the picker —
 *                         the caller owns the write, so the caller owns the close
 * @param onClose          what Cancel, Escape and the backdrop do
 */
const ImportPicker = ({
    label,
    books = [],
    bookId,
    selectableKinds = ['idea'],
    onImport,
    onClose,
}) => {
    // Initialised from the caller's book and discarded when the overlay
    // closes, so the next open starts at the panel again — see
    // useImportCorpus. Changing it here never moves the scripture panel: this
    // is a question about which corpus to file INTO, not about what is being
    // read.
    const [scopeBookId, setScopeBookId] = useState(bookId);
    const { topics, ideas } = useImportCorpus(scopeBookId);
    const [pick, setPick] = useState(null);
```

Clear the pick when the book changes — a card picked in Matthew is not on Mark's field, and a confirm bar still naming it would import something the reader can no longer see:

```js
    const changeBook = (nextBookId) => {
        setScopeBookId(nextBookId);
        setPick(null);
    };
```

Render the title block above the field, inside the overlay:

```js
            <div className="bubble-picker">
                <div className="bubble-picker-scope">
                    <BookTitle books={books} bookId={scopeBookId} onChange={changeBook} />
                </div>

                <div className="bubble-picker-field">
```

Add a `.bubble-picker-scope` rule to `src/client/src/components/Bubbles/Bubbles.css` — centred, with the same vertical padding the bar below uses.

- [ ] **Step 6: Update the two callers**

In `NotesPanel.js`, drop `topics`/`ideas` from the `ImportPicker` call and pass `books` and `bookId={position.bookId}` instead.

`NoteEditor` takes `topics` and `ideas` (lines 20–21) and does nothing with them but hand them to `NoteFiling` (lines 173–174). Since `NoteFiling` now loads its own corpus, **both props come off `NoteEditor` entirely** and it gains `bookId` in their place. So:

- `NotesPanel` → `NoteEditor`: drop `topics={topics}` and `ideas={ideas}`, add `bookId={position.bookId}`.
- `NoteEditor` → `NoteFiling`: drop the same two, add `bookId={bookId}`.
- `NoteFiling`'s `ImportPicker` call: drop `topics`/`ideas`, add `books` and `bookId`, keep `selectableKinds={['idea', 'topic']}`.

`NoteEditor` keeps `books` — it uses it at lines 139 and 145 for `describeReference`.

With that, `NotesPanel` no longer needs `topics` at all, and `ideas` only for the `chapterIdeas` list it already receives separately. Remove the `topics` prop from its signature and from the `<NotesPanel>` call in `Analyze.js`.

- [ ] **Step 7: Delete `useTopics`**

```bash
git rm src/client/src/components/Analyze/useTopics.js
```

and remove its import and the `const { topics } = useTopics();` line from `Analyze.js`, plus the now-unused `topics` prop it passed to `NotesPanel`.

- [ ] **Step 8: Run the full suite**

```bash
npm run test:client
```

Expected: PASS. Several existing Analyze tests drive the importer and will exercise the new fetch path.

- [ ] **Step 9: Commit**

```bash
git add -A src/client
git commit -m "feat: the import picker chooses which book it files into"
```

---

## Task 14: `+ New idea` names its book

**Files:**
- Modify: `src/client/src/components/Analyze/Analyze.js:243`
- Test: `src/client/src/components/Analyze/Analyze.test.js`

- [ ] **Step 1: Write the failing test**

Append to `Analyze.test.js`:

```js
test('an idea composed while reading Matthew is a Matthew idea', async () => {
    await renderAnalyze('/analyze?l=40.1');

    fireEvent.click(await screen.findByRole('button', { name: '+ New idea' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'The narrow gate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save idea' }));

    await waitFor(() => expect(
        requests.some(r => r.method === 'POST' && r.url.endsWith('/ideas') && r.body.bookId === 40)
    ).toBe(true));
});
```

The label `Title` and the button `Save idea` are `IdeaComposer`'s own markup — not `CreateModal`'s, which is a different form on a different page with a different submit label.

- [ ] **Step 2: Run it to verify it fails**

```bash
npm run test:client -- --testPathPattern=Analyze
```

Expected: FAIL — the POST body has no `bookId`.

- [ ] **Step 3: Add the book**

In `src/client/src/components/Analyze/Analyze.js`, `handleCreateIdea` already knows the panel's position — that is what the `importIdea` call beside it uses. Add the book to the body:

```js
    const handleCreateIdea = useCallback(async (body) => {
        // The panel's book, for the same reason the import below uses the
        // panel's chapter: "+ New idea" sits beside this passage, which says
        // the idea belongs here as plainly as importing one does.
        const created = await createIdea({ ...body, bookId: primary.bookId });
        if (created) {
            await importIdea(created.id);
        }
        return created;
    }, [createIdea, importIdea, primary.bookId]);
```

`primary` is the centre panel's position, destructured from `usePanelPositions` at `Analyze.js:53` and already in scope here — it is what the `importIdea` call on the next line resolves its chapter from.

- [ ] **Step 4: Run the tests**

```bash
npm run test:client -- --testPathPattern=Analyze
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client/src/components/Analyze/Analyze.js src/client/src/components/Analyze/Analyze.test.js
git commit -m "feat: an idea composed in Analyze names its chapter's book"
```

---

## Task 15: Search links carry the book

**Files:**
- Modify: `src/lib/search.js`, `src/client/src/components/Search/searchModel.js`
- Test: `src/client/src/components/Search/searchModel.test.js` (create if absent)

- [ ] **Step 1: Write the failing test**

In `src/client/src/components/Search/searchModel.test.js`:

```js
import { GROUPS } from './searchModel';

const groupFor = (key) => GROUPS.find(group => group.key === key);

test('a topic result links to the field that actually holds it', () => {
    const link = groupFor('topics').linkOf({ id: 3, name: 'Servanthood', bookId: 41 });
    expect(link).toBe('/thoughts?book=41');
});

test('an idea result needs no book — the page adopts the idea\'s own', () => {
    const link = groupFor('ideas').linkOf({ id: 7, title: 'Sower' });
    expect(link).toBe('/thoughts?idea=7');
});
```

`GROUPS` is the real export, a frozen array declared at `searchModel.js:34`; each entry carries a `key` and a `linkOf`.

- [ ] **Step 2: Run it to verify it fails**

```bash
npm run test:client -- --testPathPattern=searchModel
```

Expected: FAIL — the topic link is `/thoughts`.

- [ ] **Step 3: Ship `bookId` on the topic rows**

In `src/lib/search.js`, `searchTopics` selects `id, name, slug, description`. Add the column and the field:

```js
        contentQuery({
            table: 'topics',
            columns: 'id, book_id, name, slug, description',
            titleColumn: 'name',
            bodyColumn: 'description',
        }),
```

```js
    return rows.map(row => ({
        id: row.id,
        // What the result links to. Without it a Mark topic's row would land
        // the reader on whatever book their scope happened to hold, with no
        // sign of why the topic they clicked was not on it.
        bookId: row.book_id,
        name: row.name,
        slug: row.slug,
        snippet: buildSnippet(row.description, query),
    }));
```

- [ ] **Step 4: Point the link at it**

In `src/client/src/components/Search/searchModel.js`, change the topics group:

```js
        linkOf: (topic) => thoughtsUrl(topic.bookId),
```

The ideas group is unchanged: `thoughtsUrlForIdea(idea.id)` needs no book, because the page adopts the idea's own — see `useBookScope`'s second source. That also means an idea link saved before this change still behaves correctly.

- [ ] **Step 5: Run the tests**

```bash
npm run test:client -- --testPathPattern=searchModel
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/search.js src/client/src/components/Search/searchModel.js src/client/src/components/Search/searchModel.test.js
git commit -m "feat: a topic result lands on the field that holds it"
```

---

## Task 16: Documentation

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Correct the directory tree**

Remove the whole `Overview/` block and the `overview*.js` lib entries, `routes/overview.js` and `middleware/invalidateOverview.js`.

The tree is also already behind reality in two ways that predate this work, and fixing them is the point of touching the file at all — a tree that is wrong elsewhere is no more trustworthy for having had one page cut out of it:

- It lists `Thoughts/BubbleCard.js`, `fieldLayout.js`, `fanLayout.js`, `cardGeometry.js` and `useCanvasSize.js`, all of which now live in `Bubbles/`.
- It has no `Bubbles/` directory at all. Add it, with a line per file: `BloomCluster.js`, `BubbleCard.js`, `BubbleOverlay.js`, `ImportPicker.js`, `TopicIdeaField.js`, `useBloom.js`, `useImportCorpus.js`, `Bubbles.css`, and the four pure layout modules.

Then add this task's own new files: `Books/BookGrid.js`, `Styling/Books.css`, `Thoughts/BookTitle.js`, `Thoughts/useBookScope.js`, `db/migrations/009_topic_books.sql`.

Verify the result against the filesystem:

```bash
find src -type f -not -path "*/node_modules/*" -not -name "*.test.js" | sort
```

- [ ] **Step 2: Correct the prose**

Search `AGENTS.md` for any remaining mention of the overview page, its cache, or its endpoint and remove it. Where a section describes the topics or ideas API, note that both list endpoints take an optional `?book=` and that creating either requires a `bookId`.

```bash
grep -n -i overview AGENTS.md
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: true up the tree, and drop the overview page from it"
```

---

## Final verification

- [ ] **Step 1: The whole suite**

```bash
npm run test:client
```

Expected: PASS, no skipped suites.

- [ ] **Step 2: Nothing references the deleted page**

```bash
grep -rn -i overview src/ AGENTS.md --exclude-dir=node_modules
```

Expected: no output.

- [ ] **Step 3: Drive it by hand**

Start the app with `npm run dev` and check, in order:

1. `/analyze` opens where you left it. Move the centre panel to Genesis 1.
2. `/thoughts` opens titled **Genesis Topics**, and the field is empty with the "No topics in Genesis yet" message.
3. Press the title, pick **Matthew**. The field fills with everything you had before the migration.
4. Pin two topics. Press the title, pick **Mark**. The pinned panel is empty and the field says Mark has nothing.
5. Press **+ Topic** in Mark, make one, and confirm it appears and is pinned.
6. Go back to `/analyze` in Matthew. Open a note, press **Import**, switch the picker to **Mark**, and file the note under the Mark topic you just made.
7. Confirm the scripture panel is still in Matthew — the picker's book change must not have moved it.
8. On `/thoughts` in Mark, confirm that topic's fan now holds the Matthew note.
9. Search for the Mark topic's name and click the result. It should land on Mark's field, not Matthew's.
