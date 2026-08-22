CREATE TABLE `admin` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `email` varchar(255)  NOT NULL,
  `password` varchar(255) NOT NULL,
  `access_level` tinyint unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Where the Analyze page reopens for this user: the two passage positions and
  -- the note the editor was left on. All NULL until the reader moves somewhere
  -- worth returning to. Added by src/db/migrations/006_reading_location.sql,
  -- which explains why these are columns here and not a table of their own.
  `last_primary_book_id` tinyint unsigned DEFAULT NULL,
  `last_primary_chapter` tinyint unsigned DEFAULT NULL,
  `last_compare_book_id` tinyint unsigned DEFAULT NULL,
  `last_compare_chapter` tinyint unsigned DEFAULT NULL,
  `last_note_id` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_email` (`email`)
);
