'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('package supports a bounded candidate filename without changing product version', () => {
    const packageScript = fs.readFileSync(path.join(root, 'tools', 'package.ps1'), 'utf8');
    const installer = fs.readFileSync(path.join(root, 'installer', 'EmbyTheaterEnhanced.iss'), 'utf8');
    assert.match(packageScript, /\[string\]\$OutputBaseFilename = ''/);
    assert.match(packageScript, /OutputBaseFilename -notmatch '\^\[A-Za-z0-9\]/);
    assert.match(packageScript, /\/DOutputBaseFilename=\$OutputBaseFilename/);
    assert.match(installer, /OutputBaseFilename=\{#OutputBaseFilename\}/);
    assert.match(installer, /AppVersion=\{#AppVersion\}/);
});
