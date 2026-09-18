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

test('hidden formal smoke does not require an unavailable display capture surface', () => {
    const smoke = fs.readFileSync(path.join(repoRoot, 'tools', 'smoke-electron.cjs'), 'utf8');
    assert.match(smoke, /screenshotStatus = 'NOT_RUN_HIDDEN'/);
    assert.match(smoke, /if \(process\.env\.ETE_TEST_VISIBLE\) \{\s*const screenshot = await win\.webContents\.capturePage\(\)/);
});

test('legacy internal XHR schemes receive only the privileges required by Electron 44', () => {
    const source = fs.readFileSync(mainPath, 'utf8');
    for (const scheme of [
        'electronapphost', 'electronfs', 'electronserverdiscovery',
        'electronwakeonlan', 'electronrefreshrate', 'electroncec'
    ]) assert.match(source, new RegExp("'" + scheme + "'"));
    assert.match(source, /privileges: \{ standard: true, supportFetchAPI: true, corsEnabled: true \}/);
    assert.doesNotMatch(source, /bypassCSP:\s*true|allowServiceWorkers:\s*true|secure:\s*true/);
});
