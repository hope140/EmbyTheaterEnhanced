'use strict';

// Explicit standalone entry for an unpacked test package. Never imported by main,
// preload or the renderer; no Electron API, application bootstrap or real network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {EventEmitter} = require('node:events');
const {PassThrough} = require('node:stream');
const update = require('./manual-app-update');
const maintenance = require('./maintenance');
const ipc = require('./maintenance-ipc');
const boundary = require('./renderer-boundary');

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function packageBinding() {
    const runtime = path.resolve(__dirname, '../..');
    const manifestPath = path.join(runtime, 'build-manifest.json');
    if (!fs.existsSync(manifestPath)) return {status: 'not-present', sourceCommit: 'UNKNOWN'};
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.match(manifest.sourceCommit, /^[0-9a-f]{40}$/);
    for (const name of ['manual-app-update.js', 'maintenance.js', 'maintenance-ipc.js', 'renderer-boundary.js', 'manual-app-update-selftest.js']) {
        const relative = 'electronapp/enhanced/' + name;
        const entries = manifest.files.filter(entry => entry.path === relative);
        assert.equal(entries.length, 1);
        assert.equal(sha256(fs.readFileSync(path.join(__dirname, name))), entries[0].sha256.toLowerCase());
    }
    // Matches the package's own manifest; this is not an independent signature.
    return {status: 'matched', sourceCommit: manifest.sourceCommit};
}

function mockTransport(routes) {
    const calls = [];
    return {calls, get(url, options, callback) {
        calls.push({url: url.href, headers: options.headers});
        const route = routes[calls.length - 1] || {};
        const request = new EventEmitter(), response = new PassThrough();
        response.on('error', function () {});
        response.statusCode = route.status || 200; response.headers = route.headers || {};
        request.setTimeout = function () {};
        request.destroy = function (error) { response.destroy(error); request.emit('error', error); };
        const abort = () => request.destroy(Object.assign(new Error('aborted'), {code: 'ABORT_ERR'}));
        options.signal.addEventListener('abort', abort, {once: true});
        response.on('close', () => options.signal.removeEventListener('abort', abort));
        setImmediate(() => {
            if (options.signal.aborted) { abort(); return; }
            if (route.error) { request.destroy(Object.assign(new Error(route.error), {code: route.error})); return; }
            callback(response);
            if (route.produce) route.produce(response);
            else response.end(route.bytes || Buffer.alloc(0));
        });
        return request;
    }};
}

async function run() {
    const binding = packageBinding();
    const scratch = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-update-package-selftest-')));
    const checks = [];
    // Deliberately inert generated text. No installer, downloaded software or code.
    const bytes = Buffer.from('ETE offline selftest text; not a Windows executable.\n');
    const name = 'EmbyTheaterEnhanced-1.2.3-win-x64-setup.exe';
    const release = {tag_name: 'v1.2.3', draft: false, prerelease: false, body: '<script>inert</script>',
        html_url: 'https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v1.2.3',
        assets: [{id: 123, name, size: bytes.length, digest: 'sha256:' + sha256(bytes), state: 'uploaded',
            browser_download_url: 'https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v1.2.3/' + name}]};
    const asset = update.installerFromRelease(release);
    function directory(name) { const root = path.join(scratch, name); fs.mkdirSync(root); return root; }
    try {
        assert.equal(maintenance.compareVersions('1.2.3-rc.10', '1.2.3'), -1);
        assert.equal(maintenance.compareVersions('01.2.3', '1.2.3'), null);
        assert.equal(maintenance.compareVersions('9007199254740992.0.0', '9007199254740993.0.0'), -1);
        assert.equal((await maintenance.checkLatestRelease({currentVersion: '1.2.4', requestJson: async () => release})).status, 'ahead');
        assert.equal((await maintenance.checkLatestRelease({currentVersion: '1.2.2', requestJson: async () => ({...release, prerelease: true})})).status, 'error');
        checks.push('semver-stable-channel');

        const root = directory('verified'), mock = mockTransport([{bytes}]);
        const downloaded = await update.downloadInstaller(asset, root, {get: mock.get});
        assert.equal(downloaded.status, 'downloaded'); assert.deepEqual(fs.readFileSync(path.join(root, name)), bytes);
        if (process.platform === 'win32') assert.equal(fs.readFileSync(path.join(root, name) + ':Zone.Identifier', 'utf8'), update.internetZone(asset.url));
        checks.push(process.platform === 'win32' ? 'synthetic-download-and-zone3' : 'synthetic-download-windows-zone-not-executed');
        await assert.rejects(update.downloadInstaller(asset, root, {get: mock.get}), /file-exists/);
        assert.equal(mock.calls.length, 1); assert.deepEqual(fs.readdirSync(root), [name]);
        checks.push('no-replace-and-temp-cleanup');

        const rejectedRoot = directory('denial'), denied = mockTransport([{status: 403}]);
        await assert.rejects(update.downloadInstaller(asset, rejectedRoot, {get: denied.get}), /http-rejected/);
        assert.equal(denied.calls.length, 1); assert.deepEqual(fs.readdirSync(rejectedRoot), []);
        checks.push('http-denial-does-not-fallback');

        const wrongRoot = directory('wrong-hash'), wrong = mockTransport([{bytes: Buffer.alloc(bytes.length)}]);
        await assert.rejects(update.downloadInstaller(asset, wrongRoot, {get: wrong.get}), /hash-mismatch/);
        assert.equal(wrong.calls.length, 1); assert.deepEqual(fs.readdirSync(wrongRoot), []);
        checks.push('official-digest-mismatch-refused');

        const cancelledRoot = directory('cancel'), controller = new AbortController();
        const cancel = mockTransport([{produce(response) { response.write(bytes.subarray(0, 4)); setImmediate(() => controller.abort()); }}]);
        await assert.rejects(update.downloadInstaller(asset, cancelledRoot, {get: cancel.get, signal: controller.signal}), /cancelled/);
        assert.deepEqual(fs.readdirSync(cancelledRoot), []); checks.push('cancel-cleans-owned-file-and-handle');

        const fallbackRoot = directory('fallback');
        const fallback = mockTransport(update.SOURCES.map((_, index) => index === update.SOURCES.length - 1 ? {bytes} : {error: 'ENOTFOUND'}));
        await update.downloadInstaller(asset, fallbackRoot, {get: fallback.get});
        assert.equal(fallback.calls.length, update.SOURCES.length);
        for (const call of fallback.calls) assert.deepEqual(Object.keys(call.headers).sort(), ['Accept', 'Accept-Encoding', 'User-Agent']);
        checks.push('maintained-source-order-and-anonymous-headers');

        const handlers = new Map(), sender = {mainFrame: {url: require('node:url').pathToFileURL(path.resolve(__dirname, '../www/index.html')).href}};
        const event = {sender, senderFrame: sender.mainFrame}; assert.equal(boundary.isTrusted(event, sender), true);
        const unregister = ipc.register({ipcMain: {handle: (channel, fn) => handlers.set(channel, fn), removeHandler: channel => handlers.delete(channel)},
            getWebContents: () => sender, getAppInfo: async () => ({appVersion: '1.2.2'}), requestJson: async () => release});
        try {
            assert.equal((await handlers.get(ipc.CHANNELS.CHECK_UPDATE)({sender: {}})).reason, 'untrusted_sender');
            assert.equal((await handlers.get(ipc.CHANNELS.DOWNLOAD)(event, {url: 'https://invalid.example/'})).reason, 'invalid-request');
            assert.equal((await handlers.get(ipc.CHANNELS.CHECK_UPDATE)(event)).status, 'update-available');
        } finally { await unregister(); }
        checks.push('packaged-ipc-trust-and-input-schema');
    } finally { fs.rmSync(scratch, {recursive: true, force: true}); }
    return {status: 'passed', scope: 'offline-package-modules-and-synthetic-files-only', packageManifestBinding: binding,
        platform: process.platform, checks, temporaryFilesRemoved: true, realNetworkRequests: 0, appBootstrap: false,
        profileAccess: false, installerExecuted: false};
}

module.exports = {run};
if (require.main === module) {
    if (process.argv.length !== 2) { process.stderr.write('No arguments are supported.\n'); process.exitCode = 2; }
    else run().then(result => process.stdout.write(JSON.stringify(result, null, 2) + '\n')).catch(error => {
        process.stderr.write('Manual update package selftest failed: ' + (error.code || 'selftest-failed') + '\n'); process.exitCode = 1;
    });
}
