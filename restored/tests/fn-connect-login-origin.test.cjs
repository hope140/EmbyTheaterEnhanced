'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {EventEmitter} = require('node:events');
const {createElectronIO} = require('../prototypes/fn-connect/client/electron-io.cjs');

async function setup(load = () => Promise.resolve(), agent = 'Mozilla/5.0 Chrome/144.0.0.0 Electron/44.4.2 Safari/537.36') {
    let window;
    class Window extends EventEmitter {
        constructor() {
            super(); window = this;
            this.webContents = new EventEmitter();
            this.agents = [];
            this.webContents.getUserAgent = () => agent;
            this.webContents.setUserAgent = value => this.agents.push(value);
            this.webContents.setWindowOpenHandler = handler => { this.popup = handler; };
        }
        loadURL(value) { return load(value); }
        isDestroyed() { return false; }
        destroy() { this.emit('closed'); }
    }
    const messages = [], authOrigins = new Set(['https://nas.example.test', 'https://media.example.test']);
    const io = createElectronIO({BrowserWindow: Window}, {onStatus: value => messages.push(value)});
    const handle = await io.openLogin({}, {bootstrap: new URL('https://nas.example.test/'),
        emby: new URL('https://media.example.test/'), authOrigins}, {signal: new AbortController().signal, onCancel() {}});
    return {window, messages, authOrigins, handle};
}

for (const event of ['will-navigate', 'will-redirect']) test(event + ' remains denied and reports only a sanitized origin', async () => {
    const x = await setup(); let prevented = false;
    x.window.webContents.emit(event, {preventDefault() { prevented = true; }},
        'https://user-canary:password-canary@Auth.Example.test:8443/path-canary?token=query-canary#fragment-canary');
    assert.equal(prevented, true);
    assert.deepEqual(x.messages, ['LOGIN_REDIRECT_REQUIRES_REVIEW origin: https://auth.example.test:8443']);
    assert.deepEqual([...x.authOrigins], ['https://nas.example.test', 'https://media.example.test']);
    assert.equal(/canary/.test(JSON.stringify(x.messages)), false);
});

for (const event of ['will-navigate', 'will-redirect']) test(event + ' reads details.url when the deprecated URL argument is absent', async () => {
    const x = await setup(); let denied = 0;
    x.window.webContents.emit(event, {url: 'https://user:password@auth.example.test/path?token=secret#fragment', preventDefault() { denied++; }});
    assert.equal(denied, 1);
    assert.deepEqual(x.messages, ['LOGIN_REDIRECT_REQUIRES_REVIEW origin: https://auth.example.test']);
    x.window.webContents.emit(event, {url: 'https://nas.example.test/normal', preventDefault() { denied++; }});
    assert.equal(denied, 1);
    assert.deepEqual([...x.authOrigins], ['https://nas.example.test', 'https://media.example.test']);
});

for (const destination of ['data:text/plain,secret-canary', 'javascript:secret-canary', 'file:///secret-canary',
    'blob:https://auth.example.test/secret-canary', 'invalid secret-canary']) {
    test('opaque or malformed redirect never exposes its payload: ' + destination.split(':', 1)[0].split(' ', 1)[0], async () => {
        const x = await setup(); let prevented = false;
        x.window.webContents.emit('will-redirect', {preventDefault() { prevented = true; }}, destination);
        assert.equal(prevented, true);
        assert.deepEqual(x.messages, ['LOGIN_REDIRECT_REQUIRES_REVIEW origin: ' + (destination.startsWith('invalid ') ? 'UNPARSEABLE_ORIGIN' : 'NON_HTTP_ORIGIN')]);
    });
}

test('a permitted navigation stays permitted; a popup still stays denied even on a permitted origin', async () => {
    const x = await setup(); let prevented = false;
    x.window.webContents.emit('will-redirect', {preventDefault() { prevented = true; }}, 'https://nas.example.test/secret-path?token=secret-query');
    assert.equal(prevented, false); assert.deepEqual(x.messages, []);
    assert.deepEqual(x.window.popup({url: 'https://user:password@nas.example.test/path?token=secret#fragment'}), {action: 'deny'});
    assert.deepEqual(x.messages, ['LOGIN_POPUP_REQUIRES_REVIEW origin: https://nas.example.test']);
});

test('a failed load after a blocked redirect cannot overwrite the origin notice', async () => {
    const rejectors = [];
    const x = await setup(() => new Promise((_resolve, reject) => rejectors.push(reject)));
    x.window.webContents.emit('will-redirect', {preventDefault() {}}, 'https://auth.example.test/secret?token=secret');
    rejectors[0](new Error('private-load-error-canary'));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(x.messages, ['LOGIN_REDIRECT_REQUIRES_REVIEW origin: https://auth.example.test']);
    x.handle.showTarget(); rejectors[1](new Error('private-load-error-canary'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(x.messages.at(-1), 'TARGET_PAGE_LOAD_FAILED');
    assert.equal(JSON.stringify(x.messages).includes('canary'), false);
});

for (const event of ['will-navigate', 'will-redirect']) test(event + ' allows same-origin main/subframe URLs, default HTTPS port and SPA fragments', async () => {
    const x = await setup(); let denied = 0;
    for (const isMainFrame of [true, false]) {
        const value = 'https://MEDIA.EXAMPLE.TEST:443/web/index.html?version=synthetic#!/login';
        x.window.webContents.emit(event, {url: value, isMainFrame, preventDefault() { denied++; }});
        x.window.webContents.emit(event, {url: value, isMainFrame, preventDefault() { denied++; }}, value);
        // A non-string deprecated argument must not shadow details.url.
        x.window.webContents.emit(event, {url: value, isMainFrame, preventDefault() { denied++; }}, false);
    }
    assert.equal(denied, 0); assert.deepEqual(x.messages, []);
    for (const name of ['will-frame-navigate', 'did-start-navigation', 'did-navigate-in-page']) assert.equal(x.window.webContents.listenerCount(name), 0);
});

test('a redirected child frame on an unapproved origin remains blocked without changing same-origin rules', async () => {
    const x = await setup(); let denied = false;
    x.window.webContents.emit('will-redirect', {url: 'https://unapproved.example.test/path?token=private-canary',
        isMainFrame: false, preventDefault() { denied = true; }});
    assert.equal(denied, true);
    assert.deepEqual(x.messages, ['LOGIN_REDIRECT_REQUIRES_REVIEW origin: https://unapproved.example.test']);
    assert.equal(JSON.stringify(x.messages).includes('private-canary'), false);
});

test('browser compatibility changes only this webContents UA and keeps its Chromium version', async () => {
    const x = await setup();
    assert.deepEqual(x.window.agents, ['Mozilla/5.0 Chrome/144.0.0.0 Safari/537.36']);
    assert.deepEqual([...x.authOrigins], ['https://nas.example.test', 'https://media.example.test']);
});
for (const agent of ['Mozilla/5.0 Chrome/144.0.0.0 Safari/537.36', 'UnknownClient Electron/44.4.2']) {
    test('already-normal or unmatched-engine UA is left unchanged: ' + (agent.includes('Chrome') ? 'normal' : 'unknown'), async () => {
        const x = await setup(undefined, agent); assert.deepEqual(x.window.agents, []);
    });
}
