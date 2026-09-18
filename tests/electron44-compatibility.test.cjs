'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const mainPath = path.join(repoRoot, 'src', 'electronapp', 'main.js');
const helperPath = path.join(repoRoot, 'src', 'electronapp', 'native-helper', 'service.js');

test('Electron 44 uses the supported window-open handler without creating child windows', () => {
    const source = fs.readFileSync(mainPath, 'utf8');
    assert.doesNotMatch(source, /\.on\(['"]new-window['"]/);
    assert.match(source, /setWindowOpenHandler\(function \(details\)/);
    assert.match(source, /electron\.shell\.openExternal\(details\.url\)/);
    assert.match(source, /return \{ action: 'deny' \}/);
});

test('unused BrowserView is removed without a WebContentsView migration', () => {
    const source = fs.readFileSync(mainPath, 'utf8');
    assert.doesNotMatch(source, /\bBrowserView\b/);
    assert.doesNotMatch(source, /\bWebContentsView\b/);
});

test('Electron 44 compatibility does not weaken existing renderer isolation settings', () => {
    const main = fs.readFileSync(mainPath, 'utf8');
    const helper = fs.readFileSync(helperPath, 'utf8');
    assert.match(main, /nodeIntegration:\s*false/);
    assert.doesNotMatch(main, /nodeIntegration:\s*true/);
    assert.match(main, /enableRemoteModule:\s*false/);
    assert.doesNotMatch(main, /enableRemoteModule:\s*true/);
    assert.match(helper, /nodeIntegration:\s*false,\s*contextIsolation:\s*true,\s*sandbox:\s*true/);
});
