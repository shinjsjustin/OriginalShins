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
