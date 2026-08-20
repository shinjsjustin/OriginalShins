-- 004_search.sql — Phase 5: the FULLTEXT index the scripture search runs on
--
-- Apply after 003_ideas_topics.sql:
--     mysql -u "$DB_USER" -p "$DB_NAME" < src/db/migrations/004_search.sql
--
-- GET /api/search answers in two halves. Notes, ideas and topics are matched
-- with LIKE — at the plan's scale (low thousands of rows per user, all of them
-- behind a user_id) a scan is cheap and the ranking rule is ours to write.
-- Scripture is 31,000-odd verses of prose that nothing scopes down first, so it
-- gets a real index and MATCH ... AGAINST instead.
--
-- Two consequences of InnoDB's defaults worth knowing before wondering why a
-- verse did not come back:
--
--   * innodb_ft_min_token_size defaults to 3, so a one- or two-character term
--     matches no verse however many verses contain it. The content groups still
--     answer, which is why the endpoint's minimum query length is 2 and not 3.
--   * The default stopword list holds the common English words, so "the" and
--     "for" match nothing here either.
--
-- Neither is worked around. Lowering the token size or emptying the stopword
-- list means rebuilding this index and answering "a" with a few thousand rows.
--
-- Building the index reads the whole table; on 31,095 verses that is seconds,
-- not minutes.

SET NAMES utf8mb4;

-- MySQL has no ADD INDEX IF NOT EXISTS, and re-running a migration must not be
-- an error — the three before this one are idempotent through CREATE TABLE IF
-- NOT EXISTS, so this one asks information_schema and skips the ALTER instead.
SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name   = 'verses'
    AND index_name   = 'ft_verses_text'
);

SET @statement := IF(
  @index_exists > 0,
  'SELECT ''ft_verses_text already exists'' AS note',
  'ALTER TABLE `verses` ADD FULLTEXT KEY `ft_verses_text` (`text`)'
);

PREPARE apply_index FROM @statement;
EXECUTE apply_index;
DEALLOCATE PREPARE apply_index;
