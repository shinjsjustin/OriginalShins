# Notes ↔ Topics — Design

Date: 2026-09-06
Status: approved in brainstorming session

## Summary

A note may now be linked directly to a topic, without an idea in between. A
third link table, `note_topics`, sits beside `note_ideas` and `idea_topics`;
the topics view of `/thoughts` fans a topic's directly-linked notes alongside
its ideas; and the pinned panel's Link action learns to write the new edge.

The tier structure stops being a chain and becomes a DAG. A note may reach a
topic through an idea, directly, both ways at once, or not at all. Every one of
those four is a legal state, exactly as every existing relationship is optional.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Where notes appear | In the topic card's hover fan, beside its ideas. No new view, no new URL param. |
| Which notes appear | **Directly-linked only.** A note reached through an idea stays in that idea's orbit and is not repeated in the topic's fan. |
| Note card in the fan | Title, clamped body, pin toggle — and it blooms its scripture passages, the way `IdeaOrbit`'s note cards do. |
| Counting notes | **Not done.** No note count on the card, and the existing `noteCount` is left as it is. Nothing on the client reads it. |
| Unfiled bubble | **Unchanged.** It keeps holding only ideas. Notes with no topic are not surfaced here; they remain reachable through their idea, `/analyze` and `/search`. |
| Three-tier selection | **Links everything downward** — `note→idea`, `idea→topic` and `note→topic`, three writes from one press. The previous "two tiers at a time" refusal is removed. |
| How the view loads notes | Inline on `GET /api/topics`. One request, the one the field already makes. |
| `/api/overview` | **Explicitly out of scope.** The direct `note→topic` path is not folded into the topic rail. The page is slated for removal, so the work would be thrown away. |

## Non-goals

- No `?topic=` orbit view. Clicking a fanned note does nothing beyond pinning.
- No "unfiled notes" bucket.
- No note count on the topic card, and no change to the existing `noteCount`.
- No change to `/api/overview`, `/api/search`, `/api/pins`, or the Analyze page.
- No reordering UI for a topic's notes. `sort_order` is written by the
  full-set replace and read back, nothing drags it.

## 1. Backend

### Migration `src/db/migrations/008_note_topics.sql`

```sql
CREATE TABLE IF NOT EXISTS `note_topics` (
  `note_id`    INT UNSIGNED NOT NULL,
  `topic_id`   INT UNSIGNED NOT NULL,
  `sort_order` INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`note_id`, `topic_id`),
  -- The reverse lookup: every note filed directly under one topic.
  KEY `idx_note_topics_topic` (`topic_id`, `sort_order`),
  CONSTRAINT `fk_note_topics_note`
    FOREIGN KEY (`note_id`) REFERENCES `notes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_note_topics_topic`
    FOREIGN KEY (`topic_id`) REFERENCES `topics` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Structurally identical to its two siblings: composite primary key, a
`sort_order` payload, no `user_id`. Ownership is established by joining to the
parents in the same statement that reads or writes the link, so "does this link
exist?" and "may the caller see it?" stay one question.

Cascade on both sides means deleting a note or a topic takes its rows with it;
no delete route needs to change.

### `src/lib/links.js` — one new spec, nothing else

```js
noteTopics: Object.freeze({
    table: 'note_topics',
    parentTable: 'notes',
    childTable: 'topics',
    parentColumn: 'note_id',
    childColumn: 'topic_id',
}),
```

`replaceLinks` is already generic over `LINK_SPECS`. The transaction, the
ownership checks and the `MISSING_PARENT` / `MISSING_CHILD` split all apply
unchanged. This is the entire server-side linking change.

### `src/lib/topics.js`

**`findTopicsForNotes(userId, noteIds)`** — new, a direct mirror of the
existing `findTopicsForIdeas`. Returns `[{ noteId, id, name, slug }, ...]` for
grouping by the caller.

**Counts are untouched.** No note count is added anywhere, and the existing
`note_count` in `findTopics` / `findTopicById` is left exactly as it is — still
counting notes reached through ideas, still ignoring the direct path.

That leaves it arguably incomplete, which is deliberate and worth recording so
a later reader does not "fix" it: **nothing on the client reads a topic's
`noteCount`.** The server computes it and no page displays it. (Every
`noteCount` in client code is the *idea* tier's, consumed by `orbitLayout`.)
Extending it correctly would mean replacing the joined `COUNT(DISTINCT)` with a
scalar subquery over a `UNION` of the two paths — the joins already fan out, so
a second independent path would multiply against the first — which is real work
for a number with no reader.

### `src/lib/notes.js`

**`findNotesForTopics(userId, topicIds)`** — new, the read behind the fan.
Mirrors `findNotesForIdea` in `ideas.js` but batched across topics, returning
rows tagged with their `topicId` in `sort_order` then `id` order. One query for
every topic rather than one per topic.

**`hydrate`** gains a third parallel read. It currently fetches references and
ideas together; `findTopicsForNotes` joins them:

```js
const [references, ideas, topics] = await Promise.all([...]);
```

and `toNote` gains a `topics` field. This is what gives `GET /api/notes/:id`
its `topics` array — which the client's `readSet` needs before it can replace a
note's topic set without dropping what is already there. Every other note
payload gains the field too, which is consistent and harmless.

### `src/lib/noteInput.js`

**`parseNoteTopics(payload)`** — new, one line beside `parseNoteIdeas`:
`parseIdList('topicIds', payload.topicIds)`.

### `src/routes/notes.js`

**`PUT /api/notes/:id/topics`** — `{ topicIds: [...] }`. A line-for-line mirror
of `PUT /api/notes/:id/ideas`: same `parseRowId` guard, same transaction, same
`LINK_SPECS` dispatch, same 404-for-parent / 400-for-child split, same
`findNoteById` in the response. An empty array unlinks the note from every
topic and is a normal 200.

It must sit behind `invalidateOverview` like every other write, so the overview
cache is dropped even though the overview's queries are unchanged.

### `src/routes/topics.js`

**`GET /api/topics`** — each topic in the list gains `notes: [...]`, its
directly-linked notes with title, body and anchor. This is the chosen read
strategy: the field already makes this request, `buildClusters` already builds
from lists held in memory, and it matches how `GET /api/ideas` carries each
idea's topics.

Rejected alternatives: `GET /api/topics/:id/notes` (N requests on a view that
opens cold) and a separate `GET /api/topics/notes` (a fourth read for something
this gives free).

**`GET /api/topics/:id/passages`** — new, a mirror of
`GET /api/ideas/:id/passages`. Resolves the topic's directly-linked notes and
hands their ids to the existing `findPassagesForNotes`. Two queries, one
request, for the whole fan.

## 2. Client data layer

### `useThoughtsData` — `LINK_TARGETS` rekeyed

Today the map is keyed by the child tier alone, which worked because a child
owned exactly one set. A note now owns **two** (`ideas` and `topics`), so the
key becomes `parentType:childType`:

| Key | Write |
|---|---|
| `idea:note` | `PUT /notes/:id/ideas` `{ ideaIds }` |
| `topic:idea` | `PUT /ideas/:id/topics` `{ topicIds }` |
| `topic:note` | `PUT /notes/:id/topics` `{ topicIds }` |

`groupPairs` groups by owner **and** target rather than by owner alone. Without
that, a note selected alongside both an idea and a topic collapses into one PUT
that clobbers the other set — the exact bug the child-major pair ordering was
built to prevent one tier down.

`readSet` gains nothing: it already reads `target.setKey` off the detail
payload, and `GET /api/notes/:id` now carries `topics`.

The rest of `linkPairs` is untouched — the sequential loop, the partial-failure
message, and the revision bump on any successful write all still hold.

### Topic passages — fetched lazily

The idea view fetches all its passages in one request when the view opens,
because there is one idea. The topics view has many topic cards, and fetching
every topic's passages on entry would be one request per card for blooms the
reader may never open.

So `GET /api/topics/:id/passages` fires on a topic's **first fan-open** and the
result is cached per topic id in the hook, cleared when `revision` bumps. The
fan draws its note cards immediately; the passages attach when they land, the
same way a bloom's contents already appear after their parent.

## 3. `TopicIdeaField` — one fan, two kinds of card

`buildClusters(topics, ideas)` keeps its signature. Ideas are still regrouped
by topic from the flat idea list, because that is where an idea's topic
membership lives; notes are read straight off `topic.notes`, because
`GET /api/topics` now carries them on the row. Each cluster gains
`notes: [...]`; the unfiled cluster carries `notes: []` and is otherwise
untouched.

The fan becomes `ideas.length + notes.length` cards — ideas first, notes after,
so a topic's ideas keep the positions they have today and adding a note never
reshuffles them. Note cards get a modifier class so they read as a different
kind of thing at a glance.

The card subtitle is **unchanged** — still `3 ideas`, still counted from
`cluster.ideas.length`. Notes are visible in the fan and are not tallied on the
card. This keeps `buildClusters`' "one source, one answer" rule trivially true:
there is no second number that could disagree with what the fan shows.

A note card nests a `BloomCluster` for its passages. `IdeaOrbit` already blooms
a note into its passages this way, so the nesting is an existing pattern rather
than a new one; `useBloom`'s hover-plus-lock is reused unchanged.

`onSelectIdea` still fires only for idea cards. A note card's only actions are
its pin toggle and its bloom.

## 4. `linkRules.js` — the rule stops being adjacency

The chain became a DAG, so "consecutive tiers" is no longer what makes a pair
linkable. Every ordered (higher, lower) pair now is:

```
before:  LINKABLE_PAIRS = consecutive entries of TIER_ORDER
         [topic,idea] [idea,note]

after:   LINKABLE_PAIRS = every ordered pair of TIER_ORDER
         [topic,idea] [topic,note] [idea,note]
```

`TIER_ORDER` stays exactly as it is — it is still the thing that says which
side of a pair is the parent. Deriving the pairs from it rather than listing
them keeps the property the original comment cared about: a fourth tier cannot
be added to one and forgotten in the other.

Consequences:

- **`nonAdjacent` is deleted.** Unreachable — every two-tier selection is now
  legal. Its hint ("a note and a topic cannot be linked directly") is now false
  and must not survive anywhere.
- **`allTiers` is deleted.** A three-tier selection writes all three downward
  edges instead of being refused.
- `SINGLE_TIER_HINTS` are rewritten: `note` → "Also select an idea or a topic.",
  `topic` → "Also select an idea or a note.", `idea` unchanged in substance.
- `evaluateLink`'s pair builder generalises from "the one occupied pair" to
  "every ordered tier pair present in the selection", still emitting
  child-major so `groupPairs` can slice it into one PUT per set.

`unknownType` and `empty` are unchanged.

## 5. Error handling

Nothing new in kind. The three failure surfaces already exist and each covers
the new edge without modification:

- **Validation** — `parseNoteTopics` rejects a malformed body with the same
  message shape as `parseNoteIdeas`.
- **Ownership** — a topic id the caller does not own is a 400 naming
  `topicIds`; a note id they do not own is a 404, indistinguishable from one
  that never existed.
- **Partial link failure** — `linkPairs` already reports "Linked 2 of 3, then
  could not link the note …" and bumps the revision so the canvas shows the
  edges that did land. A three-tier selection makes this path more likely to be
  hit, which is an argument for it being correct, not for changing it.

A topic's passages failing to load is **not** an error banner. The fan is still
correct without them; the bloom simply has nothing in it, the same as a note
with no anchor.

## 6. Testing

The repo has no server-side test harness — `npm test` is CRA's Jest, client
only. Tests go where the harness is; the server changes are verified in the
running app.

| File | Covers |
|---|---|
| `linkRules.test.js` | Every two-tier pair now links. Three tiers produce three edges, child-major. `nonAdjacent` and `allTiers` are gone. Rewritten single-tier hints. Duplicate-selection dedupe still holds. |
| `TopicIdeaField.test.js` | `buildClusters` with notes; direct-only membership; unfiled cluster carries no notes; fan card ordering (ideas first); subtitle still reports ideas only. |
| `useThoughtsData` (new tests) | `groupPairs` keyed by `parent:child` — a note with both an idea and a topic produces two PUTs to two endpoints, not one. |

Manual verification in the app: link a note to a topic from the pinned panel,
confirm it appears in that topic's fan, blooms its passages, survives a reload,
and that the note's existing idea links are untouched.

## 7. Documentation

`AGENTS.md`'s directory tree lists every migration and lib module with a
one-line description. It gains `008_note_topics.sql` and the new route lines,
and the `003_ideas_topics.sql` description is amended — it currently describes
the tier structure as a chain, which this change makes untrue.
