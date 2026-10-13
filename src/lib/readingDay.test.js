const test = require('node:test');
const assert = require('node:assert/strict');
const { localDate, localDayStart, readingTimeZone } = require('./readingDay');

test('localDate gives the Los Angeles date when UTC is already the next day', () => {
    const instant = new Date('2024-03-10T03:30:00Z');
    assert.equal(localDate(instant, 'UTC'), '2024-03-10');
    assert.equal(localDate(instant, 'America/Los_Angeles'), '2024-03-09');
});

test('localDate zero-pads month and day', () => {
    assert.equal(localDate(new Date('2024-01-05T12:00:00Z'), 'UTC'), '2024-01-05');
});

test('readingTimeZone defaults to America/Los_Angeles', () => {
    const saved = process.env.READING_TIME_ZONE;
    delete process.env.READING_TIME_ZONE;
    try {
        assert.equal(readingTimeZone(), 'America/Los_Angeles');
    } finally {
        if (saved !== undefined) process.env.READING_TIME_ZONE = saved;
    }
});

test('readingTimeZone honours READING_TIME_ZONE', () => {
    const saved = process.env.READING_TIME_ZONE;
    process.env.READING_TIME_ZONE = 'Asia/Tokyo';
    try {
        assert.equal(readingTimeZone(), 'Asia/Tokyo');
    } finally {
        if (saved === undefined) delete process.env.READING_TIME_ZONE;
        else process.env.READING_TIME_ZONE = saved;
    }
});

test('localDayStart gives local midnight as a UTC instant, across the DST changes', () => {
    const cases = [
        ['2024-01-15', 'America/Los_Angeles', '2024-01-15T08:00:00.000Z'],
        ['2024-03-09', 'America/Los_Angeles', '2024-03-09T08:00:00.000Z'],
        ['2024-03-10', 'America/Los_Angeles', '2024-03-10T08:00:00.000Z'],
        ['2024-03-11', 'America/Los_Angeles', '2024-03-11T07:00:00.000Z'],
        ['2024-11-03', 'America/Los_Angeles', '2024-11-03T07:00:00.000Z'],
        ['2024-11-04', 'America/Los_Angeles', '2024-11-04T08:00:00.000Z'],
        ['2024-03-10', 'UTC', '2024-03-10T00:00:00.000Z'],
        ['2024-03-10', 'Asia/Tokyo', '2024-03-09T15:00:00.000Z'],
    ];
    for (const [date, zone, expected] of cases) {
        assert.equal(localDayStart(date, zone).toISOString(), expected, `${date} ${zone}`);
    }
});
