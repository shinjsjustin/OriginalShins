-- 011_scrolls.sql — scrolls (ordered blocks over a passage) and per-user API keys
--
-- Apply after 010_reading_days.sql, taking a backup first:
--     mysqldump -u "$DB_USER" -p "$DB_NAME" > backup-before-011.sql
--     mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/011_scrolls.sql
--
-- A scroll covers a passage and holds ordered blocks. `scroll_chapters` lists
-- each chapter the passage touches; a chapter belongs to at most one scroll
-- per user. API keys store only a SHA-256 hash and a 4-char hint.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `api_keys` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`      INT UNSIGNED NOT NULL,
  `name`         VARCHAR(60)  NOT NULL,
  `key_hash`     CHAR(64)     NOT NULL,
  `hint`         CHAR(4)      NOT NULL,
  `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_used_at` TIMESTAMP    NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_api_keys_hash` (`key_hash`),
  KEY `idx_api_keys_user` (`user_id`),
  CONSTRAINT `fk_api_keys_user`
    FOREIGN KEY (`user_id`) REFERENCES `admin` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `scrolls` (
  `id`            INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `user_id`       INT UNSIGNED     NOT NULL,
  `title`         VARCHAR(200)     NOT NULL DEFAULT '',
  `book_id`       TINYINT UNSIGNED NOT NULL,
  `start_chapter` TINYINT UNSIGNED NOT NULL,
  `start_verse`   TINYINT UNSIGNED NOT NULL,
  `end_chapter`   TINYINT UNSIGNED NOT NULL,
  `end_verse`     TINYINT UNSIGNED NOT NULL,
  `created_at`    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_scrolls_user` (`user_id`),
  CONSTRAINT `fk_scrolls_user`
    FOREIGN KEY (`user_id`) REFERENCES `admin` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_scrolls_book`
    FOREIGN KEY (`book_id`) REFERENCES `books` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `scroll_chapters` (
  `scroll_id` INT UNSIGNED     NOT NULL,
  `user_id`   INT UNSIGNED     NOT NULL,
  `book_id`   TINYINT UNSIGNED NOT NULL,
  `chapter`   TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (`scroll_id`, `chapter`),
  UNIQUE KEY `uq_scroll_chapters_user_chapter` (`user_id`, `book_id`, `chapter`),
  CONSTRAINT `fk_scroll_chapters_scroll`
    FOREIGN KEY (`scroll_id`) REFERENCES `scrolls` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_scroll_chapters_user`
    FOREIGN KEY (`user_id`) REFERENCES `admin` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_scroll_chapters_book`
    FOREIGN KEY (`book_id`) REFERENCES `books` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `scroll_blocks` (
  `id`                INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `scroll_id`         INT UNSIGNED     NOT NULL,
  `position`          INT UNSIGNED     NOT NULL,
  `kind`              ENUM('note','question','reference','idea') NOT NULL,
  `body`              MEDIUMTEXT       NOT NULL,
  `ref_book_id`       TINYINT UNSIGNED NULL DEFAULT NULL,
  `ref_chapter`       TINYINT UNSIGNED NULL DEFAULT NULL,
  `ref_start_verse`   TINYINT UNSIGNED NULL DEFAULT NULL,
  `ref_end_verse`     TINYINT UNSIGNED NULL DEFAULT NULL,
  `answer`            MEDIUMTEXT       NULL DEFAULT NULL,
  `answered_at`       TIMESTAMP        NULL DEFAULT NULL,
  `answer_updated_at` TIMESTAMP        NULL DEFAULT NULL,
  `created_at`        TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_scroll_blocks_position` (`scroll_id`, `position`),
  CONSTRAINT `fk_scroll_blocks_scroll`
    FOREIGN KEY (`scroll_id`) REFERENCES `scrolls` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_scroll_blocks_ref_book`
    FOREIGN KEY (`ref_book_id`) REFERENCES `books` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
