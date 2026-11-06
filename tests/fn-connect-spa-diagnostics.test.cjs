'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const {Readable} = require('node:stream');
const {createElectronIO} = require('../prototypes/fn-connect/client/electron-io.cjs');
const {createController} = require('../prototypes/fn-connect/client/controller.cjs');
const {sanitize} = require('../prototypes/fn-connect/desktop-check/spa-safe-protocol.cjs');
const source = fs.readFileSync(path.join(__dirname, '../prototypes/fn-connect/desktop-check/spa-safe-snapshot.js'), 'utf8');
test('live page snapshot reads metadata only, sends nothing, and strips URL secrets and MIME parameters', () => {
    const document = {readyState: 'complete'};
    for (const key of ['cookie', 'body', 'documentElement']) Object.defineProperty(document, key, {get() { throw new Error('PRIVATE_DOM_READ'); }});
    const result = vm.runInNewContext(source, {URL, document, location: {origin: 'https://media.example.test'}, isSecureContext: true,
        fetch() { throw new Error('NETWORK_FORBIDDEN'); },
        performance: {getEntriesByType(type) { return type === 'resource' ? [
            {name: 'https://user-canary:password-canary@media.example.test/path-canary?token=query-canary#fragment-canary',
                initiatorType: 'script', responseStatus: 200, contentType: 'text/html;secret-canary=hidden', transferSize: 1, encodedBodySize: 2, duration: 3},
            {name: 'https://static.example.test/secret-canary', initiatorType: 'script', responseStatus: 0, transferSize: 0}
        ] : [{responseStatus: 200, domContentLoadedEventEnd: 10, loadEventEnd: 20}]; }}});
    assert.equal(result.includes('canary'), false);
    const data = JSON.parse(result.slice('FN_SPA_SAFE_SNAPSHOT '.length));
    assert.equal(data.recentResources[0].mime, 'HTML');
    assert.equal(data.recentResources[1].status, null);
    assert.equal(data.recentResources[1].source, 'OTHER_ORIGIN');
    assert.equal(data.notes.includes('NO_CONSOLE_HISTORY_READ'), true);
});
test('existing DevTools adapter never reads descriptions, console arguments, headers or bodies', () => {
    const exception = {className: 'TypeError'};
    Object.defineProperty(exception, 'description', {get() { throw new Error('PRIVATE_DESCRIPTION'); }});
    const details = {exception, url: 'https://user:password@media.example.test/private?token=secret-canary#hidden'};
    for (const key of ['text', 'stackTrace']) Object.defineProperty(details, key, {get() { throw new Error('PRIVATE_STACK'); }});
    assert.deepEqual(sanitize('Runtime.exceptionThrown', {exceptionDetails: details}),
        {event: 'SCRIPT_EXCEPTION', code: 'TypeError', origin: 'https://media.example.test'});
    const consoleEvent = {type: 'error'};
    Object.defineProperty(consoleEvent, 'args', {get() { throw new Error('PRIVATE_CONSOLE'); }});
    assert.deepEqual(sanitize('Runtime.consoleAPICalled', consoleEvent), {event: 'CONSOLE_NOTICE', code: 'ERROR_PRESENT'});
    const response = {url: details.url, status: 200, mimeType: 'text/html;secret-canary=hidden'};
    for (const key of ['headers', 'body']) Object.defineProperty(response, key, {get() { throw new Error('PRIVATE_HTTP'); }});
    const output = sanitize('Network.responseReceived', {type: 'Script', response});
    assert.equal(output.mime, 'HTML'); assert.equal(JSON.stringify(output).includes('canary'), false);
});
test('network error text is emitted only on a finite exact-code match', () => {
    assert.equal(sanitize('Network.loadingFailed', {type: 'Script', errorText: 'net::ERR_ABORTED'}).code, 'ERR_ABORTED');
    const output = sanitize('Network.loadingFailed', {type: 'secret-canary', errorText: 'private-url?token=secret-canary', blockedReason: 'secret-canary'});
    assert.equal(output.code, 'OTHER_NETWORK_FAILURE'); assert.equal(JSON.stringify(output).includes('canary'), false);
    assert.equal(sanitize('unknown', {token: 'secret-canary'}), null);
});

test('verify touches only its public-info requests without closing the web window or all session connections', async () => {
    let globalCloses = 0, windowCloses = 0, ownRequests = 0, navigations = 0;
    const session = {setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, cookies: {get: async () => []},
        webRequest: {onBeforeRequest() {}, onHeadersReceived() {}},
        async closeAllConnections() { globalCloses++; }, async clearStorageData() {}};
    class Window extends EventEmitter {
        constructor() {
            super(); this.destroyed = false; this.webContents = new EventEmitter(); this.webContents.setWindowOpenHandler = () => {};
            this.webContents.getUserAgent = () => 'Mozilla/5.0 Chrome/144.0.0.0 Safari/537.36';
            this.webContents.setUserAgent = () => { throw new Error('Unexpected UA change'); };
        }
        loadURL() { navigations++; return Promise.resolve(); }
        isDestroyed() { return this.destroyed; }
        destroy() { this.destroyed = true; windowCloses++; this.emit('closed'); }
    }
    const io = createElectronIO({session: {fromPartition: () => session}, BrowserWindow: Window, net: {request() {
        ownRequests++;
        const request = new EventEmitter(); request.setHeader = () => {};
        request.abort = () => request.emit('abort');
        request.end = () => queueMicrotask(() => {
            const response = Readable.from([Buffer.from('{"Id":"synthetic","Version":"4.10"}')]);
            Object.assign(response, {statusCode: 200, headers: {'content-type': 'application/json'}});
            request.emit('response', response);
        });
        return request;
    }}});
    const controller = createController({enabled: true, io});
    const id = controller.add({bootstrapUrl: 'https://nas.example.test/', embyUrl: 'https://media.example.test/'});
    await controller.start(id); controller.showTarget(id);
    await controller.verify(id); await controller.verify(id);
    assert.equal(ownRequests, 2); assert.equal(globalCloses, 0); assert.equal(windowCloses, 0); assert.equal(navigations, 2);
    assert.equal(controller.snapshot(id).state, 'ready');
    await controller.close(id); assert.equal(globalCloses, 1); assert.equal(windowCloses, 1);
});
