-- 006_reading_location.sql — where the Analyze page reopens
--
-- Apply after 005_pins.sql:
--     mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/006_reading_location.sql
--
-- The Analyze page's state is its query string: ?l= positions the primary
-- passage, ?r= the compare passage, ?note= opens the editor on one note. That
-- makes a link shareable, which is what it is for — but it also means a bare
-- /analyze knows nothing, so every visit that did not come from a bookmark
-- started at Genesis 1 again. A reader working through Romans over a week
-- re-navigated there daily.
--
-- So the last place is kept per user. Five columns on `admin` rather than a
-- table of its own: this is exactly one row per user with no history and no
-- second dimension, which is the shape a column has. A `reading_locations`
-- table would be `admin` with extra steps and a join on every page load.
--
-- Every column is nullable and every one starts NULL: "no saved place" has to
-- be sayable, or a fresh account would claim to have been left at book 0.

SET NAMES utf8mb4;

-- Book id and chapter are stored as the two numbers they are rather than as the
-- "1.1" string the URL carries, so the database can hold the same range it
-- holds everywhere else — `books`.`id` is TINYINT UNSIGNED and
-- `note_references`.`chapter` is too. A VARCHAR here would accept "999.999"
-- and defer the argument to whoever read it next.
--
-- The two halves of a position are written and read together and are only
-- meaningful together; a row with a book and no chapter is nonsense the API
-- never produces. Nothing enforces that pairing at the schema level because
-- MySQL cannot express it as a constraint on nullable columns, and the reader
-- treats a half-filled pair as no position at all. See src/lib/location.js.
ALTER TABLE `admin`
  ADD COLUMN `last_primary_book_id` TINYINT UNSIGNED NULL DEFAULT NULL,
  ADD COLUMN `last_primary_chapter` TINYINT UNSIGNED NULL DEFAULT NULL,
  ADD COLUMN `last_compare_book_id` TINYINT UNSIGNED NULL DEFAULT NULL,
  ADD COLUMN `last_compare_chapter` TINYINT UNSIGNED NULL DEFAULT NULL,
  -- The note the editor was left open on. Deliberately NOT a foreign key to
  -- `notes`, for the same reason `pins` has none to its item: `notes`.`user_id`
  -- already points at `admin`, and a foreign key back would close a cycle that
  -- makes deleting an account a puzzle for the sake of a pointer nothing reads
  -- unsafely. An id naming a note that is gone resolves to no open editor —
  -- useActiveNote only ever finds a note in the caller's own lists — so a stale
  -- value degrades to "the panel opens on its list", which is the same thing
  -- NULL does. DELETE /api/notes/:id clears it anyway, as housekeeping.
  ADD COLUMN `last_note_id` INT UNSIGNED NULL DEFAULT NULL;
