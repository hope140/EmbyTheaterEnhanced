'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const mainSource = fs.readFileSync(path.join(__dirname, '../src/electronapp/main.js'), 'utf8').replace(/\r\n/g, '\n');
const templateQuote = String.fromCharCode(96);

function extractFunction(source, prefix) {
    const start = source.indexOf(prefix);
    assert.ok(start >= 0, 'onLoaded source anchor exists');
    const open = source.indexOf('{', start + prefix.length);
    assert.ok(open >= 0, 'onLoaded function body exists');
    let depth = 0;
    let quote = null;
    let escaped = false;
    for (let index = open; index < source.length; index++) {
        const character = source[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === quote) quote = null;
            continue;
        }
        if (character === '"' || character === "'" || character === templateQuote) {
            quote = character;
            continue;
        }
        if (character === '{') depth++;
        else if (character === '}' && --depth === 0) return source.slice(start, index + 1);
    }
    throw new Error('Unclosed onLoaded function');
}

test('onLoaded no longer owns Anime4K chords or mutates global mpv profiles', () => {
    const onLoaded = extractFunction(mainSource, 'function onLoaded()');
    assert.doesNotMatch(onLoaded, /before-input-event|Anime4K|renameSync|sendCommand\(['"]stop['"]\)/);

    const eventListeners = [];
    const sentScripts = [];
    let preventDefaultCalls = 0;
    const mainWindow = {
        webContents: {
            on(eventName, handler) { eventListeners.push({eventName, handler}); }
        }
    };
    const sandbox = {
        electron: {BrowserWindow: {getAllWindows: () => [mainWindow]}},
        getWindowId: () => 'synthetic-window',
        process: {platform: 'win32'},
        sendJavascript(source) { sentScripts.push(source); }
    };
    vm.runInNewContext(onLoaded + '\nonLoaded();', sandbox);

    for (const key of ['0', '1', String.fromCharCode(96)]) {
        const event = {preventDefault() { preventDefaultCalls++; }};
        for (const listener of eventListeners.filter(item => item.eventName === 'before-input-event')) {
            listener.handler(event, {control: true, key});
        }
    }
    assert.equal(eventListeners.some(item => item.eventName === 'before-input-event'), false);
    assert.equal(preventDefaultCalls, 0);
    assert.deepEqual(sentScripts, [
        'window.PlayerWindowId="synthetic-window";',
        'window.platform="win32";'
    ]);
});
