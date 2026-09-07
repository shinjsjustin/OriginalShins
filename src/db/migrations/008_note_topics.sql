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
