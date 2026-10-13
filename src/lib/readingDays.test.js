const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const db = require('../db/db');
const { recordReadingDay } = require('./readingDays');

test.afterEach(() => mock.restoreAll());

test('recordReadingDay upserts one row per user, day, book and chapter', async () => {
    const execute = mock.method(db, 'execute', async () => [{ affectedRows: 1 }]);

    await recordReadingDay(7, { readOn: '2024-03-09', bookId: 43, chapter: 3 });

    assert.equal(execute.mock.callCount(), 1);
    const [sql, params] = execute.mock.calls[0].arguments;
    assert.match(sql, /INSERT INTO reading_days/);
    assert.match(sql, /ON DUPLICATE KEY UPDATE\s+last_opened_at\s*=\s*CURRENT_TIMESTAMP/);
    assert.deepEqual(params, [7, '2024-03-09', 43, 3]);
});
