'use strict';

const fs = require('node:fs/promises');

/**
 * Loading and shape-validation of a public-domain Bible source file.
 *
 * Both translations come from getbible.net's v2 API, which serves an identical
 * JSON shape for each:
 *
 *   { translation, books: [ { nr, name, chapters: [ { chapter,
 *       verses: [ { chapter, verse, text } ] } ] } ] }
 *
 * Network access is not required: pass a previously downloaded copy of the same
 * JSON with --file and the importer reads it from disk instead.
 */

const SOURCE_URLS = Object.freeze({
    // World English Bible — public domain, preferred by the build plan.
    web: 'https://api.getbible.net/v2/web.json',
    // King James Version — public domain in the United States.
    kjv: 'https://api.getbible.net/v2/kjv.json',
});

const TRANSLATIONS = Object.freeze(Object.keys(SOURCE_URLS));

const DOWNLOAD_TIMEOUT_MS = 120_000;

/**
 * Reads the source from disk when `filePath` is given, otherwise downloads it.
 * Returns { origin, data } where `data` has passed shape validation.
 */
async function loadSource({ translation, filePath }) {
    if (!TRANSLATIONS.includes(translation)) {
        throw new Error(
            `Unknown translation "${translation}". Expected one of: ${TRANSLATIONS.join(', ')}`
        );
    }

    const origin = filePath || SOURCE_URLS[translation];
    const raw = filePath
        ? await readLocalFile(filePath)
        : await downloadFile(SOURCE_URLS[translation]);

    return { origin, data: parseSource(raw, origin) };
}

async function readLocalFile(filePath) {
    try {
        return await fs.readFile(filePath, 'utf8');
    } catch (error) {
        throw new Error(`Could not read source file "${filePath}": ${error.message}`);
    }
}

async function downloadFile(url) {
    let response;
    try {
        response = await fetch(url, {
            signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
            headers: { accept: 'application/json' },
        });
    } catch (error) {
        throw new Error(
            `Could not download ${url}: ${error.message}. ` +
                'If this machine has no network access, download the file elsewhere ' +
                'and re-run with --file=<path>.'
        );
    }

    if (!response.ok) {
        throw new Error(`Could not download ${url}: HTTP ${response.status} ${response.statusText}`);
    }

    return response.text();
}

/** Parses the JSON and rejects anything that is not the expected shape. */
function parseSource(raw, origin) {
    let data;
    try {
        data = JSON.parse(raw);
    } catch (error) {
        throw new Error(`Source at ${origin} is not valid JSON: ${error.message}`);
    }

    if (!data || typeof data !== 'object' || !Array.isArray(data.books)) {
        throw new Error(`Source at ${origin} has no "books" array`);
    }

    data.books.forEach(validateSourceBook);

    return data;
}

function validateSourceBook(book, bookPosition) {
    const label = `books[${bookPosition}]`;

    if (!book || typeof book !== 'object') {
        throw new Error(`Source ${label} is not an object`);
    }
    if (!Number.isInteger(book.nr)) {
        throw new Error(`Source ${label} has a non-integer "nr": ${JSON.stringify(book.nr)}`);
    }
    if (!Array.isArray(book.chapters)) {
        throw new Error(`Source ${label} (nr ${book.nr}) has no "chapters" array`);
    }

    book.chapters.forEach((chapter, chapterPosition) =>
        validateSourceChapter(chapter, `${label}.chapters[${chapterPosition}]`)
    );
}

function validateSourceChapter(chapter, label) {
    if (!chapter || typeof chapter !== 'object') {
        throw new Error(`Source ${label} is not an object`);
    }
    if (!Number.isInteger(chapter.chapter)) {
        throw new Error(`Source ${label} has a non-integer "chapter" number`);
    }
    if (!Array.isArray(chapter.verses) || chapter.verses.length === 0) {
        throw new Error(`Source ${label} has no verses`);
    }

    chapter.verses.forEach((verse, versePosition) =>
        validateSourceVerse(verse, `${label}.verses[${versePosition}]`)
    );
}

function validateSourceVerse(verse, label) {
    if (!verse || typeof verse !== 'object') {
        throw new Error(`Source ${label} is not an object`);
    }
    if (!Number.isInteger(verse.verse)) {
        throw new Error(`Source ${label} has a non-integer "verse" number`);
    }
    if (typeof verse.text !== 'string') {
        throw new Error(`Source ${label} has a non-string "text"`);
    }
}

module.exports = {
    DOWNLOAD_TIMEOUT_MS,
    SOURCE_URLS,
    TRANSLATIONS,
    loadSource,
};
