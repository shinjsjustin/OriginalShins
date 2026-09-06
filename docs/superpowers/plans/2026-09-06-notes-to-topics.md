# Notes ↔ Topics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a note be linked directly to a topic, with those notes shown in the topic's hover fan on `/thoughts` and the pinned panel's Link action able to write the new edge.

**Architecture:** A third link table, `note_topics`, joins the two that exist. `src/lib/links.js` is already generic over a frozen table spec, so the server-side write is one new spec plus a route that mirrors `PUT /api/notes/:id/ideas`. On the client the tier chain becomes a DAG: `linkRules.js` stops deriving linkable pairs from adjacency and derives them from "any higher tier to any lower one", and `useThoughtsData`'s link-target map is rekeyed by `parent:child` because a note now owns two link sets rather than one.

**Tech Stack:** Node/Express + MySQL2 (promise pool), React 18 (Create React App), Jest + React Testing Library. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-06-notes-to-topics-design.md`

---

## Before you start

**There is no server-side test harness.** `npm test` runs Create React App's Jest against `src/client` only. Client tasks (10–16) are TDD. Server tasks (1–9) are verified by running the app and exercising the endpoint; each server task states exactly how.

**Running things:**

```bash
npm run dev                      # server on :3001 + client on :3000
cd src/client && CI=true npm test -- --watchAll=false            # whole suite
cd src/client && CI=true npm test -- --watchAll=false -t "name"  # one test
```

**Run the client suite from `src/client`, not the repo root.** The root's
`npm run test:client` shells out via `npm --prefix`, which does not forward
`-t "name"` through the nested invocation — the flag is dropped, CRA falls back
to interactive watch mode, and the command hangs forever with no output. `CI=true`
is belt-and-braces on top of `--watchAll=false`. Every test command below assumes
you are in `src/client`.

**Database:** apply migrations with
`mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/<file>.sql`

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/db/migrations/008_note_topics.sql` | The `note_topics` table |

**Modified:**

| File | Change |
|---|---|
| `src/lib/links.js` | `noteTopics` entry in `LINK_SPECS` |
| `src/lib/noteInput.js` | `parseNoteTopics` |
| `src/lib/topics.js` | `findTopicsForNotes`, `findNotesForTopics` |
| `src/lib/notes.js` | `hydrate` and `toNote` carry `topics` |
| `src/routes/notes.js` | `PUT /api/notes/:id/topics` |
| `src/routes/topics.js` | `GET /` carries each topic's notes; new `GET /:id/passages` |
| `src/client/src/components/Thoughts/linkRules.js` | Pairs from tier order, not adjacency; hints rewritten |
| `src/client/src/components/Thoughts/useThoughtsData.js` | `LINK_TARGETS` rekeyed `parent:child`; `groupPairs` groups by owner **and** target |
| `src/client/src/components/Bubbles/TopicIdeaField.js` | Clusters carry notes; fan draws note petals; passage fans |
| `src/client/src/components/Styling/Thoughts.css` | Note-petal modifier |
| `AGENTS.md` | New migration, lib functions and routes |

**Note on where the two new queries live:** both go in `src/lib/topics.js`, not `notes.js`. That follows the existing convention — `ideas.js` owns *both* directions of the note↔idea link (`findIdeasForNotes` and `findNotesForIdea`), i.e. the higher tier's module owns its link. `topics.js` currently imports only `db` and `ordering`; it will also import `withFirstReferences` from `references.js`, exactly as `ideas.js` does. No cycle: `references.js` imports only `db`.

---

### Task 1: The `note_topics` table

**Files:**
- Create: `src/db/migrations/008_note_topics.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 008_note_topics.sql — a note filed directly under a topic
--
-- Apply after 007_chapter_ideas.sql:
--     mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/008_note_topics.sql
--
-- The third link table, and the one that stops the tiers being a chain. Until
-- now a note reached a topic only through an idea; it may now also be filed
-- under one directly. Both paths may be true of the same note at once, and
-- neither is required — an unfiled note is still a legal row, as it is
-- everywhere else in this schema.
--
-- Shaped exactly like note_ideas and idea_topics: a (parent, child) primary key
-- with a sort_order payload, written as a FULL SET REPLACE inside one
-- transaction rather than through add/remove endpoints, because the UI is a
-- multi-select and matching the API's shape to the widget's removes the class
-- of bugs where the two drift apart. The composite primary key is what makes
-- that replace idempotent.
--
-- No user_id, for the same reason its siblings have none: ownership is
-- established by joining to the parent rows in the same statement that reads or
-- writes the link, so "does this link exist?" and "may the caller see it?" are
-- one question and never two.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `note_topics` (
  `note_id`    INT UNSIGNED NOT NULL,
  `topic_id`   INT UNSIGNED NOT NULL,
  `sort_order` INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`note_id`, `topic_id`),
  -- The reverse lookup: every note filed directly under one topic. This is the
  -- index the topics view's fan reads.
  KEY `idx_note_topics_topic` (`topic_id`, `sort_order`),
  CONSTRAINT `fk_note_topics_note`
    FOREIGN KEY (`note_id`) REFERENCES `notes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_note_topics_topic`
    FOREIGN KEY (`topic_id`) REFERENCES `topics` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **Step 2: Apply it**

Run: `mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/008_note_topics.sql`
Expected: no output, exit code 0.

- [ ] **Step 3: Verify the table exists with both cascades**

Run: `mysql -u "$DB_USER" -p "$DB_NAME" -e "SHOW CREATE TABLE note_topics\G"`
Expected: the output names `PRIMARY KEY (note_id, topic_id)`, the key
`idx_note_topics_topic`, and two `ON DELETE CASCADE` foreign keys.

- [ ] **Step 4: Commit**

```bash
git add src/db/migrations/008_note_topics.sql
git commit -m "feat: add note_topics link table"
```

---

### Task 2: Teach `links.js` the new spec

**Files:**
- Modify: `src/lib/links.js` (the `LINK_SPECS` object)

- [ ] **Step 1: Add the spec**

In `LINK_SPECS`, after the `ideaTopics` entry, add:

```js
    noteTopics: Object.freeze({
        table: 'note_topics',
        parentTable: 'notes',
        childTable: 'topics',
        parentColumn: 'note_id',
        childColumn: 'topic_id',
    }),
```

- [ ] **Step 2: Update the module's opening comment**

The file opens with "The two link tables — note_ideas and idea_topics — write
identically". Replace that first paragraph with:

```js
// The three link tables — note_ideas, idea_topics and note_topics — write
// identically, so they are written once here.
```

and change "every caller picks one of these two specs by name" (in the comment
above `LINK_SPECS`) to "every caller picks one of these specs by name".

- [ ] **Step 3: Verify the spec is reachable and frozen**

Run:

```bash
node -e "const {LINK_SPECS}=require('./src/lib/links');console.log(LINK_SPECS.noteTopics, Object.isFrozen(LINK_SPECS.noteTopics))"
```

Expected:

```
{ table: 'note_topics', parentTable: 'notes', childTable: 'topics', parentColumn: 'note_id', childColumn: 'topic_id' } true
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/links.js
git commit -m "feat: add noteTopics link spec"
```

---

### Task 3: Validate the request body

**Files:**
- Modify: `src/lib/noteInput.js`

- [ ] **Step 1: Add the parser**

Directly after `parseNoteIdeas` (around line 127), add:

```js
// PUT /api/notes/:id/topics — { topicIds: [...] }
//
// The note tier's direct edge to topics, validated exactly as its idea set is:
// the whole membership, or a refusal naming the field. An empty array is valid
// and means "filed under no topic".
const parseNoteTopics = (payload) => {
    if (!isPlainObject(payload)) {
        return fail('request body must be a JSON object');
    }
    return parseIdList('topicIds', payload.topicIds);
};
```

- [ ] **Step 2: Export it**

In `module.exports`, add `parseNoteTopics,` immediately after `parseNoteIdeas,`.

- [ ] **Step 3: Verify it accepts and refuses the right shapes**

Run:

```bash
node -e "
const {parseNoteTopics}=require('./src/lib/noteInput');
console.log(JSON.stringify(parseNoteTopics({topicIds:[3,1]})));
console.log(JSON.stringify(parseNoteTopics({topicIds:[]})));
console.log(JSON.stringify(parseNoteTopics({topicIds:'x'})));
console.log(JSON.stringify(parseNoteTopics(null)));
"
```

Expected: the first two report a `value` array (`[3,1]` and `[]`); the last two
report an `error` string.

- [ ] **Step 4: Commit**

```bash
git add src/lib/noteInput.js
git commit -m "feat: validate topicIds on the notes API"
```

---

### Task 4: Read a note's topics

**Files:**
- Modify: `src/lib/topics.js`

- [ ] **Step 1: Add the query**

Directly after `findTopicsForIdeas` (it ends around line 106), add:

```js
// Every topic linked DIRECTLY to any of `noteIds`, flat, for hydrating a notes
// payload in one query rather than one per note.
//
// The mirror of findTopicsForIdeas above, one tier further down. It reads
// note_topics alone: a topic a note reaches through an idea is not returned
// here, because the two paths mean different things and the note's own set is
// the one the editor replaces.
const findTopicsForNotes = async (userId, noteIds) => {
    if (noteIds.length === 0) {
        return [];
    }

    const placeholders = noteIds.map(() => '?').join(', ');
    const [rows] = await db.execute(
        `SELECT nt.note_id, nt.sort_order, t.id, t.name, t.slug
         FROM note_topics nt
         JOIN topics t ON t.id = nt.topic_id
         JOIN notes n  ON n.id = nt.note_id
         WHERE nt.note_id IN (${placeholders})
           AND t.user_id = ?
           AND n.user_id = ?
         ORDER BY nt.note_id, nt.sort_order, t.id`,
        [...noteIds, userId, userId]
    );

    return rows.map(row => ({
        noteId: row.note_id,
        id: row.id,
        name: row.name,
        slug: row.slug,
        sortOrder: row.sort_order,
    }));
};
```

- [ ] **Step 2: Export it**

In `module.exports`, add `findTopicsForNotes,` immediately after
`findTopicsForIdeas,`.

- [ ] **Step 3: Verify it runs and returns an empty list for no ids**

Run:

```bash
node -e "
require('dotenv').config();
const {findTopicsForNotes}=require('./src/lib/topics');
findTopicsForNotes(1,[]).then(r=>{console.log('empty:',JSON.stringify(r));return findTopicsForNotes(1,[1,2,3]);})
 .then(r=>{console.log('rows:',JSON.stringify(r));process.exit(0)})
 .catch(e=>{console.error(e);process.exit(1)});
"
```

Expected: `empty: []` then `rows: []` (or real rows if user 1 has direct links —
none exist yet, so `[]` is correct). No SQL error.

- [ ] **Step 4: Commit**

```bash
git add src/lib/topics.js
git commit -m "feat: read the topics a note is filed under"
```

---

### Task 5: Every note payload carries its topics

**Files:**
- Modify: `src/lib/notes.js` (imports, `toNote`, `hydrate`)

This is what makes `GET /api/notes/:id` carry `topics`, which the client's
`readSet` needs before it can replace a note's topic set without dropping what
is already there.

- [ ] **Step 1: Import the query**

After the existing `const { findIdeasForNotes } = require('./ideas');` (line 9),
add:

```js
const { findTopicsForNotes } = require('./topics');
```

- [ ] **Step 2: Give `toNote` the field**

Replace `toNote` (lines 13–22) with:

```js
const toNote = (row, references = [], ideas = [], topics = []) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    references,
    ideas,
    // The topics this note is filed under DIRECTLY. A topic it reaches through
    // one of its ideas is not in here — that is the idea's membership, not the
    // note's, and this is the set PUT /api/notes/:id/topics replaces.
    topics,
});
```

- [ ] **Step 3: Fetch them alongside the other two**

Replace the body of `hydrate` (lines 36–52) with:

```js
const hydrate = async (userId, rows) => {
    const noteIds = rows.map(row => row.id);

    const [references, ideas, topics] = await Promise.all([
        findReferencesForNotes(userId, noteIds),
        findIdeasForNotes(userId, noteIds),
        findTopicsForNotes(userId, noteIds),
    ]);

    const referencesByNoteId = groupByNoteId(references);
    const ideasByNoteId = groupByNoteId(ideas);
    const topicsByNoteId = groupByNoteId(topics);

    return rows.map(row => toNote(
        row,
        referencesByNoteId[row.id] || [],
        ideasByNoteId[row.id] || [],
        topicsByNoteId[row.id] || []
    ));
};
```

Also extend the comment above `hydrate`: it says "Two queries for the whole
page, not two per note." Change both numbers to three.

- [ ] **Step 4: Verify no circular import and the field appears**

Run: `node -e "require('./src/lib/notes');console.log('notes.js loaded clean')"`
Expected: `notes.js loaded clean` — a cycle would print `undefined is not a function` or a TypeError here.

- [ ] **Step 5: Verify against the running app**

Start the server (`npm run dev`), log in, and fetch any note you own:

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/notes/1 | python3 -m json.tool
```

Expected: the `note` object now has a `"topics": []` key beside `"ideas"` and
`"references"`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notes.js
git commit -m "feat: carry a note's direct topics in every note payload"
```

---

### Task 6: `PUT /api/notes/:id/topics`

**Files:**
- Modify: `src/routes/notes.js`

- [ ] **Step 1: Extend the imports**

The file already imports `parseNoteIdeas` from `../lib/noteInput` and
`LINK_SPECS`, `MISSING_PARENT`, `replaceLinks` from `../lib/links`. Add
`parseNoteTopics` to the `noteInput` import list.

- [ ] **Step 2: Add the route**

Immediately after the `PUT /:id/ideas` handler ends (around line 348), add:

```js
// PUT /api/notes/:id/topics — { topicIds: [...] }
//
// Replaces the note's ENTIRE direct topic set, exactly as PUT /:id/ideas above
// replaces its idea set. The two are separate memberships and this endpoint
// leaves the idea set alone: a note may sit under a topic directly, under an
// idea that sits under that same topic, or both, and nothing here collapses
// those into one another.
//
// An empty array unlinks the note from every topic. That is a legal state, so
// it is a normal 200.
router.put('/:id/topics', async (req, res) => {
    const noteId = parseRowId(req.params.id);
    if (noteId === null) {
        return res.status(400).json({ error: 'id must be a positive integer' });
    }

    const parsed = parseNoteTopics(req.body);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Ownership of the note and of every topic id is checked inside the
        // transaction, so nothing can change between the check and the write.
        const result = await replaceLinks(
            connection,
            LINK_SPECS.noteTopics,
            req.user.id,
            noteId,
            parsed.value
        );

        if (result.error) {
            await connection.rollback();
            return result.error === MISSING_PARENT
                ? res.status(404).json({ error: 'Note not found' })
                : res.status(400).json({ error: 'topicIds names a topic that does not exist' });
        }

        await connection.commit();

        const note = await findNoteById(req.user.id, noteId);
        res.status(200).json({ note });
    } catch (err) {
        if (connection) {
            await connection.rollback().catch(rollbackErr => {
                console.error(`PUT /api/notes/${req.params.id}/topics rollback failed:`, rollbackErr);
            });
        }
        console.error(`PUT /api/notes/${req.params.id}/topics error:`, err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});
```

- [ ] **Step 3: Confirm it is behind the overview-cache invalidator**

Open `src/server.js` and check how the notes router is mounted. If
`invalidateOverview` wraps the router (rather than individual routes), nothing
to do. If it is applied per-route in `src/routes/notes.js`, apply it to this
route the same way the neighbouring `PUT /:id/ideas` does.

Run: `grep -n "invalidateOverview" src/server.js src/routes/notes.js`
Expected: you can point to the line that covers the new route.

- [ ] **Step 4: Verify the happy path and both refusals**

With the server running and `$TOKEN` set, against a note and topic you own:

```bash
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"topicIds":[1]}' http://localhost:3001/api/notes/1/topics | python3 -m json.tool
```

Expected: 200, and the returned `note.topics` contains topic 1.

```bash
# a topic that does not exist -> 400 naming topicIds
curl -s -o /dev/null -w '%{http_code}\n' -X PUT -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"topicIds":[999999]}' \
  http://localhost:3001/api/notes/1/topics
# a note that does not exist -> 404
curl -s -o /dev/null -w '%{http_code}\n' -X PUT -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"topicIds":[]}' \
  http://localhost:3001/api/notes/999999/topics
```

Expected: `400` then `404`.

- [ ] **Step 5: Verify the idea set is untouched**

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/notes/1 \
  | python3 -c "import sys,json;n=json.load(sys.stdin)['note'];print('ideas',len(n['ideas']),'topics',len(n['topics']))"
```

Expected: the `ideas` count is whatever it was before Step 4.

- [ ] **Step 6: Commit**

```bash
git add src/routes/notes.js
git commit -m "feat: replace a note's topic set over the API"
```

---

### Task 7: Read a topic's notes

**Files:**
- Modify: `src/lib/topics.js`

- [ ] **Step 1: Import the reference helper**

At the top of `src/lib/topics.js`, after the `ordering` import, add:

```js
const { withFirstReferences } = require('./references');
```

`references.js` imports only `db`, so this adds no cycle.

- [ ] **Step 2: Add the query**

After `findTopicsForNotes` (from Task 4), add:

```js
// Every note filed directly under any of `topicIds`, flat and tagged with the
// topic that reached it.
//
// Batched across topics rather than one call per topic, because the topics view
// draws every card's fan at once — one query for the whole field, the same way
// findTopicsForIdeas hydrates a whole ideas payload.
//
// The body comes back with it: the fan's note card shows a clamped body, and
// the alternative is the 1+N round trips the idea view pays. `withFirstReferences`
// attaches the anchor each card labels itself with.
const findNotesForTopics = async (userId, topicIds) => {
    if (topicIds.length === 0) {
        return [];
    }

    const placeholders = topicIds.map(() => '?').join(', ');
    const [rows] = await db.execute(
        `SELECT nt.topic_id, nt.sort_order, n.id, n.title, n.body
         FROM note_topics nt
         JOIN notes n  ON n.id = nt.note_id
         JOIN topics t ON t.id = nt.topic_id
         WHERE nt.topic_id IN (${placeholders})
           AND n.user_id = ?
           AND t.user_id = ?
         ORDER BY nt.topic_id, nt.sort_order, n.id`,
        [...topicIds, userId, userId]
    );

    return withFirstReferences(userId, rows.map(row => ({
        topicId: row.topic_id,
        id: row.id,
        title: row.title,
        body: row.body,
        sortOrder: row.sort_order,
    })));
};
```

- [ ] **Step 3: Export it**

In `module.exports`, add `findNotesForTopics,` after `findTopicsForNotes,`.

- [ ] **Step 4: Verify**

Run:

```bash
node -e "
require('dotenv').config();
const {findNotesForTopics}=require('./src/lib/topics');
findNotesForTopics(1,[]).then(r=>{console.log('empty:',JSON.stringify(r));return findNotesForTopics(1,[1]);})
 .then(r=>{console.log('rows:',JSON.stringify(r));process.exit(0)})
 .catch(e=>{console.error(e);process.exit(1)});
"
```

Expected: `empty: []`, then the note linked in Task 6 with a `firstReference`
key (`null` if that note has no anchor).

- [ ] **Step 5: Commit**

```bash
git add src/lib/topics.js
git commit -m "feat: read the notes filed directly under a topic"
```

---

### Task 8: `GET /api/topics` carries each topic's notes

**Files:**
- Modify: `src/routes/topics.js` (imports and the `GET /` handler)

- [ ] **Step 1: Import the query**

Add `findNotesForTopics` to the existing destructured import from
`../lib/topics`.

- [ ] **Step 2: Rewrite the list handler**

Replace the `GET /` handler (around lines 42–50) with:

```js
// GET /api/topics
// Every topic with the size of what hangs beneath it, and the notes filed
// directly under it.
//
// The notes ride along on the list rather than being a request per card: the
// topics view draws every fan at once, so a per-topic endpoint would be one
// round trip per card on a view that opens cold. Two queries either way.
router.get('/', async (req, res) => {
    try {
        const topics = await findTopics(req.user.id);
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

- [ ] **Step 3: Verify**

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/topics \
  | python3 -c "
import sys,json
for t in json.load(sys.stdin)['topics']:
    print(t['id'], t['name'], 'notes:', len(t['notes']))
"
```

Expected: every topic lists a `notes` count; the topic linked in Task 6 shows 1.

- [ ] **Step 4: Commit**

```bash
git add src/routes/topics.js
git commit -m "feat: carry a topic's direct notes on the topics list"
```

---

### Task 9: `GET /api/topics/:id/passages`

**Files:**
- Modify: `src/routes/topics.js`

- [ ] **Step 1: Import what it needs**

Add `findPassagesForNotes` from `../lib/passages`:

```js
const { findPassagesForNotes } = require('../lib/passages');
```

`findTopicById` and `findNotesForTopics` are already imported.

- [ ] **Step 2: Add the route**

Add it after the `GET /` handler and **before** any `/:id` route, so the more
specific path is matched first:

```js
// GET /api/topics/:id/passages — the scripture behind every note filed directly
// under one topic: one entry per note reference, carrying its book name and its
// verses.
//
// The mirror of GET /api/ideas/:id/passages one tier up, and it exists for the
// same reason: the topics view blooms a note card into the passages it is
// anchored to, and a reference that arrived as "John 3:16-18" alone would be a
// card naming a passage and showing none of it.
//
// Fetched per topic when its fan first opens rather than for every topic on
// entry — see useThoughtsData. One request for a whole fan, two queries.
router.get('/:id/passages', async (req, res) => {
    const topicId = parseRowId(req.params.id);
    if (topicId === null) {
        return res.status(400).json({ error: 'id must be a positive integer' });
    }

    try {
        // findTopicById scopes by user_id, so someone else's topic is a 404 here
        // — and the check is what tells "no notes yet" apart from "not yours",
        // since both would otherwise be an empty list.
        const topic = await findTopicById(req.user.id, topicId);
        if (!topic) {
            return res.status(404).json({ error: 'Topic not found' });
        }

        const notes = await findNotesForTopics(req.user.id, [topicId]);
        const passages = await findPassagesForNotes(req.user.id, notes.map(note => note.id));

        res.status(200).json({ passages });
    } catch (err) {
        console.error(`GET /api/topics/${req.params.id}/passages error:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
```

- [ ] **Step 3: Verify, including the 404**

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/topics/1/passages \
  | python3 -c "import sys,json;p=json.load(sys.stdin)['passages'];print('passages',len(p));print(p[0] if p else 'none')"
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/topics/999999/passages
```

Expected: a passage list (each entry carrying `noteId`, `bookName`, `verses`),
then `404`.

- [ ] **Step 4: Commit**

```bash
git add src/routes/topics.js
git commit -m "feat: serve the passages behind a topic's direct notes"
```

---

### Task 10: Linkable pairs stop being adjacency

**Files:**
- Modify: `src/client/src/components/Thoughts/linkRules.js`
- Test: `src/client/src/components/Thoughts/linkRules.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `linkRules.test.js`:

```js
import { LINKABLE_PAIRS, LINK_HINTS, evaluateLink } from './linkRules';

describe('LINKABLE_PAIRS', () => {
    test('joins every higher tier to every lower one, not just adjacent ones', () => {
        // Arrange / Act
        const pairs = LINKABLE_PAIRS.map(([parent, child]) => `${parent}>${child}`);

        // Assert
        expect(pairs).toEqual(['topic>idea', 'topic>note', 'idea>note']);
    });

    test('carries no upward or self pair', () => {
        expect(LINKABLE_PAIRS.some(([parent, child]) => parent === child)).toBe(false);
        expect(LINKABLE_PAIRS.some(([parent]) => parent === 'note')).toBe(false);
    });
});

describe('LINK_HINTS after topics gained a direct note edge', () => {
    test('drops the two refusals that no longer exist', () => {
        expect(LINK_HINTS.nonAdjacent).toBeUndefined();
        expect(LINK_HINTS.allTiers).toBeUndefined();
    });

    test('single-tier hints name every tier that selection could link to', () => {
        expect(LINK_HINTS.noteOnly).toBe('Also select an idea or a topic to link these notes to.');
        expect(LINK_HINTS.topicOnly).toBe('Also select an idea or a note to link these topics to.');
        expect(LINK_HINTS.ideaOnly).toBe('Also select a note or a topic to link these ideas to.');
    });
});

describe('evaluateLink with a note and a topic', () => {
    test('links them directly instead of refusing', () => {
        // Arrange
        const items = [
            { itemType: 'topic', itemId: 4 },
            { itemType: 'note', itemId: 9 },
        ];

        // Act
        const { canLink, reason, pairs } = evaluateLink(items);

        // Assert
        expect(canLink).toBe(true);
        expect(reason).toBeNull();
        expect(pairs).toEqual([[
            { itemType: 'topic', itemId: 4 },
            { itemType: 'note', itemId: 9 },
        ]]);
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run (from `src/client`): `CI=true npm test -- --watchAll=false -t "LINKABLE_PAIRS"`
Expected: FAIL — the pairs array is `['topic>idea','idea>note']`.

- [ ] **Step 3: Replace the pair derivation**

In `linkRules.js`, replace the `LINKABLE_PAIRS` definition and the comment above
it with:

```js
// Every [parent, child] a link may join: any tier to any tier below it.
//
// This used to be "consecutive entries of TIER_ORDER", because the corpus was a
// chain and a link only ever joined a tier to the one immediately under it.
// note_topics ended that — a note may now be filed under a topic directly, with
// no idea in between — so the corpus is a DAG and the rule is descent rather
// than adjacency.
//
// Still derived from TIER_ORDER rather than listed out, for the reason the
// original derivation existed: a fourth tier cannot be added to one and
// forgotten in the other.
export const LINKABLE_PAIRS = Object.freeze(
    TIER_ORDER.flatMap((parent, index) =>
        TIER_ORDER.slice(index + 1).map(child => Object.freeze([parent, child])))
);
```

- [ ] **Step 4: Rewrite the hints**

Replace the `LINK_HINTS` object with:

```js
// The one line shown under a disabled Link button.
//
// Each is phrased as the next move rather than as the rule that was broken:
// "why is this greyed out" is the only question a disabled control provokes,
// and the useful answer is what to select next, not which constraint failed.
//
// `nonAdjacent` and `allTiers` are gone. Every two-tier selection is now
// linkable, so the first is unreachable, and a three-tier selection writes
// every downward edge rather than being refused.
export const LINK_HINTS = Object.freeze({
    empty: 'Select pinned items to link.',
    noteOnly: 'Also select an idea or a topic to link these notes to.',
    ideaOnly: 'Also select a note or a topic to link these ideas to.',
    topicOnly: 'Also select an idea or a note to link these topics to.',
    unknownType: 'Only topics, ideas and notes can be linked.',
});
```

Also delete the two paragraphs in the file's opening comment headed
"── The chain, and its one gap ──" and "── Two tiers, and exactly two ──", and
put this in their place:

```js
// ── The corpus is a DAG, not a chain ───────────────────────────────────────
//
// Topic contains idea contains note, AND a topic may contain a note directly:
// there are three link tables, not two. So a link joins any tier to any tier
// below it, and every two-tier selection is linkable. A three-tier selection is
// no longer ambiguous either — it means all three downward edges, and writes
// them.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `src/client`): `CI=true npm test -- --watchAll=false -t "LINKABLE_PAIRS"`
Expected: PASS.

Run (from `src/client`): `CI=true npm test -- --watchAll=false -t "LINK_HINTS"`
Expected: PASS.

The `evaluateLink with a note and a topic` test will still fail — Task 11
handles it. Do not fix it here.

- [ ] **Step 6: Commit**

```bash
git add src/client/src/components/Thoughts/linkRules.js src/client/src/components/Thoughts/linkRules.test.js
git commit -m "feat: link any tier to any tier below it"
```

---

### Task 11: `evaluateLink` emits every downward pair

**Files:**
- Modify: `src/client/src/components/Thoughts/linkRules.js` (`evaluateLink`)
- Test: `src/client/src/components/Thoughts/linkRules.test.js`

- [ ] **Step 1: Write the failing test**

Add to `linkRules.test.js`:

```js
describe('evaluateLink across all three tiers', () => {
    const selection = [
        { itemType: 'topic', itemId: 4 },
        { itemType: 'idea', itemId: 7 },
        { itemType: 'note', itemId: 9 },
    ];

    test('writes all three downward edges rather than refusing', () => {
        // Act
        const { canLink, reason, pairs } = evaluateLink(selection);

        // Assert
        expect(canLink).toBe(true);
        expect(reason).toBeNull();
        expect(pairs.map(([parent, child]) => `${parent.itemType}>${child.itemType}`))
            .toEqual(['topic>idea', 'topic>note', 'idea>note']);
    });

    test('never emits an upward edge', () => {
        const { pairs } = evaluateLink(selection);

        expect(pairs.some(([parent, child]) =>
            parent.itemType === 'note' || child.itemType === 'topic')).toBe(false);
    });

    test('is child-major within one tier pair', () => {
        // Arrange — two topics over two ideas
        const items = [
            { itemType: 'topic', itemId: 1 },
            { itemType: 'topic', itemId: 2 },
            { itemType: 'idea', itemId: 8 },
            { itemType: 'idea', itemId: 9 },
        ];

        // Act
        const { pairs } = evaluateLink(items);

        // Assert — every parent for idea 8 before idea 9 begins
        expect(pairs.map(([parent, child]) => `${parent.itemId}->${child.itemId}`))
            .toEqual(['1->8', '2->8', '1->9', '2->9']);
    });

    test('still refuses a selection sitting in one tier', () => {
        expect(evaluateLink([{ itemType: 'note', itemId: 1 }]))
            .toEqual({ canLink: false, reason: LINK_HINTS.noteOnly, pairs: [] });
    });

    test('still refuses an unknown type outright', () => {
        const items = [
            { itemType: 'topic', itemId: 1 },
            { itemType: 'chapter', itemId: 2 },
        ];

        expect(evaluateLink(items))
            .toEqual({ canLink: false, reason: LINK_HINTS.unknownType, pairs: [] });
    });

    test('a row selected twice produces one pair, not two', () => {
        const items = [
            { itemType: 'topic', itemId: 4 },
            { itemType: 'note', itemId: 9 },
            { itemType: 'note', itemId: 9 },
        ];

        expect(evaluateLink(items).pairs).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `src/client`): `CI=true npm test -- --watchAll=false -t "evaluateLink across all three tiers"`
Expected: FAIL — the three-tier selection is currently refused with
`LINK_HINTS.allTiers`, which is now `undefined`.

- [ ] **Step 3: Rewrite the tail of `evaluateLink`**

In `evaluateLink`, replace everything from `if (occupied.length === 1)` to the
final `return`, with:

```js
    if (occupied.length === 1) return REFUSED(SINGLE_TIER_HINTS[occupied[0]]);

    const itemsIn = (tier) => byTier[TIER_ORDER.indexOf(tier)];

    // Every linkable pair the selection actually occupies, in LINKABLE_PAIRS
    // order — so all three tiers come out topic>idea, topic>note, idea>note.
    //
    // Child-major inside each pair: every parent for one child before the next
    // child, so the caller can slice the list into one PUT per child. Fresh
    // objects, never the caller's own — this runs on every render of the action
    // bar and must not hand React state back out by reference.
    const pairs = LINKABLE_PAIRS
        .filter(([parent, child]) => itemsIn(parent).length > 0 && itemsIn(child).length > 0)
        .flatMap(([parentTier, childTier]) => itemsIn(childTier).flatMap(child =>
            itemsIn(parentTier).map(parent => [
                { itemType: parent.itemType, itemId: parent.itemId },
                { itemType: child.itemType, itemId: child.itemId },
            ])));

    return { canLink: true, reason: null, pairs };
};
```

The `isAdjacent` check and the `const [parentTier, childTier] = occupied;`
destructuring are both deleted — `LINKABLE_PAIRS` now decides which pairs exist,
and `occupied` is only used for the single-tier refusal.

- [ ] **Step 4: Run the tests**

Run (from `src/client`): `CI=true npm test -- --watchAll=false -t "evaluateLink"`
Expected: PASS, including the `note and a topic` test from Task 10.

- [ ] **Step 5: Run the whole suite for regressions**

Run (from `src/client`): `CI=true npm test -- --watchAll=false`
Expected: PASS. Any pre-existing `linkRules` test asserting `nonAdjacent` or
`allTiers` will fail — those assertions describe behaviour this task
deliberately removes, so delete them rather than restoring the old rule.

- [ ] **Step 6: Commit**

```bash
git add src/client/src/components/Thoughts/linkRules.js src/client/src/components/Thoughts/linkRules.test.js
git commit -m "feat: write every downward edge from a multi-tier selection"
```

---

### Task 12: One note, two link sets

**Files:**
- Modify: `src/client/src/components/Thoughts/useThoughtsData.js`
- Test: `src/client/src/components/Thoughts/useThoughtsData.test.js` (create)

`LINK_TARGETS` is keyed by the child tier alone, which worked while a child
owned exactly one set. A note now owns two, so a note selected alongside both an
idea and a topic would collapse into one PUT that clobbers the other set.

- [ ] **Step 1: Export `groupPairs` so it can be tested**

In `useThoughtsData.js`, change `const groupPairs = (pairs) => {` to
`export const groupPairs = (pairs) => {`. The default export is unchanged.

- [ ] **Step 2: Write the failing test**

Create `src/client/src/components/Thoughts/useThoughtsData.test.js`:

```js
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
```

- [ ] **Step 3: Run to verify it fails**

Run (from `src/client`): `CI=true npm test -- --watchAll=false -t "groupPairs"`
Expected: FAIL — `a note under a topic` resolves to `/notes/9/ideas`, because
the map is keyed by `note` alone.

- [ ] **Step 4: Rekey `LINK_TARGETS`**

Replace the `LINK_TARGETS` definition and the comment above it with:

```js
// Where each link lives, keyed by "<parent tier>:<child tier>".
//
// The child is the side that OWNS the set — `PUT /api/notes/:id/ideas` replaces
// a note's whole set of ideas — and it is the side that appears in the URL.
//
// Keyed by the pair rather than by the child alone, which is what it used to be.
// That worked while a child owned exactly one set; a note now owns two (its
// ideas and its topics), and keying by `note` would send both of them to
// whichever endpoint the map happened to name — a full-set replace against the
// wrong membership, which silently empties the other one.
const LINK_TARGETS = Object.freeze({
    'idea:note': Object.freeze({
        detailPath: (id) => `/notes/${id}`,
        detailKey: 'note',
        setKey: 'ideas',
        linkPath: (id) => `/notes/${id}/ideas`,
        idsKey: 'ideaIds',
    }),
    'topic:idea': Object.freeze({
        detailPath: (id) => `/ideas/${id}`,
        detailKey: 'idea',
        setKey: 'topics',
        linkPath: (id) => `/ideas/${id}/topics`,
        idsKey: 'topicIds',
    }),
    'topic:note': Object.freeze({
        detailPath: (id) => `/notes/${id}`,
        detailKey: 'note',
        setKey: 'topics',
        linkPath: (id) => `/notes/${id}/topics`,
        idsKey: 'topicIds',
    }),
});
```

`partnerType` is gone from every entry — the key carries it now.

- [ ] **Step 5: Group by owner AND target**

Inside `groupPairs`, replace the body of the `for (const pair of pairs)` loop
with:

```js
        if (!Array.isArray(pair) || pair.length !== 2) return { error: LINK_HINTS.unknownType };

        const [partner, owner] = pair;
        if (!isItem(partner) || !isItem(owner)) return { error: LINK_HINTS.unknownType };

        // An unknown key is any pair that is not a real downward edge —
        // including an upward one, which is why there is no separate check for
        // that direction.
        const targetKey = `${partner.itemType}:${owner.itemType}`;
        const target = LINK_TARGETS[targetKey];
        if (!target) return { error: LINK_HINTS.unknownType };

        // The set, not just the item: one note has an idea set and a topic set,
        // and they are two writes to two endpoints.
        const key = `${targetKey}#${owner.itemId}`;
        const group = groups.get(key);

        groups.set(key, group
            ? { ...group, partnerIds: [...new Set([...group.partnerIds, partner.itemId])] }
            : { target, itemType: owner.itemType, itemId: owner.itemId, partnerIds: [partner.itemId] });
```

The old `keyOf(owner)` line and the `target.partnerType !== partner.itemType`
check are both deleted. `keyOf` (line 72) was used **only** by that line, so
delete the helper too — leaving it behind is an unused binding CRA will warn
about on every build.

- [ ] **Step 6: Run the tests**

Run (from `src/client`): `CI=true npm test -- --watchAll=false -t "groupPairs"`
Expected: PASS, all six.

- [ ] **Step 7: Run the whole suite**

Run (from `src/client`): `CI=true npm test -- --watchAll=false`
Expected: PASS.

- [ ] **Step 8: Verify end to end in the app**

With `npm run dev` running: open `/thoughts`, pin a topic, an idea and a note,
select all three in the pinned panel, press Link. Then check the note:

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/notes/<id> \
  | python3 -c "import sys,json;n=json.load(sys.stdin)['note'];print('ideas',[i['id'] for i in n['ideas']],'topics',[t['id'] for t in n['topics']])"
```

Expected: the note lists both the idea and the topic. Neither set is empty.

- [ ] **Step 9: Commit**

```bash
git add src/client/src/components/Thoughts/useThoughtsData.js src/client/src/components/Thoughts/useThoughtsData.test.js
git commit -m "feat: write a note's idea and topic sets independently"
```

---

### Task 13: Clusters carry their notes

**Files:**
- Modify: `src/client/src/components/Bubbles/TopicIdeaField.js`
- Test: `src/client/src/components/Bubbles/TopicIdeaField.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `TopicIdeaField.test.js`:

```js
import { buildClusters, clusterMembers, UNFILED_ID } from './TopicIdeaField';

describe('buildClusters with notes', () => {
    const topics = [
        { id: 1, name: 'Faith', notes: [{ id: 50, title: 'On grace', body: 'b' }] },
        { id: 2, name: 'Works', notes: [] },
    ];
    const ideas = [
        { id: 10, title: 'Grace alone', topics: [{ id: 1 }] },
        { id: 11, title: 'Loose thought', topics: [] },
    ];

    test('a topic carries the notes filed directly under it', () => {
        // Act
        const [faith] = buildClusters(topics, ideas);

        // Assert
        expect(faith.notes.map(note => note.id)).toEqual([50]);
        expect(faith.ideas.map(idea => idea.id)).toEqual([10]);
    });

    test('a topic with no direct notes carries an empty list, never undefined', () => {
        const [, works] = buildClusters(topics, ideas);

        expect(works.notes).toEqual([]);
    });

    test('a topic row with no notes key at all is tolerated', () => {
        const [faith] = buildClusters([{ id: 1, name: 'Faith' }], []);

        expect(faith.notes).toEqual([]);
    });

    test('the unfiled bubble holds ideas only — notes are never unfiled here', () => {
        const clusters = buildClusters(topics, ideas);
        const unfiled = clusters.find(cluster => cluster.id === UNFILED_ID);

        expect(unfiled.ideas.map(idea => idea.id)).toEqual([11]);
        expect(unfiled.notes).toEqual([]);
    });
});

describe('clusterMembers', () => {
    test('puts every idea before every note, so adding a note never moves an idea', () => {
        // Arrange
        const cluster = {
            ideas: [{ id: 10 }, { id: 11 }],
            notes: [{ id: 50 }],
        };

        // Act
        const members = clusterMembers(cluster);

        // Assert
        expect(members).toEqual([
            { kind: 'idea', item: { id: 10 } },
            { kind: 'idea', item: { id: 11 } },
            { kind: 'note', item: { id: 50 } },
        ]);
    });

    test('is empty for a cluster holding neither', () => {
        expect(clusterMembers({ ideas: [], notes: [] })).toEqual([]);
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run (from `src/client`): `CI=true npm test -- --watchAll=false -t "buildClusters with notes"`
Expected: FAIL — `faith.notes` is `undefined`, and `clusterMembers` is not
exported.

- [ ] **Step 3: Carry notes on every cluster**

In `buildClusters`, add the `notes` field to both cluster shapes:

```js
    const clusters = (Array.isArray(topics) ? topics : []).map(topic => ({
        id: topic.id,
        kind: 'topic',
        title: topic.name,
        ideas: byTopic.get(topic.id) || [],
        // Straight off the topic row: GET /api/topics carries them, so unlike
        // ideas — which are regrouped from the flat list because that is where
        // an idea's topic membership lives — there is nothing to regroup.
        notes: Array.isArray(topic.notes) ? topic.notes : [],
    }));

    const unfiled = safeIdeas.filter(idea => (idea.topics || []).length === 0);

    return unfiled.length === 0
        ? clusters
        : [...clusters, {
            id: UNFILED_ID,
            kind: 'unfiled',
            title: UNFILED_TITLE,
            ideas: unfiled,
            // Always empty. A note with no topic is not surfaced on this view at
            // all — it is reachable through its idea, /analyze and /search — so
            // the bubble means "unfiled ideas" exactly as its title says.
            notes: [],
        }];
```

Update the doc comment above `buildClusters` — it says "one per topic, plus the
unfiled pseudo-bubble" and explains the counts. Add:

```
 * Each cluster carries both what fans out of it: the ideas filed under the
 * topic, and the notes filed DIRECTLY under it. A note reached through one of
 * those ideas is not here — it belongs to the idea's orbit, and repeating it
 * would draw the same note twice on one screen.
```

- [ ] **Step 4: Add `clusterMembers`**

Directly after `buildClusters`, add:

```js
/**
 * A cluster's fan, in the order it is drawn: every idea, then every note.
 *
 * The fan is one arc over two kinds of thing, so the petal renderer needs one
 * indexable list rather than two and some arithmetic. Ideas come first so a
 * topic's ideas keep the positions they have today — filing a note under a
 * topic must not reshuffle the fan the reader already knows.
 */
export const clusterMembers = (cluster) => [
    ...cluster.ideas.map(item => ({ kind: 'idea', item })),
    ...cluster.notes.map(item => ({ kind: 'note', item })),
];
```

- [ ] **Step 5: Run the tests**

Run (from `src/client`): `CI=true npm test -- --watchAll=false -t "buildClusters with notes"`
Expected: PASS.

Run (from `src/client`): `CI=true npm test -- --watchAll=false -t "clusterMembers"`
Expected: PASS.

- [ ] **Step 6: Run the whole suite**

Run (from `src/client`): `CI=true npm test -- --watchAll=false`
Expected: PASS. Existing `buildClusters` tests pass unchanged — the new field is
additive.

- [ ] **Step 7: Commit**

```bash
git add src/client/src/components/Bubbles/TopicIdeaField.js src/client/src/components/Bubbles/TopicIdeaField.test.js
git commit -m "feat: carry a topic's direct notes on its cluster"
```

---

### Task 14: The fan draws note petals

**Files:**
- Modify: `src/client/src/components/Bubbles/TopicIdeaField.js`
- Modify: `src/client/src/components/Styling/Thoughts.css`
- Test: `src/client/src/components/Bubbles/TopicIdeaField.test.js`

- [ ] **Step 1: Write the failing test**

Add to `TopicIdeaField.test.js`. Follow the render/hover helpers the existing
tests in this file already use; if they hover by firing `mouseEnter` on the
topic card's container, do the same here.

```js
import { render, screen, fireEvent } from '@testing-library/react';
import TopicIdeaField from './TopicIdeaField';

describe('TopicIdeaField note petals', () => {
    const topics = [{
        id: 1,
        name: 'Faith',
        notes: [{ id: 50, title: 'On grace', body: 'and it is not of yourselves' }],
    }];
    const ideas = [{ id: 10, title: 'Grace alone', topics: [{ id: 1 }] }];

    test('draws a card for a directly-linked note beside the topic ideas', () => {
        // Arrange / Act
        render(<TopicIdeaField topics={topics} ideas={ideas} />);

        // Assert — every fan is mounted, so both petals exist without hovering
        expect(screen.getByText('Grace alone')).toBeInTheDocument();
        expect(screen.getByText('On grace')).toBeInTheDocument();
    });

    test('the subtitle still counts ideas only', () => {
        render(<TopicIdeaField topics={topics} ideas={ideas} />);

        expect(screen.getByText('1 idea')).toBeInTheDocument();
        // No "1 note" anywhere: notes are shown in the fan and never tallied
        // on the card. Matched narrowly so the note's own body cannot satisfy it.
        expect(screen.queryByText(/\d+ notes?\b/)).not.toBeInTheDocument();
    });

    test('clicking a note does not open an idea', () => {
        // Arrange
        const onSelectIdea = jest.fn();
        render(<TopicIdeaField topics={topics} ideas={ideas} onSelectIdea={onSelectIdea} />);

        // Act
        fireEvent.click(screen.getByText('On grace'));

        // Assert
        expect(onSelectIdea).not.toHaveBeenCalled();
    });

    test('clicking an idea still opens it', () => {
        const onSelectIdea = jest.fn();
        render(<TopicIdeaField topics={topics} ideas={ideas} onSelectIdea={onSelectIdea} />);

        fireEvent.click(screen.getByText('Grace alone'));

        expect(onSelectIdea).toHaveBeenCalledWith(10);
    });

    test('a note petal pins as a note', () => {
        // Arrange
        const onTogglePin = jest.fn();
        render(
            <TopicIdeaField
                topics={topics}
                ideas={ideas}
                isPinned={() => false}
                onTogglePin={onTogglePin}
            />
        );

        // Act — the pin control on the note card. BubbleCard labels its toggle
        // with the card title, so scope the query to that card.
        const noteCard = screen.getByText('On grace').closest('.thoughts-card');
        fireEvent.click(noteCard.querySelector('.thoughts-card-pin'));

        // Assert
        expect(onTogglePin).toHaveBeenCalledWith('note', 50, 'On grace');
    });
});
```

If `.thoughts-card` / `.thoughts-card-pin` are not the class names `BubbleCard`
actually renders, read `BubbleCard.js` and use the real ones — do not change
`BubbleCard` to fit the test.

- [ ] **Step 2: Run to verify it fails**

Run (from `src/client`): `CI=true npm test -- --watchAll=false -t "TopicIdeaField note petals"`
Expected: FAIL — "On grace" is not in the document; the fan is built from
`cluster.ideas.length` and renders idea cards only.

- [ ] **Step 3: Size the fan to every member**

In `TopicIdeaField`, replace the `fans` memo with:

```js
    // Every fan, not just the open one — see the note at the top of the file.
    // Sized to ideas + notes, because both fan out of the same topic on one arc.
    const fans = useMemo(() => field.map(
        (box, index) => buildFan(clusterMembers(clusters[index]).length, centreOf(box), canvas)
    ), [field, clusters, canvas]);
```

- [ ] **Step 4: Render the two kinds of petal**

In `TopicCluster`, replace the `renderPetal` prop with:

```js
            renderPetal={(card, petal) => {
                const member = clusterMembers(cluster)[card.index];
                if (!member) return null;

                if (member.kind === 'note') {
                    const note = member.item;
                    const title = note.title || UNTITLED_NOTE_LABEL;

                    return (
                        <BubbleCard
                            key={`note-${note.id}`}
                            kind="note"
                            title={title}
                            // The raw markdown, clamped by the stylesheet rather
                            // than cut here — the same treatment the idea view's
                            // note cards get.
                            subtitle={note.body}
                            className="thoughts-fan-note"
                            {...pinPropsFor('note', note.id, title)}
                            {...petal}
                        />
                    );
                }

                const idea = member.item;
                const title = idea.title || UNTITLED_IDEA_LABEL;

                return (
                    <BubbleCard
                        key={`idea-${idea.id}`}
                        kind="idea"
                        title={title}
                        onActivate={() => onSelectIdea(idea.id)}
                        {...pinPropsFor('idea', idea.id, title)}
                        {...petal}
                    />
                );
            }}
```

A note petal deliberately gets no `onActivate`: there is no topic-note view to
open, and its only actions are its pin and (Task 15) its bloom.

- [ ] **Step 5: Import the note label**

At the top of the file, extend the existing `TopBar` import:

```js
import { UNTITLED_IDEA_LABEL } from '../Thoughts/TopBar';
import { UNTITLED_NOTE_LABEL } from '../Thoughts/IdeaOrbit';
```

Check where `UNTITLED_NOTE_LABEL` is actually exported from — `IdeaOrbit.js`
uses it, so import it from whichever module exports it. If it is not exported,
export it from there rather than redefining the string.

- [ ] **Step 6: Give the note petal its own look**

In `src/client/src/components/Styling/Thoughts.css`, beside the existing fan-card
rules, add:

```css
/* A note in a topic's fan. Same geometry as an idea petal — the fan places both
   on one arc — but a different face, so the two kinds of thing hanging off a
   topic are told apart at a glance rather than read. */
.thoughts-fan-note {
    --card-surface: var(--card-surface-note, #fbf7ef);
    border-style: dashed;
}

.thoughts-fan-note .thoughts-card-subtitle {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
```

Check `index.css` and the existing `kind="note"` rules first — if a note surface
token already exists, use it instead of introducing `--card-surface-note`.

- [ ] **Step 7: Run the tests**

Run (from `src/client`): `CI=true npm test -- --watchAll=false -t "TopicIdeaField note petals"`
Expected: PASS, all five.

- [ ] **Step 8: Run the whole suite**

Run (from `src/client`): `CI=true npm test -- --watchAll=false`
Expected: PASS.

- [ ] **Step 9: Verify in the app**

With `npm run dev` running, open `/thoughts` and hover the topic you linked a
note to in Task 6. Expected: the fan opens with the topic's ideas and the note
beside them, the note visually distinct, its pin working, and clicking it doing
nothing.

- [ ] **Step 10: Commit**

```bash
git add src/client/src/components/Bubbles/TopicIdeaField.js \
        src/client/src/components/Bubbles/TopicIdeaField.test.js \
        src/client/src/components/Styling/Thoughts.css
git commit -m "feat: draw a topic's direct notes in its fan"
```

---

### Task 15: A note petal blooms its passages

**Files:**
- Modify: `src/client/src/components/Thoughts/useThoughtsData.js` (passage fetch)
- Modify: `src/client/src/components/Thoughts/Thoughts.js` (pass them down)
- Modify: `src/client/src/components/Bubbles/TopicIdeaField.js` (draw them)
- Test: `src/client/src/components/Bubbles/TopicIdeaField.test.js`

**Read this before starting.** `BloomCluster` positions itself at absolute
canvas coordinates (`bounds.x/y`), but petals are rendered *inside* the parent
cluster's already-offset div. So a `BloomCluster` **cannot** be nested inside a
petal — it would be offset twice. `IdeaOrbit` avoids this because its note
clusters are canvas-level siblings, not petals.

The passage fan is therefore drawn by `TopicIdeaField` at canvas level, off the
note petal's own canvas box, as a sibling of the topic cluster. `fan.cards[i]`
are already canvas-coordinate boxes, so the geometry is available.

- [ ] **Step 1: Fetch a topic's passages when its fan first opens**

In `useThoughtsData.js`, add above the hook:

```js
// A topic's passages, fetched when its fan first opens rather than for every
// topic when the view does.
//
// The idea view fetches all of its passages up front because there is one idea.
// The topics field has a card per topic, and fetching each one's passages on
// entry would be a request per card for blooms most readers never open. So this
// is lazy and cached per topic id, and cleared whenever the corpus reloads.
const useTopicPassages = (revision) => {
    const [byTopicId, setByTopicId] = useState({});
    const requested = useRef(new Set());

    // A write may have changed which notes a topic holds, so both the cache and
    // the record of what has been asked for are dropped on every reload.
    useEffect(() => {
        setByTopicId({});
        requested.current = new Set();
    }, [revision]);

    const loadPassagesFor = useCallback(async (topicId) => {
        if (!Number.isInteger(topicId) || requested.current.has(topicId)) return;
        requested.current.add(topicId);

        try {
            const payload = await fetchJson(`/topics/${topicId}/passages`);
            setByTopicId(previous => ({ ...previous, [topicId]: payload.passages || [] }));
        } catch (err) {
            // Deliberately silent. The fan is correct without its passages —
            // the bloom is simply empty, exactly as it is for a note with no
            // anchor — and an error banner over a page that is still right
            // would be the louder wrong answer.
            requested.current.delete(topicId);
        }
    }, []);

    return { passagesByTopicId: byTopicId, loadPassagesFor };
};
```

Add `useRef` to the `react` import at the top of the file.

- [ ] **Step 2: Expose it from the hook**

Inside `useThoughtsData`, after the `revision` state is declared, add:

```js
    const { passagesByTopicId, loadPassagesFor } = useTopicPassages(revision);
```

and add `passagesByTopicId,` and `loadPassagesFor,` to the returned object.

- [ ] **Step 3: Pass them to the field**

In `Thoughts.js`, pull `passagesByTopicId` and `loadPassagesFor` out of the
`useThoughtsData(ideaId)` destructuring, and hand them to `TopicIdeaField`:

```jsx
                            <TopicIdeaField
                                topics={topics}
                                ideas={ideas}
                                onSelectIdea={showIdea}
                                isPinned={isPinned}
                                onTogglePin={togglePin}
                                passagesByTopicId={passagesByTopicId}
                                onTopicOpen={loadPassagesFor}
                            />
```

- [ ] **Step 4: Write the failing test**

Add to `TopicIdeaField.test.js`:

```js
describe('TopicIdeaField passages', () => {
    const topics = [{
        id: 1,
        name: 'Faith',
        notes: [{ id: 50, title: 'On grace', body: 'b' }],
    }];

    test('asks for a topic\'s passages when its fan opens, once', () => {
        // Arrange
        const onTopicOpen = jest.fn();
        const { container } = render(
            <TopicIdeaField topics={topics} ideas={[]} onTopicOpen={onTopicOpen} />
        );
        const cluster = container.querySelector('.thoughts-cluster');

        // Act — open, leave, open again
        fireEvent.mouseEnter(cluster);
        fireEvent.mouseLeave(cluster);
        fireEvent.mouseEnter(cluster);

        // Assert — the hook dedupes, but the field must not spam it either
        expect(onTopicOpen).toHaveBeenCalledWith(1);
    });

    test('draws a passage card for the note it belongs to', () => {
        // Arrange
        const passagesByTopicId = {
            1: [{
                id: 900,
                noteId: 50,
                bookId: 49,
                bookName: 'Ephesians',
                chapter: 2,
                startVerse: 8,
                endVerse: 9,
                verses: [{ verseIndex: 1, verse: 8, text: 'For by grace' }],
            }],
        };

        // Act
        render(
            <TopicIdeaField
                topics={topics}
                ideas={[]}
                passagesByTopicId={passagesByTopicId}
            />
        );

        // Assert
        expect(screen.getByText(/Ephesians 2:8/)).toBeInTheDocument();
    });

    test('a note with no passages draws none', () => {
        render(<TopicIdeaField topics={topics} ideas={[]} passagesByTopicId={{ 1: [] }} />);

        expect(screen.queryByText(/Ephesians/)).not.toBeInTheDocument();
    });
});
```

- [ ] **Step 5: Run to verify it fails**

Run (from `src/client`): `CI=true npm test -- --watchAll=false -t "TopicIdeaField passages"`
Expected: FAIL — `onTopicOpen` is not called and no passage card renders.

- [ ] **Step 6: Draw the passage fans**

In `TopicIdeaField.js`:

Import what the passage cards need, reusing `IdeaOrbit`'s own exports rather
than restating the label logic:

```js
import { passageLabel, PassageText, PASSAGE_FAN } from '../Thoughts/IdeaOrbit';
```

If `PassageText` is not exported from `IdeaOrbit.js`, export it there. Do not
copy it — one renderer for a passage, shared.

Accept the two new props on `TopicIdeaField`:

```js
const TopicIdeaField = ({
    topics = [],
    ideas = [],
    onSelectIdea = () => {},
    isPinned = () => false,
    onTogglePin = null,
    passagesByTopicId = {},
    onTopicOpen = () => {},
}) => {
```

Add, after the `fans` memo:

```js
    // Each note petal's own fan of passages, positioned off that petal's canvas
    // box. Built here rather than inside the petal because a BloomCluster
    // positions itself in canvas coordinates and a petal is already inside its
    // parent's offset region — nesting one would offset it twice. So the
    // passage cards are siblings of the topic cluster, drawn over the field.
    const passageFans = useMemo(() => clusters.map((cluster, index) => {
        const members = clusterMembers(cluster);
        const byNoteId = (passagesByTopicId[cluster.id] || []).reduce((acc, passage) => ({
            ...acc,
            [passage.noteId]: [...(acc[passage.noteId] || []), passage],
        }), {});

        return members.flatMap((member, memberIndex) => {
            if (member.kind !== 'note') return [];

            const passages = byNoteId[member.item.id] || [];
            const card = fans[index].cards[memberIndex];
            if (passages.length === 0 || !card) return [];

            return [{
                key: `${cluster.id}:${member.item.id}`,
                clusterId: cluster.id,
                passages,
                fan: buildFan(passages.length, centreOf(card), canvas, PASSAGE_FAN),
            }];
        });
    }), [clusters, fans, passagesByTopicId, canvas]);
```

Tell the cluster to load its passages when it opens. In the `TopicCluster`
usage, wrap the enter handler:

```jsx
                    onEnter={(clusterId) => {
                        onTopicOpen(clusters[index].id);
                        bloom.onEnter(clusterId);
                    }}
```

Note `onTopicOpen` is called with the cluster id — for the unfiled bubble that
is the string `UNFILED_ID`, which `loadPassagesFor` rejects because it is not an
integer. That is the intended no-op, not an accident.

Finally, render the passage cards after the `field.map(...)`, inside
`.thoughts-field`:

```jsx
            {passageFans.flat().map(noteFan => (
                <div className="thoughts-passage-fan" key={noteFan.key}>
                    {noteFan.fan.cards.map(card => {
                        const passage = noteFan.passages[card.index];
                        if (!passage) return null;

                        return (
                            <BubbleCard
                                key={passage.id}
                                kind="passage"
                                title={passageLabel(passage)}
                                // `body`, not `subtitle`, and so no onActivate:
                                // BubbleCard's face is a button whenever it
                                // activates, and paragraphs inside a button are
                                // markup no browser agrees on.
                                body={<PassageText verses={passage.verses} />}
                                position={card}
                                scale={noteFan.fan.scale}
                                isFaded={!bloom.isActive(noteFan.clusterId)}
                            />
                        );
                    })}
                </div>
            ))}
```

- [ ] **Step 7: Style the passage fan**

In `Thoughts.css`, add:

```css
/* A note petal's passages. Positioned in canvas coordinates over the field, so
   it needs no bounds of its own — each card carries its own absolute position.
   It sits above the fan it hangs off and below the pinned panel. */
.thoughts-passage-fan {
    position: absolute;
    inset: 0;
    pointer-events: none;
}

.thoughts-passage-fan .thoughts-card {
    pointer-events: auto;
}
```

- [ ] **Step 8: Run the tests**

Run (from `src/client`): `CI=true npm test -- --watchAll=false -t "TopicIdeaField passages"`
Expected: PASS, all three.

- [ ] **Step 9: Run the whole suite**

Run (from `src/client`): `CI=true npm test -- --watchAll=false`
Expected: PASS.

- [ ] **Step 10: Verify in the app, and check the request count**

With `npm run dev` running, open `/thoughts` with the browser Network tab
filtered to `passages`:

1. On load, expect **zero** `/api/topics/*/passages` requests.
2. Hover the topic holding a note — expect exactly **one**.
3. Hover away and back — expect **no second** request.
4. The note's passages draw beside it and are readable.

If the passage cards land in the wrong place, the cause is almost certainly the
canvas-coordinate assumption in Step 6: confirm `fans[index].cards[i]` are
canvas boxes (`BloomCluster` calls `relativeTo(bounds, card)` on them, which
means they are) before changing anything else.

- [ ] **Step 11: Commit**

```bash
git add src/client/src/components/Thoughts/useThoughtsData.js \
        src/client/src/components/Thoughts/Thoughts.js \
        src/client/src/components/Bubbles/TopicIdeaField.js \
        src/client/src/components/Bubbles/TopicIdeaField.test.js \
        src/client/src/components/Styling/Thoughts.css
git commit -m "feat: bloom a topic's note into its passages"
```

---

### Task 16: Documentation

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add the migration to the tree**

In the directory tree, after the `007_chapter_ideas.sql` line, add:

```
    │       └── 008_note_topics.sql  # notes filed directly under a topic
```

- [ ] **Step 2: Correct the 003 description**

The tree describes `003_ideas_topics.sql` as
`# topics, ideas, idea_topics, note_ideas`. That is still accurate, but the
prose around the tiers is not: the corpus is no longer a chain. Update the
`links.js` line from

```
    │   ├── links.js                 # note_ideas / idea_topics: full-set replace
```

to

```
    │   ├── links.js                 # note_ideas / idea_topics / note_topics: full-set replace
```

- [ ] **Step 3: Add the routes**

Update the two route lines:

```
        ├── notes.js                # GET/POST/PATCH/DELETE /api/notes (+ one note, references, ideas, topics)
        ├── topics.js               # CRUD /api/topics (list carries counts + direct notes; + passages)
```

- [ ] **Step 4: Verify nothing else describes the tiers as a chain**

Run: `grep -n "chain\|two link tables\|note -> idea -> topic" AGENTS.md`
Expected: no hit describes the structure as a chain of exactly two links. Fix
any that does.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs: record note_topics in the directory tree"
```

---

## Done when

- [ ] A note can be linked to a topic from the pinned panel, with no idea involved.
- [ ] Selecting a topic, an idea and a note and pressing Link writes all three edges, and the note keeps both its idea set and its topic set.
- [ ] The topic's fan on `/thoughts` shows that note beside the topic's ideas, visually distinct, pinnable, and inert on click.
- [ ] The note blooms into its scripture passages, fetched once, only when the fan first opens.
- [ ] `npm run test:client -- --watchAll=false` passes.
- [ ] `/api/overview` is untouched — it is out of scope by decision, not omission.
