-- 007_chapter_ideas.sql — the ideas imported into a chapter
--
-- Apply after 006_reading_location.sql:
--     mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/007_chapter_ideas.sql
--
-- The Analyze notes panel grows an "Import idea" action: pin an idea you
-- already have to the chapter you are reading, so notes written there can be
-- filed under it without going hunting through the whole idea list first. This
-- table is where that pinning is remembered.
--
-- It is a table rather than a query, and that is the whole point of it. The
-- cheaper shape is obvious and wrong: "the ideas of this chapter are the ideas
-- of the notes anchored in it" needs no new table at all, since note_ideas and
-- note_references already say that. But a derived list can only ever describe
-- work already done. An idea is imported BEFORE any note in the chapter links
-- to it — that is the entire use case, not an edge of it — so a derived list
-- would first show an imported idea at the moment it stopped being needed, and
-- would drop it again the moment the last note using it moved elsewhere. An
-- import is a deliberate act with no other record, so it is stored.
--
-- Unlike idea_topics and note_ideas in 003_ideas_topics.sql, which deliberately
-- carry no user_id, this table does. Those two prove ownership by joining to
-- the parent row in the same statement that reads or writes the link, so that
-- "does this link exist?" and "may the caller see it?" stay one question. That
-- works because their parent is a row somebody owns. Here the parent is a
-- book/chapter coordinate: Romans 8 is the same Romans 8 for every reader and
-- belongs to nobody, so there is no row to join through and nothing to inherit
-- an owner from. The column is not a denormalization of something reachable by
-- another path — it is the only record of whose import this is, which is also
-- why it leads the primary key.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `chapter_ideas` (
  `user_id`    INT UNSIGNED     NOT NULL,
  -- The coordinate, in the same two columns and the same types the chapter half
  -- of an anchor uses in `note_references`, so a chapter position means the same
  -- thing and holds the same range everywhere in this schema.
  `book_id`    TINYINT UNSIGNED NOT NULL,
  `chapter`    TINYINT UNSIGNED NOT NULL,
  `idea_id`    INT UNSIGNED     NOT NULL,
  `sort_order` INT UNSIGNED     NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Written as a FULL SET REPLACE like the link tables in 003 — delete every row
  -- for the coordinate, then insert the new set inside one transaction — rather
  -- than through import/remove endpoints, because the panel holds the whole set
  -- and an API shaped like the widget cannot drift from it. The composite
  -- primary key is what makes that replace idempotent, and it is also what stops
  -- one idea being imported into the same chapter twice.
  PRIMARY KEY (`user_id`, `book_id`, `chapter`, `idea_id`),
  -- "Every idea imported into this chapter" is the read this table exists for,
  -- and the primary key's own leftmost prefix (user_id, book_id, chapter)
  -- already serves it — so there is deliberately no second index repeating those
  -- three columns. The direction that is NOT covered is the reverse, idea_id
  -- alone, which is what ON DELETE CASCADE walks when an idea is deleted; it
  -- begins no index prefix here, so InnoDB would silently create an index for
  -- the foreign key anyway. It is declared instead, so it carries a name that
  -- says which lookup it is for.
  KEY `idx_chapter_ideas_idea` (`idea_id`),
  CONSTRAINT `fk_chapter_ideas_user`
    FOREIGN KEY (`user_id`) REFERENCES `admin` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chapter_ideas_idea`
    FOREIGN KEY (`idea_id`) REFERENCES `ideas` (`id`) ON DELETE CASCADE,
  -- As `note_references` does for the same column: the canon is a fixed table,
  -- so a book id naming nothing is refused here rather than surviving as a row
  -- that no chapter lookup will ever match. No ON DELETE clause — books are
  -- never deleted, and if one somehow were, silently discarding a reader's
  -- imports would be the wrong answer.
  CONSTRAINT `fk_chapter_ideas_book`
    FOREIGN KEY (`book_id`) REFERENCES `books` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
