'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('sanitized diagnostics collector black-box contract', () => {
    const root = path.join(__dirname, '..');
    const script = path.join(__dirname, 'diagnostics-collector-selftest.ps1');
    const result = spawnSync('powershell.exe', [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script
    ], {
        cwd: root,
        encoding: 'utf8',
        timeout: 120000,
        windowsHide: true
    });
    assert.equal(result.error, undefined, result.error && result.error.message);
    assert.equal(result.status, 0, `${result.stdout || ''}${result.stderr || ''}`);
    assert.match(result.stdout, /diagnostics collector self-test: PASS/);
});
