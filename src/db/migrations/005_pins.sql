-- 005_pins.sql — Phase 5: the Thoughts page's pinned set
--
-- Apply after 004_search.sql:
--     mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/005_pins.sql
--
-- A pin is a user saying "keep this where I can edit it". The Thoughts page's
-- right-docked panel is the only editing surface in the app, and it shows
-- exactly the pinned set — so this table is what makes an item editable.
--
-- One row per (user, item), and the item may be a topic, an idea or a note.
-- The composite primary key is what makes pinning idempotent: re-pinning is an
-- INSERT that collides with a row already saying the same thing, so it is a
-- no-op rather than a duplicate or an error.

SET NAMES utf8mb4;

-- The reference to the item is polymorphic — (item_type, item_id) names a row
-- in one of three tables — so there is deliberately NO foreign key to it. MySQL
-- cannot express a constraint that points at a different table depending on a
-- column's value, and the alternatives (three nullable columns, or a shared
-- items table) would distort three well-shaped tables to serve one small one.
--
-- Nothing is lost by leaving the item unconstrained, because a pin is never
-- read on its own: findPins joins each type's table to fetch the title, and
-- carries the owning user_id check into the join. A pin whose item has been
-- deleted — or was never the caller's — produces no joined row and so is simply
-- invisible. The topic/idea/note DELETE routes additionally clear matching pins
-- so the rows do not accumulate, but correctness does not depend on their doing
-- so: an orphaned pin is unreachable either way.
CREATE TABLE IF NOT EXISTS `pins` (
  `user_id`    INT UNSIGNED NOT NULL,
  `item_type`  ENUM('topic','idea','note') NOT NULL,
  `item_id`    INT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `item_type`, `item_id`),
  CONSTRAINT `fk_pins_user`
    FOREIGN KEY (`user_id`) REFERENCES `admin` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
