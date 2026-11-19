const test = require('node:test');
const assert = require('node:assert/strict');
const { parseKeyName } = require('./apiKeyInput');

test('trims the name and returns it as the value', () => {
    assert.deepEqual(parseKeyName({ name: '  laptop  ' }), { value: 'laptop' });
});

test('accepts names of exactly 1 and 60 characters', () => {
    assert.deepEqual(parseKeyName({ name: 'a' }), { value: 'a' });
    const sixty = 'x'.repeat(60);
    assert.deepEqual(parseKeyName({ name: sixty }), { value: sixty });
});

test('rejects blank, whitespace-only and 61-character names', () => {
    for (const name of ['', '   ', 'x'.repeat(61)]) {
        assert.ok(parseKeyName({ name }).error, `expected error for length ${name.length}`);
    }
});

test('rejects a missing or non-string name and a non-object body', () => {
    for (const body of [{}, { name: 5 }, { name: null }, { name: ['a'] }, null, undefined, 'laptop', []]) {
        assert.ok(parseKeyName(body).error, `expected error for ${JSON.stringify(body)}`);
    }
});
