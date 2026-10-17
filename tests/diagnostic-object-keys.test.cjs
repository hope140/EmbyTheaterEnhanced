'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const diagnostics = require('../src/electronapp/enhanced/diagnostics');

// Synthetic keys exercise the same known formats as diagnostic string values.
const cases = [
    ['assignment', 'token=EKEY_ASSIGNMENT', 'EKEY_ASSIGNMENT'],
    ['header', 'Authorization: Bearer EKEY_HEADER', 'EKEY_HEADER'],
    ['URL', 'https://private.example.test/EKEY_URL?token=EKEY_QUERY', 'EKEY_QUERY'],
    ['Windows path', 'C:\\Users\\EKEY_WINDOWS\\Private.mkv', 'EKEY_WINDOWS'],
    ['UNC path', '\\\\EKEY_UNC\\Private\\Movie.mkv', 'EKEY_UNC'],
    ['POSIX path', '/home/EKEY_POSIX/Private.mkv', 'EKEY_POSIX']
];

for (const [kind, key, canary] of cases) {
    test('diagnostic object keys redact known ' + kind + ' input through nested export', () => {
        const record = diagnostics.sanitizeRecord({
            category: 'privacy',
            event: 'synthetic',
            details: {safeCounter: 3, nested: [{[key]: 'ordinary'}]}
        });
        assert.equal(record.details.safeCounter, 3);
        assert.equal(JSON.stringify(record).includes(canary), false);
        const report = diagnostics.buildDiagnosticReport([record], {appVersion: '0.3.9'},
            new Date('2026-10-17T16:00:00Z'));
        assert.equal(report.includes(canary), false);
        assert.deepEqual(diagnostics.sanitizeRecord(record), record);
    });
}

test('diagnostic object keys retain ordinary fields, limits and value redaction', () => {
    const key = 'k'.repeat(120);
    const record = diagnostics.sanitizeRecord({category: 'resolver', event: 'route-selected', details: {
        normal_key: true, safeCounter: 3, token: 'synthetic-value', [key]: 'bounded'
    }});
    assert.equal(record.category, 'resolver');
    assert.equal(record.event, 'route-selected');
    assert.equal(record.details.normal_key, true);
    assert.equal(record.details.safeCounter, 3);
    assert.equal(record.details.token, '[REDACTED]');
    assert.equal(record.details['k'.repeat(96)], 'bounded');
    assert.deepEqual(diagnostics.sanitizeRecord(record), record);
});
