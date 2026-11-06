'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {EventEmitter} = require('node:events');
const {Readable} = require('node:stream');
const {createProfileStore} = require('../prototypes/fn-connect/client/profile-store.cjs');
const {config} = require('../prototypes/fn-connect/client/policy.cjs');
const {createController} = require('../prototypes/fn-connect/client/controller.cjs');
const {createElectronIO} = require('../prototypes/fn-connect/client/electron-io.cjs');
const {installMediaCheck} = require('../prototypes/fn-connect/client/media-check.cjs');
const input = {bootstrapUrl: 'https://nas.example.test/', embyUrl: 'https://media.example.test/', authOrigins: ['https://auth.example.test']};
const code = expected => error => error.code === expected;
function location(t) {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'fn-profile-unit-'));
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    return path.join(parent, 'store');
}
test('listing saved logins creates no files; explicit new profiles are separate even for the same server', t => {
    const root = location(t), store = createProfileStore(root), profile = config(input, 'live');
    assert.deepEqual(store.list(profile), []); assert.equal(fs.existsSync(root), false);
    const first = store.acquire(profile), second = store.acquire(profile);
    assert.notEqual(first.profileId, second.profileId); assert.notEqual(first.path, second.path);
    assert.equal(path.isAbsolute(first.path), true);
    first.release(); second.release();
    const reopened = createProfileStore(root).acquire(profile, first.profileId);
    assert.equal(reopened.path, first.path); reopened.release();
    const registry = fs.readFileSync(path.join(root, 'profiles.json'), 'utf8');
    assert.equal(/example\.test|password|token|cookie/i.test(registry), false);
});
test('saved login binds the server and approved origin set; another origin cannot acquire its storage', t => {
    const store = createProfileStore(location(t)), p = config(input, 'live'), held = store.acquire(p);
    held.release();
    for (const changed of [{...input, embyUrl: 'https://another.example.test/'},
        {...input, authOrigins: [...input.authOrigins, 'https://another.example.test']}]) {
        assert.throws(() => store.acquire(config(changed, 'live'), held.profileId), code('PROFILE_BINDING_MISMATCH'));
        assert.deepEqual(store.list(config(changed, 'live')), []);
    }
    assert.throws(() => store.acquire(p, '../private'), code('PROFILE_ID_INVALID'));
});
test('a profile in use is never opened concurrently or unlocked automatically', t => {
    const root = location(t), store = createProfileStore(root), p = config(input, 'live'), held = store.acquire(p);
    assert.throws(() => createProfileStore(root).acquire(p, held.profileId), code('PROFILE_IN_USE'));
    assert.equal(fs.existsSync(path.join(root, 'Locks', held.profileId + '.lock')), true);
    held.release(); held.release();
    const next = store.acquire(p, held.profileId); next.release();
});
test('the stable application-local state root cannot be used by two processes at once', t => {
    const root = location(t), store = createProfileStore(root), control = store.initialize();
    assert.equal(control, path.join(root, 'Control'));
    const release = store.lockApplication();
    assert.throws(() => createProfileStore(root).lockApplication(), code('PROFILE_APPLICATION_IN_USE'));
    release(); release(); createProfileStore(root).lockApplication()();
});
test('forget removes only the selected registry entry and does not claim directory deletion', t => {
    const root = location(t), store = createProfileStore(root), p = config(input, 'live');
    const first = store.acquire(p), second = store.acquire(p);
    first.forget(); first.release(); second.release();
    assert.equal(fs.existsSync(first.path), true); assert.equal(fs.existsSync(second.path), true);
    assert.deepEqual(store.list(p).map(p => p.profileId), [second.profileId]);
    assert.throws(() => store.acquire(p, first.profileId), code('PROFILE_BINDING_MISMATCH'));
});
test('an unrelated existing directory is not adopted, overwritten or removed', t => {
    const root = location(t); fs.mkdirSync(root); fs.writeFileSync(path.join(root, 'keep'), 'synthetic');
    assert.throws(() => createProfileStore(root).acquire(config(input, 'live')));
    assert.equal(fs.readFileSync(path.join(root, 'keep'), 'utf8'), 'synthetic');
    assert.equal(fs.existsSync(path.join(root, '.owner')), false);
});
test('a redirected profile directory fails before opening Chromium storage', t => {
    const root = location(t), store = createProfileStore(root), p = config(input, 'live'), saved = store.acquire(p);
    saved.release(); fs.rmdirSync(saved.path);
    const other = path.join(path.dirname(root), 'other'); fs.mkdirSync(other);
    fs.symlinkSync(other, saved.path, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => store.acquire(p, saved.profileId), code('PROFILE_STORAGE_INVALID'));
    assert.deepEqual(fs.readdirSync(other), []);
});
test('IO uses the approved fixed path, never copies cookies, and flushes rather than clears on close', async () => {
    const order = [], hooks = {}, session = {webRequest: {onBeforeRequest(_filter, fn) { hooks.request = fn; },
        onHeadersReceived(_filter, fn) { hooks.response = fn; }},
        setPermissionRequestHandler() {}, setPermissionCheckHandler() {},
        async closeAllConnections() { order.push('connections'); }, flushStorageData() { order.push('flush-storage'); },
        cookies: {async flushStore() { order.push('flush-cookies'); }, get() { throw new Error('COOKIE_EXPORT'); }, set() { throw new Error('COOKIE_IMPORT'); }},
        async clearStorageData() { order.push('clear-storage'); }, async clearAuthCache() { order.push('clear-auth'); }, async clearCache() { order.push('clear-cache'); }};
    const seen = [];
    const io = createElectronIO({session: {fromPath(p, options) { seen.push([p, options]); return session; },
        fromPartition() { throw new Error('WRONG_SESSION'); }}});
    assert.equal(io.createSession('synthetic', {persistent: true, path: '/synthetic/owned/profile'}), session);
    assert.deepEqual(seen, [['/synthetic/owned/profile', {cache: false}]]);
    await io.preserveSession(session);
    assert.deepEqual(order, ['connections', 'flush-storage', 'flush-cookies']);
    hooks.request({}, value => assert.equal(value.cancel, true));
    order.length = 0; await io.clearSession(session);
    assert.deepEqual(order, ['connections', 'clear-storage', 'clear-auth', 'clear-cache', 'flush-storage', 'flush-cookies']);
});
test('blank replacement window does not request a login page until an explicit target action', async () => {
    const loads = []; let destroyed = false;
    class Window extends EventEmitter {
        constructor() { super(); this.webContents = new EventEmitter(); Object.assign(this.webContents,
            {getUserAgent: () => 'Chrome/144.0 Electron/44.4.2', setUserAgent() {}, setWindowOpenHandler() {}}); }
        loadURL(url) { loads.push(url); return Promise.resolve(); }
        isDestroyed() { return destroyed; }
        destroy() { destroyed = true; this.emit('closed'); }
    }
    const io = createElectronIO({BrowserWindow: Window}), session = {};
    const win = await io.openLogin(session, config(input, 'live'), {signal: new AbortController().signal, onCancel() {}, deferNavigation: true});
    assert.deepEqual(loads, []); win.showTarget(); assert.deepEqual(loads, [input.embyUrl]); await win.close();
});
function lifecycle() {
    const order = [], windows = [], timers = [], reports = [], handlers = {};
    const session = {webRequest: {}, async closeAllConnections() { order.push('connections'); }};
    for (const name of ['onBeforeRequest', 'onHeadersReceived']) session.webRequest[name] = (filter, fn) => { handlers[name] = fn; };
    let observer, rearm = 0, gate;
    const storage = {persistent: true, release() { order.push('release'); }, forget() { order.push('forget'); }};
    const io = {
        createSession: () => session, cookieValues: async () => [],
        async request() { return {statusCode: 200, headers: {'content-type': 'application/json'}, body: Readable.from([Buffer.from('{"Id":"synthetic","Version":"4.10"}')])}; },
        async openLogin(s, profile, options) {
            assert.equal(s, session);
            if (options.deferNavigation && gate) await gate;
            const win = {options, webContentsId: windows.length + 1, close() { order.push('window-closed'); options.onCancel(); }, showTarget() { order.push('target'); }};
            windows.push(win); return win;
        },
        armMediaCheck(s, profile, {onReport, webContentsId}) {
            observer = installMediaCheck(s, profile.emby.href, {onReport, ownerId: webContentsId,
                schedule(fn) { timers.push(fn); return {}; }, unschedule() {}});
        },
        prepareMediaCheck: () => observer.prepare(),
        rearmMediaCheck(s, {onReport, webContentsId}) { assert.equal(s, session); rearm++; observer.rearm(onReport, webContentsId); },
        async clearSession() { observer?.dispose(); order.push('cleared'); },
        async preserveSession() { observer?.freeze(); order.push('preserved'); }
    };
    const controller = createController({enabled: true, io});
    return {controller, storage, order, windows, timers, reports, handlers, io, rearm: () => rearm,
        gate(value) { gate = value; }, async ready() {
            const id = controller.add(input, {storage}); await controller.start(id); await controller.verify(id); return id;
        }};
}
test('normal persistent close preserves; explicit forget clears before forgetting/releasing the selected profile', async () => {
    for (const forget of [false, true]) {
        const x = lifecycle(), id = await x.ready(); await x.controller.close(id, {forget});
        assert.deepEqual(x.order, forget ? ['window-closed', 'cleared', 'forget', 'release'] : ['window-closed', 'preserved', 'release']);
    }
});
test('forget cannot join an in-flight preserve-close and falsely report that credentials were cleared', async () => {
    const x = lifecycle(), id = await x.ready();
    const close = x.controller.close(id);
    await assert.rejects(x.controller.close(id, {forget: true}), code('PROFILE_ALREADY_CLOSING'));
    await close;
    assert.equal(x.order.includes('cleared'), false);
    assert.equal(x.order.includes('forget'), false);
});
test('terminal -> prepare -> explicit reopen retains Session, has no source-gate gap and reports a new round', async () => {
    const x = lifecycle(), id = await x.ready();
    const report = value => x.reports.push(value);
    x.controller.armMediaCheck(id, {onReport: report});
    await assert.rejects(x.controller.prepareNextCheck(id), code('MEDIA_CHECK_NOT_TERMINAL'));
    assert.equal(x.windows.length, 1); assert.deepEqual(x.order, []);
    x.timers[0](); await Promise.resolve();
    await x.controller.prepareNextCheck(id);
    assert.equal(x.controller.snapshot(id).state, 'check-prepared');
    assert.equal(x.windows.length, 1); assert.equal(x.order.includes('target'), false);
    x.handlers.onBeforeRequest({url: input.embyUrl}, v => assert.equal(v.cancel, true));
    const result = await x.controller.reopenCheck(id, {onReport: report});
    assert.equal(result.roundId, 2); assert.equal(x.windows.length, 2);
    assert.equal(x.windows[1].options.deferNavigation, true); assert.equal(x.rearm(), 1);
    x.handlers.onBeforeRequest({url: input.embyUrl, webContentsId: 2}, v => assert.equal(v.cancel, false));
    x.handlers.onBeforeRequest({url: 'https://outside.example.test/opaque', webContentsId: 2}, v => assert.equal(v.cancel, true));
    const count = x.reports.length;
    for (const webContentsId of [1, undefined]) {
        x.handlers.onBeforeRequest({url: input.embyUrl, webContentsId}, v => assert.equal(v.cancel, true));
        x.handlers.onHeadersReceived({url: input.embyUrl, webContentsId, statusCode: 206, resourceType: 'media',
            responseHeaders: {'content-type': 'video/mp4', 'content-range': 'bytes 0-63/1000'}}, v => assert.equal(v.cancel, true));
    }
    assert.equal(x.reports.length, count);
    x.timers[1](); await Promise.resolve();
    assert.deepEqual(x.reports.filter(v => v.mediaCheck.event === 'terminal').map(v => v.roundId), [1, 2]);
    assert.equal(x.order.includes('cleared'), false); await x.controller.close(id);
});
test('an explicit authentication challenge during preparation cannot restore readiness or reopen a page', async () => {
    const x = lifecycle(), id = await x.ready(); x.controller.armMediaCheck(id);
    x.timers[0](); await Promise.resolve();
    let release; x.io.prepareMediaCheck = () => new Promise(resolve => { release = resolve; });
    const preparing = x.controller.prepareNextCheck(id), rejected = assert.rejects(preparing, code('CANCELLED'));
    await Promise.resolve();
    x.io.request = async () => ({statusCode: 401, headers: {'x-trim-safe-code-challenge': 'synthetic'}, body: Readable.from([])});
    await assert.rejects(x.controller.request(id, {path: 'challenge'}), code('ACCESS_CODE_REQUIRED'));
    assert.equal(x.controller.snapshot(id).state, 'needs-auth');
    release(); await rejected;
    assert.equal(x.controller.snapshot(id).state, 'needs-auth');
    assert.throws(() => x.controller.reopenCheck(id), code('MEDIA_CHECK_NOT_PREPARED'));
    assert.equal(x.windows.length, 1); await x.controller.close(id);
});
test('close during a deferred replacement owns the late window and never navigates/rearms it', async () => {
    const x = lifecycle(), id = await x.ready(); x.controller.armMediaCheck(id);
    x.timers[0](); await Promise.resolve(); await x.controller.prepareNextCheck(id);
    let release; x.gate(new Promise(resolve => { release = resolve; }));
    const reopen = x.controller.reopenCheck(id); const rejected = assert.rejects(reopen, code('CANCELLED'));
    await Promise.resolve();
    const close = x.controller.close(id); let closed = false; close.then(() => { closed = true; });
    await Promise.resolve(); assert.equal(closed, false);
    release(); await rejected; await close;
    assert.equal(x.rearm(), 0); assert.equal(x.order.includes('target'), false);
    assert.equal(x.order.filter(v => v === 'preserved').length, 1);
});
