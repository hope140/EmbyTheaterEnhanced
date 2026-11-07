'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {EventEmitter} = require('node:events');
const {createElectronIO} = require('../prototypes/fn-connect/client/electron-io.cjs');

async function setup(load = () => Promise.resolve(), agent = 'Mozilla/5.0 Chrome/144.0.0.0 Electron/44.4.2 Safari/537.36', options = {}) {
    let window;
    class Window extends EventEmitter {
        constructor() {
            super(); window = this;
            this.webContents = new EventEmitter();
            this.webContents.id = 7;
            this.agents = []; this.destroyed = false; this.stops = 0;
            this.setTitle = value => {this.title = value;};
            this.webContents.stop = () => { this.stops++; };
            this.webContents.getUserAgent = () => agent;
            this.webContents.setUserAgent = value => this.agents.push(value);
            this.webContents.setWindowOpenHandler = handler => { this.popup = handler; };
        }
        loadURL(value) { return load(value); }
        isDestroyed() { return this.destroyed; }
        destroy() { this.destroyed = true; this.emit('closed'); }
    }
    const messages = [], diagnostics = [], authOrigins = new Set(['https://nas.example.test', 'https://media.example.test']);
    const io = createElectronIO({BrowserWindow: Window}, {onStatus: (value, detail) => {messages.push(value); diagnostics.push(detail);}, ...options});
    let gate, cancelled = 0;
    const handle = await io.openLogin({webRequest: {onBeforeRequest(_filter, fn) { gate = fn; }}}, {bootstrap: new URL('https://nas.example.test/'),
        emby: new URL('https://media.example.test/'), authOrigins}, {signal: new AbortController().signal, onCancel() {cancelled++;}});
    return {window, messages, authOrigins, handle, gate, diagnostics, cancelled: () => cancelled};
}
test('production auth-only window cannot become an Emby login or load its subresources; main API requests stay separate', async () => {
    const x = await setup(undefined, undefined, {authenticationOnly: true}); let prevented = false;
    x.window.webContents.emit('will-navigate', {preventDefault() { prevented = true; }}, 'https://media.example.test/web/index.html');
    assert.equal(prevented, true);
    for (const [webContentsId, url, expected] of [[7, 'https://media.example.test/api', true],
        [-1, 'https://media.example.test/api', false], [7, 'https://nas.example.test/api', false]]) {
        x.gate({webContentsId, url}, value => assert.equal(value.cancel, expected));
    }
});

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

for (const event of ['will-navigate', 'will-redirect']) test('auth-only rejected main navigation stops navigation without retiring a possibly authenticated Session: ' + event, async () => {
    const x = await setup(undefined, undefined, {authenticationOnly: true}); let denied = false;
    x.window.webContents.emit(event, {isMainFrame: true, preventDefault() {denied = true;}}, 'https://unapproved.example.test/private?token=private');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(denied, true); assert.equal(x.window.destroyed, false); assert.equal(x.window.stops, 1); assert.equal(x.cancelled(), 0);
    assert.match(x.window.title, /跳转已停止/);
    assert.deepEqual(x.messages, ['LOGIN_REDIRECT_REQUIRES_REVIEW origin: https://unapproved.example.test']);
    assert.deepEqual([...x.authOrigins], ['https://nas.example.test', 'https://media.example.test']);
});
test('auth-only failed initial load stops its window and reports only a fixed error enum', async () => {
    const x = await setup(() => Promise.reject(Object.assign(new Error('private-path?token=private'), {code: 'ERR_CONNECTION_RESET'})), undefined, {authenticationOnly: true});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(x.window.destroyed, false); assert.equal(x.cancelled(), 0); assert.match(x.window.title, /入口加载失败/);
    assert.deepEqual(x.messages, ['LOGIN_PAGE_LOAD_FAILED']);
    assert.deepEqual(x.diagnostics, [{errorCode: 'ERR_CONNECTION_RESET'}]);
});
test('an auth-only denied child redirect does not cancel the working top-level page', async () => {
    const x = await setup(undefined, undefined, {authenticationOnly: true}); let denied = false;
    x.window.webContents.emit('will-redirect', {isMainFrame: false, preventDefault() {denied = true;}}, 'https://unapproved.example.test/frame');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(denied, true); assert.equal(x.window.destroyed, false); assert.equal(x.cancelled(), 0);
});

test('closed old auth window cannot replace a new window notice with a late load error', async () => {
    let reject;
    const x = await setup(() => new Promise((_resolve, no) => {reject = no;}), undefined, {authenticationOnly: true});
    x.window.destroy(); reject(Object.assign(new Error('private-url'), {code: 'ERR_ABORTED'}));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(x.messages, []); assert.equal(x.cancelled(), 1);
});
test('controller cancellation creates a distinct Session on manual restart; ready-window close preserves the live profile', async () => {
    const {createController} = require('../src/electronapp/enhanced/fn-connect/core/controller.cjs');
    const {Readable} = require('node:stream');
    const sessions = [], windows = [], cleared = [];
    const controller = createController({enabled: true, io: {
        createSession(id) {const session = {id}; sessions.push(session); return session;},
        async openLogin(session, _config, options) {windows.push({session, cancel: options.onCancel}); return {close() {}};},
        async clearSession(session) {cleared.push(session);}, cookieValues: async () => [],
        async request() {return {statusCode: 200, headers: {'content-type': 'application/json'}, body: Readable.from([Buffer.from(JSON.stringify({Id: 'synthetic', Version: '1.0'}))])};}
    }});
    const config = {bootstrapUrl: 'https://nas.example.test/', embyUrl: 'https://media.example.test/'};
    try {
        const first = controller.add(config); await controller.start(first); windows[0].cancel();
        await new Promise(resolve => setImmediate(resolve));
        assert.throws(() => controller.snapshot(first), e => e.code === 'PROFILE_CLOSED');
        const second = controller.add(config); await controller.start(second);
        assert.notEqual(first, second); assert.notEqual(sessions[0], sessions[1]);
        await controller.verify(second); windows[1].cancel();
        assert.equal(controller.snapshot(second).state, 'ready'); assert.equal(cleared.length, 1);
    } finally {await controller.closeAll();}
});
