-- 001_scripture.sql — Phase 0: scripture tables (books, chapters, verses)
--
-- Static, read-only reference data. Loaded once by:
--     npm run import:scripture
--
-- Apply this migration first:
--     mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/001_scripture.sql
--
-- The `verse_index` column on `verses` is a single monotonic integer running
-- 1..N over the whole Bible in canonical order (N = 31,102 for KJV, 31,095 for
-- WEB). It is computed once at import time and never at query time. Chapter
-- ranges are denormalized onto `chapters` as start_index / end_index so both
-- the chapter fetch and the Overview axis are plain integer comparisons.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `books` (
  `id`              TINYINT UNSIGNED NOT NULL,
  `name`            VARCHAR(32)      NOT NULL,
  `abbrev`          VARCHAR(8)       NOT NULL,
  `testament`       ENUM('OT','NT')  NOT NULL,
  `chapter_count`   TINYINT UNSIGNED NOT NULL,
  `canonical_order` TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  -- Beyond the plan's spec: names and canonical positions must be unique, and
  -- letting the database enforce that is free.
  UNIQUE KEY `uq_books_name` (`name`),
  UNIQUE KEY `uq_books_canonical_order` (`canonical_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `chapters` (
  `id`          SMALLINT UNSIGNED  NOT NULL,
  `book_id`     TINYINT UNSIGNED   NOT NULL,
  `number`      TINYINT UNSIGNED   NOT NULL,
  `verse_count` TINYINT UNSIGNED   NOT NULL,
  `start_index` MEDIUMINT UNSIGNED NOT NULL,  -- verse_index of verse 1
  `end_index`   MEDIUMINT UNSIGNED NOT NULL,  -- verse_index of the last verse
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_chapters_book_number` (`book_id`, `number`),
  KEY `idx_chapters_range` (`start_index`, `end_index`),
  CONSTRAINT `fk_chapters_book`
    FOREIGN KEY (`book_id`) REFERENCES `books` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `verses` (
  `id`          MEDIUMINT UNSIGNED NOT NULL,
  `book_id`     TINYINT UNSIGNED   NOT NULL,
  `chapter`     TINYINT UNSIGNED   NOT NULL,
  `verse`       TINYINT UNSIGNED   NOT NULL,
  `verse_index` MEDIUMINT UNSIGNED NOT NULL,
  `text`        TEXT               NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_verses_verse_index` (`verse_index`),
  -- The plan specifies a plain INDEX (book_id, chapter, verse); UNIQUE serves
  -- the same lookups and additionally rejects a duplicated verse on import.
  UNIQUE KEY `uq_verses_ref` (`book_id`, `chapter`, `verse`),
  CONSTRAINT `fk_verses_book`
    FOREIGN KEY (`book_id`) REFERENCES `books` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
