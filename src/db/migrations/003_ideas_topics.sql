-- 003_ideas_topics.sql — Phase 3: ideas, topics and the two link tables
--
-- Apply after 002_notes.sql:
--     mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/003_ideas_topics.sql
--
-- The tier above notes. A note may belong to any number of ideas, an idea to
-- any number of topics, and every one of those relationships is optional: an
-- idea with no topic and a note with no idea are legal states, not errors. The
-- Topic page reaches them through its "unfiled" buckets, so nothing here — and
-- nothing in the API above it — may require a link to exist.
--
-- Both link tables are (parent, child) primary keys with a sort_order payload.
-- They are written as a FULL SET REPLACE (delete every row for the parent, then
-- insert the new set inside one transaction) rather than through add/remove
-- endpoints, because the UI is a multi-select: matching the API shape to the
-- widget's shape removes the class of bugs where the two drift apart. The
-- composite primary key is what makes that replace idempotent.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `topics` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`     INT UNSIGNED NOT NULL,
  `name`        VARCHAR(255) NOT NULL,
  -- Derived from the name by the client and re-derived/validated server-side.
  -- Unique per user, not globally: two users may both have a "faith" topic.
  `slug`        VARCHAR(255) NOT NULL,
  `description` TEXT         NOT NULL,
  `sort_order`  INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_topics_user_slug` (`user_id`, `slug`),
  KEY `idx_topics_user_order` (`user_id`, `sort_order`, `id`),
  CONSTRAINT `fk_topics_user`
    FOREIGN KEY (`user_id`) REFERENCES `admin` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ideas` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED NOT NULL,
  `title`      VARCHAR(255) NOT NULL,
  `body`       TEXT         NOT NULL,          -- markdown, exactly as notes.body
  `sort_order` INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ideas_user_order` (`user_id`, `sort_order`, `id`),
  CONSTRAINT `fk_ideas_user`
    FOREIGN KEY (`user_id`) REFERENCES `admin` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Neither link table carries a user_id. Ownership is established by joining to
-- the parent rows in the same statement that reads or writes the link, exactly
-- as note_references does — so "does this link exist?" and "may the caller see
-- it?" are one question and never two.

CREATE TABLE IF NOT EXISTS `idea_topics` (
  `idea_id`    INT UNSIGNED NOT NULL,
  `topic_id`   INT UNSIGNED NOT NULL,
  `sort_order` INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`idea_id`, `topic_id`),
  -- The reverse lookup: every idea filed under one topic.
  KEY `idx_idea_topics_topic` (`topic_id`, `sort_order`),
  CONSTRAINT `fk_idea_topics_idea`
    FOREIGN KEY (`idea_id`) REFERENCES `ideas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_idea_topics_topic`
    FOREIGN KEY (`topic_id`) REFERENCES `topics` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `note_ideas` (
  `note_id`    INT UNSIGNED NOT NULL,
  `idea_id`    INT UNSIGNED NOT NULL,
  `sort_order` INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`note_id`, `idea_id`),
  -- The reverse lookup: every note filed under one idea.
  KEY `idx_note_ideas_idea` (`idea_id`, `sort_order`),
  CONSTRAINT `fk_note_ideas_note`
    FOREIGN KEY (`note_id`) REFERENCES `notes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_note_ideas_idea`
    FOREIGN KEY (`idea_id`) REFERENCES `ideas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
