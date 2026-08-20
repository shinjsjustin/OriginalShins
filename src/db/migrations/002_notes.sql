-- 002_notes.sql — Phase 2: notes and their scripture references
--
-- Apply after 001_scripture.sql:
--     mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/002_notes.sql
--
-- Two tables. `notes` holds the markdown body; `note_references` anchors a note
-- to a verse range. Every anchor carries the denormalized `verse_index` bounds
-- of that range, so "which notes touch this chapter?" is an integer comparison
-- against an index rather than a join through `verses`.
--
-- THE NAME. This table is `note_references`, never `references` — REFERENCES is
-- a reserved word in MySQL and the unqualified name would need backticking at
-- every single call site forever.
--
-- start_index / end_index are computed SERVER-SIDE on every insert and update
-- by reading verse_index out of `verses` (see src/lib/references.js). They are a
-- cache of the scripture tables, not user input, and the API never accepts them
-- from a client. Re-running the scripture importer against a different
-- translation renumbers verse_index and therefore invalidates every row here.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `notes` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED NOT NULL,
  `title`      VARCHAR(255) NOT NULL,
  `body`       TEXT         NOT NULL,          -- markdown; no block editor, no versioning
  `sort_order` INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- Every read is scoped to one user and ordered by sort_order; this index
  -- serves the whole access pattern.
  KEY `idx_notes_user_order` (`user_id`, `sort_order`, `id`),
  CONSTRAINT `fk_notes_user`
    FOREIGN KEY (`user_id`) REFERENCES `admin` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `note_references` (
  `id`          INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  `note_id`     INT UNSIGNED       NOT NULL,
  `book_id`     TINYINT UNSIGNED   NOT NULL,
  `chapter`     TINYINT UNSIGNED   NOT NULL,
  `start_verse` TINYINT UNSIGNED   NOT NULL,
  `end_verse`   TINYINT UNSIGNED   NOT NULL,
  `start_index` MEDIUMINT UNSIGNED NOT NULL,  -- denormalized from verses.verse_index
  `end_index`   MEDIUMINT UNSIGNED NOT NULL,  -- denormalized from verses.verse_index
  `sort_order`  INT UNSIGNED       NOT NULL DEFAULT 0,
  `created_at`  TIMESTAMP          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- The chapter-overlap query: start_index <= :chapter_end AND end_index >= :chapter_start
  KEY `idx_note_references_range` (`start_index`, `end_index`),
  -- Listing one note's anchors, and the cascade below.
  KEY `idx_note_references_note` (`note_id`, `sort_order`),
  CONSTRAINT `fk_note_references_note`
    FOREIGN KEY (`note_id`) REFERENCES `notes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_note_references_book`
    FOREIGN KEY (`book_id`) REFERENCES `books` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
