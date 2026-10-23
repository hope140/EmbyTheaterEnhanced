'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {EventEmitter} = require('node:events');
const {PassThrough} = require('node:stream');
const update = require('../src/electronapp/enhanced/manual-app-update');
const maintenance = require('../src/electronapp/enhanced/maintenance');
const ipc = require('../src/electronapp/enhanced/maintenance-ipc');
const {eventFor} = require('./helpers/trusted-renderer.cjs');

// These are inert text bytes with the production filename contract, never an EXE.
const bytes = Buffer.from('synthetic installer fixture, not executable\n');
function release(version = '0.4.1') {
    const name = 'EmbyTheaterEnhanced-' + version + '-win-x64-setup.exe';
    return {tag_name: 'v' + version, draft: false, prerelease: false,
        html_url: 'https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v' + version,
        body: '<script>inert notes</script>\n# Notes', assets: [{id: 123, state: 'uploaded', name,
            browser_download_url: 'https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v' + version + '/' + name,
            digest: 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex'), size: bytes.length}]};
}
function temp(t) {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-update-test-')));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    return root;
}
function transport(routes) {
    const calls = [];
    function get(url, options, callback) {
        calls.push({url: url.href, options});
        const route = routes[calls.length - 1] || {};
        const request = new EventEmitter();
        const response = new PassThrough();
        response.statusCode = route.status || 200;
        response.headers = route.headers || {};
        request.setTimeout = value => { request.timeout = value; };
        request.destroy = error => { response.destroy(error); request.emit('error', error); };
        const abort = () => request.destroy(Object.assign(new Error('aborted'), {code: 'ABORT_ERR'}));
        options.signal.addEventListener('abort', abort, {once: true});
        response.on('close', () => options.signal.removeEventListener('abort', abort));
        // A real https request reports failures asynchronously after listeners are installed.
        setImmediate(() => {
            if (options.signal.aborted) { abort(); return; }
            if (route.error) { response.on('error', () => {}); request.destroy(Object.assign(new Error(route.error), {code: route.error})); return; }
            callback(response);
            if (route.produce) route.produce(response, request);
            else response.end(route.body === undefined ? bytes : route.body);
        });
        return request;
    }
    return {get, calls};
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('strict SemVer precedence, large prerelease identifiers and invalid leading zeroes', () => {
    const ordered = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0'];
    ordered.slice(1).forEach((v, i) => assert.equal(maintenance.compareVersions(ordered[i], v), -1));
    assert.equal(maintenance.compareVersions('1.0.0-99999999999999999999', '1.0.0-100000000000000000000'), -1);
    assert.equal(maintenance.compareVersions('v1.2.3+build.01', '1.2.3'), 0);
    assert.equal(maintenance.compareVersions('9007199254740992.0.0', '9007199254740993.0.0'), -1);
    assert.equal(maintenance.compareVersions('2.0.0', '10.0.0'), -1);
    for (const v of ['01.2.3', '1.02.3', '1.2.03', '1.2.3-01', '1.2', '1.2.3-']) assert.equal(maintenance.parseVersion(v), null, v);
});

test('Latest is the designated stable channel; flags and exact repository tag are mandatory', async () => {
    for (const patch of [{draft: true}, {prerelease: true}, {draft: undefined}, {tag_name: 'v0.5.0-rc.1'}, {html_url: 'https://github.com/other/repo/releases/tag/v0.4.1'}]) {
        const result = await maintenance.checkLatestRelease({currentVersion: '0.4.0', requestJson: async () => ({...release(), ...patch})});
        assert.equal(result.status, 'error');
    }
    for (const [currentVersion, status] of [['0.4.0', 'update-available'], ['0.4.1', 'latest'], ['0.5.0-rc.1', 'ahead'], ['0.4.1-rc.1', 'update-available']]) {
        const result = await maintenance.checkLatestRelease({currentVersion, requestJson: async url => { assert.equal(url, update.API + 'latest'); return release(); }});
        assert.equal(result.status, status);
        assert.equal(result.notes, release().body);
        assert.equal(result.installer.sha256, release().assets[0].digest.slice(7));
    }
});

test('untrusted or ambiguous installer identity disables downloading without disguising an update', () => {
    for (const patch of [{digest: undefined}, {digest: 'md5:123'}, {size: 0}, {size: update.MAX_INSTALLER_BYTES + 1},
        {name: '../setup.exe'}, {state: 'new'}, {id: -1}, {browser_download_url: 'https://evil.example/setup.exe'}]) {
        const r = release(); Object.assign(r.assets[0], patch);
        assert.equal(update.installerFromRelease(r), null);
    }
    const r = release(); r.assets.push(r.assets[0]);
    assert.equal(update.installerFromRelease(r), null);
});

test('metadata is HTTPS, anonymous, bounded, cancellable and refuses redirects', async () => {
    const mock = transport([{body: JSON.stringify(release())}]);
    assert.equal((await update.requestJson(update.API + 'latest', {get: mock.get})).tag_name, 'v0.4.1');
    assert.deepEqual(Object.keys(mock.calls[0].options.headers).sort(), ['Accept', 'Accept-Encoding', 'User-Agent']);
    for (const target of ['http://api.github.com/repos/hope140/EmbyTheaterEnhanced/releases/latest', update.API + 'latest?token=x', 'https://evil.example/']) {
        await assert.rejects(update.requestJson(target, {get: mock.get}), /invalid-release-identity/);
    }
    const redirect = transport([{status: 302, headers: {location: 'https://evil.example/'}}]);
    await assert.rejects(update.requestJson(update.API + 'latest', {get: redirect.get}), /unsafe-redirect/);
    assert.equal(redirect.calls.length, 1);
    const large = transport([{body: Buffer.alloc(256 * 1024 + 1)}]);
    await assert.rejects(update.requestJson(update.API + 'latest', {get: large.get}), /metadata-too-large/);
    const stall = transport([{produce() {}}]);
    await assert.rejects(update.requestJson(update.API + 'latest', {get: stall.get, timeoutMs: 25}));
});

test('official redirect download verifies bytes, emits progress and commits without execution', async t => {
    const root = temp(t), asset = update.installerFromRelease(release());
    const mock = transport([{status: 302, headers: {location: 'https://release-assets.githubusercontent.com/synthetic/file?sig=public'}},
        {headers: {'content-length': String(bytes.length)}}]);
    const progress = [];
    const result = await update.downloadInstaller(asset, root, {get: mock.get, onProgress: p => progress.push(p)});
    assert.equal(result.status, 'downloaded'); assert.equal(result.source, 'github');
    assert.deepEqual(fs.readFileSync(path.join(root, asset.name)), bytes);
    if (process.platform === 'win32') assert.equal(fs.readFileSync(path.join(root, asset.name) + ':Zone.Identifier', 'utf8'), update.internetZone(asset.url));
    assert.deepEqual(fs.readdirSync(root), [asset.name]);
    assert.equal(progress.at(-1).bytes, bytes.length);
    for (const call of mock.calls) {
        assert.equal(call.options.headers.Authorization, undefined);
        assert.equal(call.options.headers.Cookie, undefined);
        assert.equal(call.options.rejectUnauthorized, undefined, 'default certificate verification retained');
    }
});

test('Windows download marker records Internet zone and public fixed source without instructions to unblock', () => {
    const asset = update.installerFromRelease(release());
    assert.equal(update.internetZone(asset.url), '[ZoneTransfer]\r\nZoneId=3\r\nReferrerUrl=https://github.com/hope140/EmbyTheaterEnhanced/releases\r\nHostUrl=' + asset.url + '\r\n');
});

test('connection failures try maintained sources serially and restart partial bytes', async t => {
    const root = temp(t), asset = update.installerFromRelease(release());
    let active = 0, peak = 0;
    const mock = transport([
        {produce(response) { active++; peak = Math.max(peak, active); response.write(bytes.subarray(0, 8)); setImmediate(() => { active--; response.destroy(Object.assign(new Error('reset'), {code: 'ECONNRESET'})); }); }},
        {body: bytes}
    ]);
    const progress = [];
    const result = await update.downloadInstaller(asset, root, {get: mock.get, onProgress: p => progress.push(p)});
    assert.equal(result.source, 'gh-proxy.com'); assert.equal(peak, 1);
    assert.deepEqual(mock.calls.map(c => c.url), update.SOURCES.map(s => s.prefix + asset.url));
    assert.deepEqual(fs.readFileSync(path.join(root, asset.name)), bytes);
    assert.ok(progress.some(p => p.bytes === 0 && p.source === 'gh-proxy.com'));
    for (const call of mock.calls) assert.deepEqual(Object.keys(call.options.headers).sort(), ['Accept', 'Accept-Encoding', 'User-Agent']);
});

test('all maintained connection failures stop after one request per source and clean temporary files', async t => {
    const root = temp(t), mock = transport(update.SOURCES.map(() => ({error: 'ENOTFOUND'})));
    await assert.rejects(update.downloadInstaller(update.installerFromRelease(release()), root, {get: mock.get}), /ENOTFOUND/);
    assert.equal(mock.calls.length, update.SOURCES.length); assert.deepEqual(fs.readdirSync(root), []);
});

test('replaced physical directory is refused and cleanup never deletes from its replacement', async t => {
    const root = temp(t), selected = path.join(root, 'selected'), moved = path.join(root, 'moved'); fs.mkdirSync(selected);
    const mock = transport([{}]);
    let replacement, exchangeError;
    await assert.rejects(update.downloadInstaller(update.installerFromRelease(release()), selected, {get: mock.get, onProgress() {
        const temporary = fs.readdirSync(selected).find(n => n.endsWith('.part'));
        try { fs.renameSync(selected, moved); }
        catch (error) { exchangeError = error; throw error; }
        fs.mkdirSync(selected);
        replacement = path.join(selected, temporary); fs.writeFileSync(replacement, 'foreign file');
    }}), error => error.code === 'directory-invalid' || (process.platform === 'win32' && error === exchangeError && ['EPERM', 'EACCES', 'EBUSY'].includes(error.code)));
    if (exchangeError) { assert.deepEqual(fs.readdirSync(selected), []); return; }
    assert.equal(fs.readFileSync(replacement, 'utf8'), 'foreign file');
    assert.ok(fs.readdirSync(moved).some(n => n.endsWith('.part')), 'displaced original is preserved instead of guessing its new path');
});

test('replaced temporary pathname is refused without deleting its foreign replacement', async t => {
    const root = temp(t), mock = transport([{}]); let replacement, exchangeError;
    await assert.rejects(update.downloadInstaller(update.installerFromRelease(release()), root, {get: mock.get, onProgress() {
        const temporary = fs.readdirSync(root).find(n => n.endsWith('.part'));
        replacement = path.join(root, temporary);
        try { fs.renameSync(replacement, replacement + '.displaced'); }
        catch (error) { exchangeError = error; throw error; }
        fs.writeFileSync(replacement, 'foreign file');
    }}), error => error.code === 'directory-invalid' || (process.platform === 'win32' && error === exchangeError && ['EPERM', 'EACCES', 'EBUSY'].includes(error.code)));
    if (exchangeError) { assert.deepEqual(fs.readdirSync(root), []); return; }
    assert.equal(fs.readFileSync(replacement, 'utf8'), 'foreign file');
    assert.ok(!fs.readdirSync(root).some(n => n.endsWith('.exe')));
});

for (const [name, route, reason] of [
    ['HTTP denial', {status: 403}, 'http-rejected'],
    ['rate limit', {status: 429}, 'http-rejected'],
    ['TLS rejection', {error: 'CERT_HAS_EXPIRED'}, 'CERT_HAS_EXPIRED'],
    ['downgrade', {status: 302, headers: {location: 'http://github.com/file'}}, 'unsafe-redirect'],
    ['credentials redirect', {status: 302, headers: {location: 'https://user:secret@github.com/file'}}, 'unsafe-redirect'],
    ['unknown redirect', {status: 302, headers: {location: 'https://evil.example/file'}}, 'unsafe-redirect'],
    ['content encoding', {headers: {'content-encoding': 'gzip'}}, 'encoding-rejected'],
    ['oversize header', {headers: {'content-length': String(bytes.length + 1)}}, 'size-mismatch'],
    ['truncated body', {body: bytes.subarray(0, 8)}, 'size-mismatch'],
    ['oversize chunked body', {body: Buffer.concat([bytes, bytes])}, 'size-mismatch'],
    ['wrong digest', {body: Buffer.alloc(bytes.length)}, 'hash-mismatch']
]) test(name + ' stops without another source or final file', async t => {
    const root = temp(t), mock = transport([route]);
    await assert.rejects(update.downloadInstaller(update.installerFromRelease(release()), root, {get: mock.get}), new RegExp(reason));
    assert.equal(mock.calls.length, 1); assert.deepEqual(fs.readdirSync(root), []);
});

test('redirect loop has a fixed budget and no fallback', async t => {
    const asset = update.installerFromRelease(release()), root = temp(t);
    const mock = transport(Array.from({length: 5}, () => ({status: 302, headers: {location: asset.url}})));
    await assert.rejects(update.downloadInstaller(asset, root, {get: mock.get}), /unsafe-redirect/);
    assert.equal(mock.calls.length, 5); assert.deepEqual(fs.readdirSync(root), []);
});

test('cancellation and total deadline abort stalled bodies and clean partial files', async t => {
    for (const timeout of [false, true]) {
        const root = temp(t), controller = new AbortController();
        const mock = transport([{produce(response) { response.write(bytes.subarray(0, 8)); if (!timeout) setImmediate(() => controller.abort()); }}]);
        await assert.rejects(update.downloadInstaller(update.installerFromRelease(release()), root, {
            get: mock.get, signal: controller.signal, deadline: Date.now() + (timeout ? 25 : 2000)
        }), new RegExp(timeout ? 'timeout' : 'cancelled'));
        assert.equal(mock.calls.length, 1); assert.deepEqual(fs.readdirSync(root), []);
    }
});

test('existing files and a final-commit race never overwrite good bytes', async t => {
    const asset = update.installerFromRelease(release());
    for (const race of [false, true]) {
        const root = temp(t), mock = transport([{}]), dest = path.join(root, asset.name);
        if (!race) fs.writeFileSync(dest, 'existing good file');
        await assert.rejects(update.downloadInstaller(asset, root, {get: mock.get, onProgress() { if (race) fs.writeFileSync(dest, 'existing good file'); }}));
        assert.equal(fs.readFileSync(dest, 'utf8'), 'existing good file');
        assert.deepEqual(fs.readdirSync(root), [asset.name]);
        assert.equal(mock.calls.length, race ? 1 : 0);
    }
});

test('installer path escape and redirected download directories are refused before traffic', async t => {
    const root = temp(t), mock = transport([{}]), asset = update.installerFromRelease(release());
    await assert.rejects(update.downloadInstaller({...asset, name: '../escape.exe'}, root, {get: mock.get}), /invalid-installer/);
    await assert.rejects(update.downloadInstaller(asset, 'relative-directory', {get: mock.get}), /directory-invalid/);
    const alias = path.join(root, 'alias');
    fs.symlinkSync(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(update.downloadInstaller(asset, alias, {get: mock.get}), /directory-invalid/);
    assert.equal(mock.calls.length, 0);
});

function ipcHarness(overrides = {}) {
    const handlers = new Map(), sent = [];
    const sender = {isDestroyed: () => false, send: (...args) => sent.push(args)};
    const event = eventFor(sender);
    let jsonCalls = 0, pickerCalls = 0, downloads = 0;
    const unregister = ipc.register({
        ipcMain: {handle: (name, handler) => handlers.set(name, handler), removeHandler: name => handlers.delete(name)},
        getWebContents: () => sender, getAppInfo: async () => ({appVersion: '0.4.0'}),
        dialog: {showOpenDialog: async () => { pickerCalls++; return {filePaths: ['/synthetic-directory']}; }},
        requestJson: async () => { jsonCalls++; return release(); },
        downloadInstaller: async (_asset, _root, options) => { downloads++; options.onProgress({bytes: 1, total: 2, source: 'github'}); return {status: 'downloaded'}; },
        ...overrides
    });
    return {handlers, sender, event, sent, unregister, counts: () => ({jsonCalls, pickerCalls, downloads}),
        invoke: (channel, request) => handlers.get(channel)(event, request)};
}

test('IPC checks only on request, pins official revalidation and accepts no renderer URLs or paths', async () => {
    const h = ipcHarness();
    assert.deepEqual(h.counts(), {jsonCalls: 0, pickerCalls: 0, downloads: 0});
    for (const channel of [ipc.CHANNELS.GET_INFO, ipc.CHANNELS.COPY_ENVIRONMENT, ipc.CHANNELS.CHECK_UPDATE, ipc.CHANNELS.DOWNLOAD, ipc.CHANNELS.CANCEL]) {
        assert.equal((await h.handlers.get(channel)({sender: {}})).reason, 'untrusted_sender');
        assert.equal((await h.invoke(channel, {url: 'https://evil.example/', directory: '/tmp'})).reason, 'invalid-request');
    }
    assert.equal((await h.invoke(ipc.CHANNELS.DOWNLOAD)).reason, 'verification-unavailable');
    assert.equal((await h.invoke(ipc.CHANNELS.CHECK_UPDATE)).status, 'update-available');
    assert.equal((await h.invoke(ipc.CHANNELS.DOWNLOAD)).status, 'downloaded');
    assert.deepEqual(h.counts(), {jsonCalls: 2, pickerCalls: 1, downloads: 1});
    assert.equal(h.sent.length, 1);
    await h.unregister(); assert.equal(h.handlers.size, 0);
});

test('external release IPC validates its complete schema and cannot open an installer or credential URL', async () => {
    const opened = [], h = ipcHarness({shell: {openExternal: async url => opened.push(url)}});
    for (const request of [undefined, null, [], 'url', {}, {url: 42}, {url: '', extra: 1}, {url: 'a'.repeat(2049)}]) {
        assert.equal((await h.invoke(ipc.CHANNELS.OPEN_RELEASES, request)).reason, 'invalid-request');
    }
    assert.equal(opened.length, 0);
    for (const url of [release().assets[0].browser_download_url, release().html_url + '?token=canary', 'https://user:secret@github.com/hope140/EmbyTheaterEnhanced/releases/latest']) {
        await h.invoke(ipc.CHANNELS.OPEN_RELEASES, {url});
        assert.equal(opened.at(-1), maintenance.RELEASES_URL);
    }
    await h.invoke(ipc.CHANNELS.OPEN_RELEASES, {url: release().html_url}); assert.equal(opened.at(-1), release().html_url);
    await h.unregister();
});

test('official revalidation outage, changed digest or prerelease never enter picker/download', async () => {
    for (const mode of ['offline', 'changed', 'prerelease']) {
        let count = 0;
        const h = ipcHarness({requestJson: async url => {
            if (++count === 1) { assert.equal(url, update.API + 'latest'); return release(); }
            assert.equal(url, update.API + 'tags/v0.4.1');
            if (mode === 'offline') throw new Error('offline');
            const r = release();
            if (mode === 'changed') r.assets[0].digest = 'sha256:' + 'a'.repeat(64);
            else r.prerelease = true;
            return r;
        }});
        await h.invoke(ipc.CHANNELS.CHECK_UPDATE);
        assert.equal((await h.invoke(ipc.CHANNELS.DOWNLOAD)).reason, mode === 'offline' ? 'verification-unavailable' : 'release-changed');
        assert.equal(h.counts().pickerCalls, 0); assert.equal(h.counts().downloads, 0);
        await h.unregister();
    }
});

test('concurrent operations are rejected and cancelled checks cannot cache a candidate', async () => {
    let resolveJson;
    const h = ipcHarness({requestJson: () => new Promise(resolve => { resolveJson = resolve; })});
    const pending = h.invoke(ipc.CHANNELS.CHECK_UPDATE); await tick();
    assert.equal((await h.invoke(ipc.CHANNELS.CHECK_UPDATE)).reason, 'busy');
    assert.equal((await h.invoke(ipc.CHANNELS.DOWNLOAD)).reason, 'busy');
    await h.invoke(ipc.CHANNELS.CANCEL); resolveJson(release());
    assert.equal((await pending).status, 'cancelled');
    assert.equal((await h.invoke(ipc.CHANNELS.DOWNLOAD)).reason, 'verification-unavailable');
    await h.unregister();
});

test('shutdown cancels the owner without waiting for a native directory dialog; late result does no work', async () => {
    let finishPicker;
    const h = ipcHarness({dialog: {showOpenDialog: () => new Promise(resolve => { finishPicker = resolve; })}});
    await h.invoke(ipc.CHANNELS.CHECK_UPDATE);
    const pending = h.invoke(ipc.CHANNELS.DOWNLOAD); await tick();
    await h.unregister(); assert.equal((await pending).status, 'cancelled');
    finishPicker({filePaths: ['/late-directory']}); await tick();
    assert.equal(h.counts().downloads, 0);
});

test('shutdown drains an active cancelled download', async () => {
    let complete, started;
    const ready = new Promise(resolve => { started = resolve; });
    const h = ipcHarness({downloadInstaller: async (_asset, _directory, {signal}) => {
        started(); await new Promise(resolve => { complete = resolve; });
        assert.equal(signal.aborted, true); throw new Error('aborted');
    }});
    await h.invoke(ipc.CHANNELS.CHECK_UPDATE);
    const pending = h.invoke(ipc.CHANNELS.DOWNLOAD); await ready;
    let closed = false;
    const closing = h.unregister().then(() => { closed = true; }); await tick();
    assert.equal(closed, false); complete(); await closing;
    assert.equal((await pending).status, 'cancelled');
});
