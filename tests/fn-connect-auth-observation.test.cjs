'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {createElectronIO} = require('../src/electronapp/enhanced/fn-connect/core/electron-io.cjs');
const {normalizeAuthObservation} = require('../src/electronapp/enhanced/fn-connect/core/auth-observation.cjs');
const {errorCode} = require('../src/electronapp/enhanced/fn-connect/core/diagnostics.cjs');
const profile = {bootstrap: new URL('https://entry.example.test/device'), emby: new URL('https://media.example.test/'),
    authOrigins: new Set(['https://entry.example.test', 'https://nas.example.test', 'https://media.example.test'])};
function fixture(callback) {
    const windows = [], records = [], hooks = {}, registrations = {}, permissions = {};
    const ses = {webRequest: {}, getUserAgent: () => 'Chrome/152.0.0.0 Electron/44.5.0',
        setPermissionRequestHandler(fn) {permissions.request = fn;}, setPermissionCheckHandler(fn) {permissions.check = fn;},
        cookies: {get() {throw new Error('must not read cookies');}}, resolveProxy() {throw new Error('must not resolve proxy');},
        async closeAllConnections() {}, async clearStorageData() {}};
    for (const key of ['onBeforeRequest', 'onErrorOccurred', 'onResponseStarted', 'onBeforeSendHeaders', 'onHeadersReceived']) {
        ses.webRequest[key] = (_filter, fn) => {hooks[key] = fn; registrations[key] = (registrations[key] || 0) + 1;};
    }
    class Window extends EventEmitter {
        constructor() {
            super(); windows.push(this); this.destroyed = false; this.stops = 0;
            this.webContents = new EventEmitter(); this.webContents.id = windows.length;
            let agent = ses.getUserAgent();
            this.webContents.getUserAgent = () => agent; this.webContents.setUserAgent = v => {agent = v;};
            this.webContents.setWindowOpenHandler = () => {}; this.webContents.stop = () => this.stops++;
        }
        loadURL() {return Promise.resolve();} setTitle(value) {this.title = value;}
        isDestroyed() {return this.destroyed;} destroy() {this.destroyed = true; this.emit('closed');}
    }
    const electron = {BrowserWindow: Window, session: {fromPartition: () => ses}};
    const io = createElectronIO(electron, {
        authenticationOnly: true, onDiagnostic(value) {records.push(value); callback?.(value);}});
    const session = io.createSession('a'.repeat(36));
    const start = () => io.openLogin(session, profile, {signal: new AbortController().signal, onCancel() {}});
    return {io, electron, ses, windows, records, hooks, registrations, permissions, start,
        authRecords: () => records.filter(v => normalizeAuthObservation(v))};
}
const details = (url, resourceType = 'xhr', webContentsId = 1) => ({url, resourceType, webContentsId});
test('product auth observers preserve the single request gate, fixed permission refusal and window-only UA change', async () => {
    const x = fixture(); await x.start();
    assert.equal(x.registrations.onBeforeRequest, 1); assert.equal(x.registrations.onBeforeSendHeaders, undefined);
    assert.equal(x.registrations.onHeadersReceived, undefined);
    assert.deepEqual(x.authRecords()[0], {event: 'UA_OBSERVATION', authSession: 1, generation: 1, sequence: 1,
        sourceClass: 'OTHER', capped: false, browserHasElectron: false, agentMatchesSession: false});
    for (const permission of ['local-network', 'local-network-access', 'loopback-network', 'storage-access', 'top-level-storage-access', 'private-permission-canary']) {
        const contents = x.windows[0].webContents;
        assert.equal(x.permissions.check(contents, permission, 'https://nas.example.test'), false);
        let allowed;
        x.permissions.request(contents, permission, value => {allowed = value;}, {requestingUrl: 'https://entry.example.test/private?token=canary'});
        assert.equal(allowed, false);
    }
    assert.deepEqual([...new Set(x.authRecords().filter(v => v.event === 'PERMISSION_CHECK').map(v => v.permission))],
        ['local-network', 'local-network-access', 'loopback-network', 'storage-access', 'top-level-storage-access', 'OTHER']);
    assert.equal(x.authRecords().filter(v => v.event === 'PERMISSION_REQUEST').every(v => v.decision === 'BLOCK' && v.sourceClass === 'BOOTSTRAP'), true);
    assert.doesNotMatch(JSON.stringify(x.records), /canary|https:|Chrome|Electron\//);
});
test('HTTP, request cancellation, subframe navigation and net errors retain only finite classifications', async () => {
    const x = fixture(); await x.start();
    x.hooks.onBeforeRequest(details('https://media.example.test/private?token=canary'), v => assert.equal(v.cancel, true));
    x.hooks.onBeforeRequest(details('malformed-canary'), v => assert.equal(v.cancel, true));
    x.hooks.onBeforeRequest(details('https://nas.example.test/private'), v => assert.equal(v.cancel, false));
    x.hooks.onErrorOccurred({...details('https://nas.example.test/secret'), error: 'net::ERR_LOCAL_NETWORK_PERMISSION_MISSING'});
    x.hooks.onErrorOccurred({...details('https://unknown.example.test/secret'), error: 'net::ERR_FAILED private-canary'});
    x.hooks.onResponseStarted({...details('https://entry.example.test/private?token=canary', 'mainFrame'), statusCode: 200,
        responseHeaders: {'Content-Type': ['text/html; private-canary'], 'Set-Cookie': ['private-canary']}});
    x.hooks.onResponseStarted({...details('https://media.example.test/private', 'xhr'), statusCode: 403, responseHeaders: {'content-type': 'application/json'}});
    for (let i = 0; i < 6; i++) x.hooks.onResponseStarted({...details('https://nas.example.test/private'), statusCode: 200, responseHeaders: {'content-type': 'application/octet-stream'}});
    let denied = false;
    x.windows[0].webContents.emit('will-redirect', {url: 'https://unknown.example.test/private?token=canary', isMainFrame: false, preventDefault() {denied = true;}});
    x.windows[0].webContents.emit('did-fail-load', {}, -1, 'net::ERR_NETWORK_ACCESS_DENIED', 'https://nas.example.test/private?token=canary', false);
    assert.equal(denied, true);
    const records = x.authRecords();
    assert.equal(records.some(v => v.event === 'AUTH_EMBY_BLOCKED' && v.sourceClass === 'EMBY' && v.reason === 'EMBY_ROLE'), true);
    assert.equal(records.some(v => v.event === 'AUTH_REQUEST_BLOCKED' && v.reason === 'INVALID_URL'), true);
    assert.equal(records.some(v => v.errorCode === 'ERR_LOCAL_NETWORK_PERMISSION_MISSING'), true);
    assert.equal(records.some(v => v.event === 'RESOURCE_ERROR' && v.errorCode === 'OTHER'), true);
    assert.equal(records.some(v => v.status === 200 && v.mimeClass === 'HTML' && v.sourceClass === 'BOOTSTRAP'), true);
    assert.equal(records.some(v => v.status === 403 && v.mimeClass === 'JSON' && v.sourceClass === 'EMBY'), true);
    assert.equal(records.filter(v => v.status === 200 && v.mimeClass === 'BYTES').length, 4);
    assert.equal(records.some(v => v.event === 'NAVIGATION_BLOCKED' && v.frameClass === 'SUBFRAME'), true);
    assert.equal(records.some(v => v.event === 'PAGE_LOAD_FAILED' && v.errorCode === 'ERR_NETWORK_ACCESS_DENIED' && v.frameClass === 'SUBFRAME'), true);
    assert.doesNotMatch(JSON.stringify(records), /canary|https:|private|secret|Cookie|token/);
});
test('cap is per generation, old callbacks and foreign contents cannot leak into a new Session round', async () => {
    const x = fixture(); const first = await x.start(); const oldError = x.hooks.onErrorOccurred;
    for (let i = 0; i < 50; i++) x.hooks.onErrorOccurred({...details('https://entry.example.test/'), error: 'net::ERR_FAILED'});
    assert.equal(x.authRecords().length, 32); assert.equal(x.authRecords().at(-1).capped, true);
    await first.close(); await x.start();
    const count = x.authRecords().length;
    oldError({...details('https://entry.example.test/'), error: 'net::ERR_FAILED'});
    x.hooks.onErrorOccurred({...details('https://entry.example.test/', 'xhr', 1), error: 'net::ERR_FAILED'});
    x.permissions.check({id: 1}, 'local-network', 'https://entry.example.test');
    assert.equal(x.authRecords().length, count);
    x.hooks.onErrorOccurred({...details('https://nas.example.test/', 'webSocket', 2), error: 'net::ERR_CONNECTION_RESET'});
    assert.equal(x.authRecords().at(-1).generation, 2); assert.equal(x.authRecords().at(-1).sequence, 2);
});
test('diagnostic failure never relaxes permission or origin decisions and closing stops all later observations', async () => {
    const x = fixture(() => {throw new Error('private-canary');}); const handle = await x.start();
    x.permissions.request(x.windows[0].webContents, 'local-network', allowed => assert.equal(allowed, false), {});
    x.hooks.onBeforeRequest(details('https://media.example.test/'), value => assert.equal(value.cancel, true));
    await handle.close(); const count = x.authRecords().length;
    x.windows[0].webContents.emit('did-fail-load', {}, -1, 'net::ERR_FAILED', 'https://entry.example.test/', true);
    assert.equal(x.authRecords().length, count);
});
test('safe diagnostic normalizer rejects unknown events, invalid binding and secret-bearing error strings', () => {
    const input = {event: 'RESOURCE_ERROR', authSession: 1, generation: 1, sequence: 1};
    assert.equal(normalizeAuthObservation({...input, event: 'private-canary'}), null);
    assert.equal(normalizeAuthObservation({...input, sequence: 33}), null);
    assert.equal(normalizeAuthObservation({...input, authSession: 'private-canary'}), null);
    const safe = normalizeAuthObservation({...input, url: 'private-canary', errorCode: 'ERR_FAILED private-canary',
        sourceClass: 'private-canary', permission: 'private-canary', resourceType: 'private-canary'});
    assert.deepEqual(safe, {...input, errorCode: 'OTHER', permission: 'OTHER', resourceType: 'other'});
    for (const name of ['ERR_LOCAL_NETWORK_PERMISSION_MISSING', 'ERR_NETWORK_ACCESS_DENIED', 'ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS']) {
        assert.equal(errorCode({message: 'net::' + name}), name);
        assert.equal(errorCode({message: 'net::' + name + ' private-canary'}), 'OTHER');
    }
});
test('authenticated-but-unverified Emby navigation stays denied without cancelling the Session needed for verification', async () => {
    const {Readable} = require('node:stream');
    const {createController} = require('../src/electronapp/enhanced/fn-connect/core/controller.cjs');
    const x = fixture(); let cleared = 0;
    x.io.cookieValues = async () => [];
    x.io.request = async () => ({statusCode: 200, headers: {'content-type': 'application/json'},
        body: Readable.from([Buffer.from('{"Id":"synthetic","Version":"1.0"}')])});
    x.io.clearSession = async () => {cleared++;};
    const controller = createController({enabled: true, io: x.io});
    const id = controller.add({bootstrapUrl: profile.bootstrap.href, embyUrl: profile.emby.href});
    try {
        await controller.start(id); let denied = false;
        x.windows[0].webContents.emit('will-navigate', {isMainFrame: true, preventDefault() {denied = true;}}, profile.emby.href);
        assert.equal(denied, true); assert.equal(cleared, 0); assert.equal(x.windows[0].destroyed, false);
        assert.equal(controller.snapshot(id).state, 'authorizing');
        await controller.verify(id); assert.equal(controller.snapshot(id).state, 'ready');
        x.windows[0].destroy(); await new Promise(resolve => setImmediate(resolve));
        assert.equal(controller.snapshot(id).state, 'ready'); assert.equal(cleared, 0);
    } finally {await controller.closeAll();}
    assert.equal(cleared, 1);
});
test('actual product IPC forwards bounded safe observations into the existing logger callback without new requests', async () => {
    const path = require('node:path'), {pathToFileURL} = require('node:url');
    const {register, CHANNEL} = require('../src/electronapp/enhanced/fn-connect/ipc.cjs');
    const x = fixture(), ipcMain = new EventEmitter(), handlers = new Map(), records = [];
    ipcMain.handle = (key, fn) => handlers.set(key, fn); ipcMain.removeHandler = key => handlers.delete(key);
    const contents = new EventEmitter(); contents.isDestroyed = () => false; contents.send = () => {};
    contents.mainFrame = {url: pathToFileURL(path.resolve('src/electronapp/www/index.html')).href};
    const stop = register({ipcMain, getWebContents: () => contents, electron: x.electron, enabled: true,
        onDiagnostic: record => records.push(record)});
    try {
        const opened = await handlers.get(CHANNEL)({sender: contents, senderFrame: contents.mainFrame}, {operation: 'open',
            config: {bootstrapUrl: profile.bootstrap.href, embyUrl: profile.emby.href}});
        assert.equal(opened.status, 'ok');
        x.permissions.request(x.windows[0].webContents, 'local-network', v => assert.equal(v, false), {requestingUrl: 'https://entry.example.test/private?token=canary'});
        assert.equal(records.length, 2); assert.equal(records.at(-1).event, 'PERMISSION_REQUEST');
        assert.equal(records.every(v => normalizeAuthObservation(v)), true);
        assert.doesNotMatch(JSON.stringify(records), /https:|canary|private|cookie|token/i);
    } finally {await stop();}
});
