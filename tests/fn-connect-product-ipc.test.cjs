'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const {register, CHANNEL, CANCEL, IDENTITY, safeNotice} = require('../src/electronapp/enhanced/fn-connect/ipc.cjs');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {resolve, promise}; };
test('auth-origin review notice never includes a path, query, credentials or non-HTTP payload', () => {
    assert.deepEqual(safeNotice('LOGIN_REDIRECT_REQUIRES_REVIEW origin: https://auth.example.test'), {code: 'LOGIN_REDIRECT_REQUIRES_REVIEW', origin: 'https://auth.example.test'});
    for (const value of ['https://auth.example.test/path?token=PRIVATE', 'https://user:password@auth.example.test', 'data:PRIVATE']) {
        assert.equal(safeNotice('LOGIN_REDIRECT_REQUIRES_REVIEW origin: ' + value), null);
    }
});
function mainFixture() {
    const ipcMain = new EventEmitter(), handlers = new Map(), calls = [];
    ipcMain.handle = (name, fn) => handlers.set(name, fn); ipcMain.removeHandler = name => handlers.delete(name);
    const contents = new EventEmitter(); contents.mainFrame = {url: pathToFileURL(path.resolve('src/electronapp/www/index.html')).href};
    const event = {sender: contents, senderFrame: contents.mainFrame};
    const service = new Proxy({}, {get(_object, operation) { return (...args) => { calls.push({operation, args});
        if (operation === 'verify') throw Object.assign(new Error('PRIVATE_CANARY'), {code: 'PRIVATE_CANARY'});
        return operation === 'capabilities' ? {enabled: true} : Promise.resolve({});
    }; }});
    const stop = register({ipcMain, getWebContents: () => contents, service});
    return {ipcMain, handlers, calls, contents, event, stop};
}
test('production FN IPC refuses foreign/subframe/remote senders before any service action', async () => {
    const f = mainFixture(), call = f.handlers.get(CHANNEL);
    assert.equal((await call({sender: {}, senderFrame: f.contents.mainFrame}, {operation: 'open'})).reason, 'untrusted_sender');
    assert.equal((await call({...f.event, senderFrame: {url: f.contents.mainFrame.url}}, {operation: 'open'})).reason, 'untrusted_sender');
    f.contents.mainFrame.url = 'https://remote.example.test/';
    assert.equal((await call(f.event, {operation: 'open'})).reason, 'untrusted_sender'); assert.equal(f.calls.length, 0);
    await f.stop();
});
test('trusted IPC exposes fixed failure only and main navigation/crash retires all old identities', async () => {
    const f = mainFixture(), call = f.handlers.get(CHANNEL);
    assert.equal((await call(f.event, {operation: 'verify'})).reason, 'FN_CONNECT_FAILED');
    assert.doesNotMatch(JSON.stringify(await call(f.event, {operation: 'verify'})), /PRIVATE_CANARY/);
    for (const event of ['render-process-gone', 'destroyed']) f.contents.emit(event);
    f.contents.emit('did-start-navigation', {isMainFrame: true, isSameDocument: true});
    f.contents.emit('did-start-navigation', {isMainFrame: true, isSameDocument: false});
    assert.equal(f.calls.filter(c => c.operation === 'documentRetired').length, 3);
    f.ipcMain.emit(CANCEL, f.event, {requestId: 2});
    f.ipcMain.emit(IDENTITY, f.event, null);
    assert(f.calls.some(c => c.operation === 'cancel' && c.args[0] === 2));
    await f.stop(); assert.equal(f.handlers.size, 0);
    assert.equal(f.contents.listenerCount('destroyed'), 0); assert.equal(f.ipcMain.listenerCount(CANCEL), 0);
});
function rendererFixture(handler) {
    let module, current = {serverId: 's', accountId: 'a', serverAddress: 'https://media.example.test/', token: 'synthetic-a'};
    const listeners = new Map(), windowEvents = new Map(), calls = [], sent = [];
    const api = {serverId: () => current.serverId, getCurrentUserId: () => current.accountId,
        serverAddress: () => current.serverAddress, accessToken: () => current.token};
    const connection = {currentApiClient: () => current.accountId ? api : null};
    const events = {on(_target, event, callback) { listeners.set(event, callback); }, off(_target, event) { listeners.delete(event); }};
    const ipc = {invoke(channel, value) { calls.push(value); return Promise.resolve(value.operation === 'route' ? {
        status: 'ok', id: value.id, remoteBase: 'https://media.example.test/', apiBase: 'http://127.0.0.1:12345/a/' + (value.id === 'b' ? 'b' : 'a').repeat(48) + '/'
    } : handler(value)); },
        send(channel, value) { sent.push({channel, value}); }};
    const window = {ipc, addEventListener(event, fn) { windowEvents.set(event, fn); }};
    vm.runInNewContext(fs.readFileSync('src/electronapp/enhanced/fn-connect/renderer.js', 'utf8'), {
        define(_names, factory) { module = factory(connection, events); },
        window, Set, URL, AbortController
    });
    return {module, api, calls, sent, transport: window.__eteFnTransport, snapshot: () => ({...current}), pulse() { listeners.get('credentialsupdated')(); },
        switchUser(accountId) { current = {...current, accountId}; listeners.get('credentialsupdated')(); },
        signedInLater(accountId) { listeners.get('credentialsupdated')(); current = {...current, accountId}; listeners.get('localusersignedin')(); },
        unload() { windowEvents.get('unload')(); }};
}
const lease = {status: 'ok', matched: true, leaseId: 'a'.repeat(48), url: 'http://127.0.0.1:12345/r/' + 'b'.repeat(48)};
test('disabled client never sends source, auth context or connection data to a service', async () => {
    const f = rendererFixture(() => ({status: 'ok', enabled: false}));
    assert.equal(await f.module.source(f.api, 'https://media.example.test/a', new AbortController().signal), null);
    assert.deepEqual(f.calls.map(v => v.operation), ['capabilities']);
});
test('a late source after Stop is released; it never reaches the Native adapter', async () => {
    const gate = deferred();
    const f = rendererFixture(value => value.operation === 'capabilities' ? {status: 'ok', enabled: true} : value.operation === 'source' ? gate.promise : {status: 'ok'});
    await f.module.route('profile');
    const cancel = new AbortController(), pending = f.module.source(f.api, 'https://media.example.test/a', cancel.signal);
    const rejected = assert.rejects(pending, error => error.name === 'AbortError');
    await new Promise(resolve => setImmediate(resolve)); cancel.abort(); gate.resolve(lease); await rejected;
    assert.equal(f.sent.filter(v => v.channel === CANCEL).length, 1);
    assert.equal(f.calls.filter(v => v.operation === 'release').length, 1);
});
test('credential change and document unload retire Native capability; duplicate identity event does not', async () => {
    const f = rendererFixture(value => value.operation === 'capabilities' ? {status: 'ok', enabled: true} : value.operation === 'source' ? lease : {status: 'ok'});
    await f.module.route('profile');
    f.pulse();
    await f.module.source(f.api, 'https://media.example.test/a', new AbortController().signal);
    f.pulse(); assert.equal(f.sent.filter(v => v.channel === CANCEL).length, 0);
    f.switchUser('b'); assert.equal(f.sent.filter(v => v.channel === CANCEL).length, 1);
    f.unload(); assert.equal(f.sent.at(-1).channel, IDENTITY); assert.equal(f.sent.at(-1).value, null);
});
test('client refuses a direct external URL masquerading as a local lease', async () => {
    const f = rendererFixture(value => value.operation === 'capabilities' ? {status: 'ok', enabled: true} : {...lease, url: 'https://external.example.test/video'});
    await f.module.route('profile');
    await assert.rejects(f.module.source(f.api, 'https://media.example.test/a', new AbortController().signal), /FN_SOURCE_INVALID/);
    assert.equal(f.sent.filter(v => v.channel === CANCEL).length, 1);
});
test('already signed-in module needs no initial pulse for the first logout to revoke playback', async () => {
    const f = rendererFixture(value => value.operation === 'capabilities' ? {status: 'ok', enabled: true} : value.operation === 'source' ? lease : {status: 'ok'});
    await f.module.route('profile');
    await f.module.source(f.api, 'https://media.example.test/a', new AbortController().signal);
    f.switchUser(null); assert.equal(f.sent.filter(v => v.channel === CANCEL).length, 1);
});
test('existing-server sign-in after the credentials event still retires the previous source', async () => {
    const f = rendererFixture(value => value.operation === 'capabilities' ? {status: 'ok', enabled: true} : value.operation === 'source' ? lease : {status: 'ok'});
    await f.module.route('profile');
    await f.module.source(f.api, 'https://media.example.test/a', new AbortController().signal);
    f.signedInLater('b'); assert.equal(f.sent.filter(v => v.channel === CANCEL).length, 1);
});
test('adding a same-origin profile never remaps the old account background request into its new Session', async () => {
    const f = rendererFixture(() => ({status: 'ok', enabled: true})); await f.module.available();
    const a = await f.module.route('a'); await f.module.bind('a', f.api); const ownerA = f.snapshot();
    const b = await f.module.route('b'), url = 'https://media.example.test/emby/System/Info';
    assert.equal(f.transport.mapUrl(url, ownerA), a.apiBase + 'emby/System/Info');
    assert.equal(f.transport.mapUrl(url), b.apiBase + 'emby/System/Info');
    await f.transport.authenticated(b.apiBase + 'emby/Users/AuthenticateByName', {ServerId: 's', User: {Id: 'b'}, AccessToken: 'synthetic-b'});
    assert.equal(f.transport.mapUrl(url, ownerA), a.apiBase + 'emby/System/Info');
    assert.equal(f.transport.mapUrl(url, {...ownerA, accountId: 'b', token: 'synthetic-b', serverAddress: 'https://media.example.test'}), b.apiBase + 'emby/System/Info');
    assert.equal(f.calls.filter(v => v.operation === 'switch').at(-1).id, 'b');
});
test('new authentication JSON waits for retirement acknowledgement before its new route ownership is accepted', async () => {
    const gate = deferred(), f = rendererFixture(v => v.operation === 'switch' ? gate.promise : {status: 'ok', enabled: true});
    await f.module.available(); const b = await f.module.route('b'); let done = false;
    const pending = f.transport.authenticated(b.apiBase + 'emby/Users/AuthenticateByName', {ServerId: 's', User: {Id: 'b'}, AccessToken: 'synthetic-b'}).then(() => { done = true; });
    await new Promise(resolve => setImmediate(resolve)); assert.equal(done, false);
    gate.resolve({status: 'ok'}); await pending; assert.equal(done, true);
    assert.deepEqual(f.calls.filter(v => ['switch', 'bind'].includes(v.operation)).map(v => v.operation), ['switch', 'bind']);
});

test('Native lease release returns one shared main acknowledgement for route retirement', async () => {
    const gate = deferred();
    const f = rendererFixture(value => value.operation === 'capabilities' ? {status: 'ok', enabled: true} :
        value.operation === 'source' ? lease : value.operation === 'release' ? gate.promise : {status: 'ok'});
    await f.module.route('profile');
    const source = await f.module.source(f.api, 'https://media.example.test/a', new AbortController().signal);
    let settled = false;
    const first = source.release(), second = source.release();
    assert.equal(first, second);
    first.then(() => {settled = true;}); await Promise.resolve();
    assert.equal(settled, false);
    assert.equal(f.calls.filter(value => value.operation === 'release').length, 1);
    gate.resolve({status: 'ok'}); await first;
    assert.equal(settled, true);
});

for (const duringRelease of [false, true]) test('real renderer account retirement cancels Native startup without old-account fallback: ' + duringRelease, async () => {
    const {startupFixture, makeDeferred, waitFor} = require('./helpers/startup-route-fixture.cjs');
    const gate = makeDeferred();
    const r = rendererFixture(value => value.operation === 'capabilities' ? {status: 'ok', enabled: true} :
        value.operation === 'source' ? lease : value.operation === 'release' && duringRelease ? gate.promise : {status: 'ok'});
    await r.module.route('profile');
    const f = startupFixture(undefined, {available: () => r.module.available(), source: (_api, url, signal) => r.module.source(r.api, url, signal)});
    Object.assign(f.config.rules[0], {strategy: 'custom', order: ['native', 'direct-url', 'cd2-http', 'mount']});
    f.options.url = 'https://media.example.test/native';
    const play = f.player.play(f.options); play.catch(() => {});
    try {
        await waitFor(() => f.ipc.loadCalls.length === 1);
        if (duringRelease) { f.failure(); await waitFor(() => r.calls.some(v => v.operation === 'release')); }
        r.switchUser('other-account'); gate.resolve({status: 'ok'});
        if (!duringRelease) f.failure();
        await assert.rejects(play, e => e.playbackSuperseded === true);
        assert.equal(f.ipc.loadCalls.length, 1); assert.equal(f.resolves.length, 0);
    } finally {gate.resolve({status: 'ok'}); await f.player.stop(true);}
});

test('load failure notice carries only an allowlisted error code, never raw diagnostic text', () => {
    assert.deepEqual(safeNotice('LOGIN_PAGE_LOAD_FAILED', {errorCode: 'ERR_CONNECTION_RESET'}), {code: 'LOGIN_PAGE_LOAD_FAILED', origin: null, errorCode: 'ERR_CONNECTION_RESET'});
    const result = safeNotice('LOGIN_PAGE_LOAD_FAILED', {errorCode: 'https://private.example/path?token=PRIVATE', message: 'PRIVATE'});
    assert.deepEqual(result, {code: 'LOGIN_PAGE_LOAD_FAILED', origin: null, errorCode: 'OTHER'});
});

test('notice profile binding is finite and malformed binding metadata is omitted', () => {
    assert.deepEqual(safeNotice('LOGIN_PAGE_LOAD_FAILED', {profileId: 'a'.repeat(36), errorCode: 'ERR_ABORTED'}),
        {code: 'LOGIN_PAGE_LOAD_FAILED', origin: null, errorCode: 'ERR_ABORTED', profileId: 'a'.repeat(36)});
    assert.deepEqual(safeNotice('LOGIN_PAGE_LOAD_FAILED', {profileId: 'private-url?token=PRIVATE', errorCode: 'ERR_FAILED'}),
        {code: 'LOGIN_PAGE_LOAD_FAILED', origin: null, errorCode: 'ERR_FAILED'});
});
