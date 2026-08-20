#!/usr/bin/env node
'use strict';

/**
 * One-time scripture importer — Phase 0 of the build plan.
 *
 *   npm run import:scripture                          # World English Bible
 *   npm run import:scripture -- --translation=kjv     # King James Version
 *   npm run import:scripture -- --file=./web.json     # no network required
 *   npm run import:scripture -- --dry-run             # build + check, no writes
 *
 * Apply src/db/migrations/001_scripture.sql first.
 *
 * Re-running is safe: the import clears and reloads books/chapters/verses inside
 * one transaction, so the tables always end up in the same state and a failure
 * part-way leaves the previous contents intact.
 */

const pool = require('../db/db');
const { SOURCE_URLS, TRANSLATIONS, loadSource } = require('./scripture/source');
const { buildScriptureRows } = require('./scripture/build-rows');
const { loadScripture } = require('./scripture/load-rows');
const { verifyScripture } = require('./scripture/verify');

const DEFAULT_TRANSLATION = 'web';
const REQUIRED_TABLES = ['books', 'chapters', 'verses'];
const MIGRATION_PATH = 'src/db/migrations/001_scripture.sql';

const log = (message) => process.stdout.write(`${message}\n`);

function parseArgs(argv) {
    const options = { translation: DEFAULT_TRANSLATION, filePath: null, dryRun: false, help: false };

    for (const arg of argv) {
        const [flag, value] = splitFlag(arg);

        switch (flag) {
            case '--help':
            case '-h':
                options.help = true;
                break;
            case '--dry-run':
                options.dryRun = true;
                break;
            case '--translation':
                options.translation = requireValue(flag, value).toLowerCase();
                break;
            case '--file':
                options.filePath = requireValue(flag, value);
                break;
            default:
                throw new Error(`Unknown argument "${arg}". Run with --help for usage.`);
        }
    }

    if (!TRANSLATIONS.includes(options.translation)) {
        throw new Error(
            `Unknown translation "${options.translation}". Expected one of: ${TRANSLATIONS.join(', ')}`
        );
    }

    return options;
}

function splitFlag(arg) {
    const separator = arg.indexOf('=');
    return separator === -1 ? [arg, undefined] : [arg.slice(0, separator), arg.slice(separator + 1)];
}

function requireValue(flag, value) {
    if (!value) {
        throw new Error(`${flag} requires a value, e.g. ${flag}=something`);
    }
    return value;
}

function printUsage() {
    log('Usage: npm run import:scripture -- [options]');
    log('');
    log('Options:');
    log(`  --translation=web|kjv   Which public-domain text to load (default: ${DEFAULT_TRANSLATION})`);
    log('  --file=<path>           Read a local copy of the source JSON instead of downloading');
    log('  --dry-run               Build and check the rows without writing to the database');
    log('  --help                  Show this message');
    log('');
    log('Sources:');
    for (const [name, url] of Object.entries(SOURCE_URLS)) {
        log(`  ${name.padEnd(4)} ${url}`);
    }
}

/** Fails early with an actionable message when the migration has not been applied. */
async function assertTablesExist(connection) {
    const [rows] = await connection.query(
        `SELECT TABLE_NAME AS name FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?)`,
        [REQUIRED_TABLES]
    );

    const present = new Set(rows.map((row) => row.name));
    const missing = REQUIRED_TABLES.filter((table) => !present.has(table));

    if (missing.length > 0) {
        throw new Error(
            `Missing table(s): ${missing.join(', ')}. Apply the migration first:\n` +
                `  mysql -u "$DB_USER" -p "$DB_NAME" < ${MIGRATION_PATH}`
        );
    }
}

async function importScripture(options) {
    log(`Translation: ${options.translation}`);

    const { origin, data } = await loadSource(options);
    log(`Source:      ${origin}`);
    if (data.translation) {
        log(`Identified:  ${data.translation}${data.distribution_license ? ` (${data.distribution_license})` : ''}`);
    }

    const rows = buildScriptureRows(data);
    log(
        `Built ${rows.books.length} books, ${rows.chapters.length} chapters, ` +
            `${rows.verses.length} verses.`
    );

    if (options.dryRun) {
        log('Dry run — nothing written to the database.');
        return;
    }

    const connection = await pool.getConnection();

    try {
        await assertTablesExist(connection);

        log('Loading...');
        await loadScripture(connection, rows, log);

        log('Verifying...');
        const totals = await verifyScripture(connection, options.translation, log);
        log(
            `Verification passed: ${totals.bookCount} books, ${totals.chapterCount} chapters, ` +
                `${totals.verseCount} verses.`
        );
    } finally {
        connection.release();
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
        printUsage();
        return;
    }

    await importScripture(options);
    log('Done.');
}

main()
    .catch((error) => {
        process.exitCode = 1;
        process.stderr.write(`\nImport failed: ${error.message}\n`);
    })
    .finally(() => pool.end());
