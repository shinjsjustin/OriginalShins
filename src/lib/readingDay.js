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

module.exports = { localDate, readingTimeZone };
