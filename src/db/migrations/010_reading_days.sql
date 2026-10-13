-- 010_reading_days.sql — which chapters were read on which days
--
-- Apply after 009_topic_books.sql:
--     mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/010_reading_days.sql
--
-- The saved location (006) keeps only the last place. A reading log needs
-- history, so each chapter opened is recorded once per user per local day.
-- `read_on` is the reader's local date, computed by the application.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `reading_days` (
  `user_id`         INT UNSIGNED     NOT NULL,
  `read_on`         DATE             NOT NULL,
  `book_id`         TINYINT UNSIGNED NOT NULL,
  `chapter`         TINYINT UNSIGNED NOT NULL,
  `first_opened_at` TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_opened_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `read_on`, `book_id`, `chapter`),
  CONSTRAINT `fk_reading_days_user`
    FOREIGN KEY (`user_id`) REFERENCES `admin` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reading_days_book`
    FOREIGN KEY (`book_id`) REFERENCES `books` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- When the saved location was last written; NULL until the first save.
ALTER TABLE `admin`
  ADD COLUMN `last_location_saved_at` TIMESTAMP NULL DEFAULT NULL;
