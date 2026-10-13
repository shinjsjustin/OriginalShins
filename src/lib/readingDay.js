const DEFAULT_TIME_ZONE = 'America/Los_Angeles';

// en-CA formats as YYYY-MM-DD.
function localDate(instant, timeZone) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(instant);
}

function readingTimeZone() {
    return process.env.READING_TIME_ZONE || DEFAULT_TIME_ZONE;
}

// Milliseconds the zone's wall clock runs ahead of UTC at `instant`.
function zoneOffset(instant, timeZone) {
    const parts = {};
    new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
    })
        .formatToParts(instant)
        .forEach(({ type, value }) => {
            parts[type] = Number(value);
        });
    const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

// The instant of 00:00 local time on a YYYY-MM-DD date. The offset is looked up
// twice because the first guess (offset at UTC midnight) can sit on the other
// side of a DST change from the real local midnight.
function localDayStart(dateString, timeZone) {
    const [year, month, day] = dateString.split('-').map(Number);
    const utcMidnight = Date.UTC(year, month - 1, day);
    const guess = utcMidnight - zoneOffset(new Date(utcMidnight), timeZone);
    return new Date(utcMidnight - zoneOffset(new Date(guess), timeZone));
}

module.exports = { localDate, localDayStart, readingTimeZone };
