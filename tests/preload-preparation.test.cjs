'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const preparation = require('../tools/prepare-preload.cjs');
const vm = require('node:vm');

const vendorPreload = "const { ipcRenderer } = require('electron');\r\nwindow.ipc = ipcRenderer;\r\nconst fs = require('fs');\r\nwindow.fs = fs;\r\nconst os = require('os');\r\nwindow.dirName = os.tmpdir();\r\nwindow.appdata = process.env.APPDATA;\r\n";

test('prepared preload is deterministic, sticky and based only on vendor input', () => {
    const prepared = preparation.buildPreparedPreload(vendorPreload);
    assert.match(prepared, /window\.ipc = ipcRenderer/);
    assert.match(prepared, new RegExp(preparation.PREPARED_PRELOAD_MARKER));
    assert.match(prepared, /window\.__eteBridgeReadiness/);
    assert.match(prepared, /window\.__eteDiagnosticHash/);
    assert.match(prepared, /function beginRun/);
    assert.match(prepared, /diagnostics\.collect/);
    assert.equal(prepared, preparation.buildPreparedPreload(vendorPreload));
    assert.equal(prepared.includes('E:\\Emby Theater Enhanced'), false);
});

function physicalFixtureRoot(temporaryRoot = os.tmpdir()) {
    return fs.realpathSync.native(fs.mkdtempSync(path.join(temporaryRoot, 'ete-preload-')));
}

test('prepare writes and reuses the same generated artifact without external files', () => {
    const root = physicalFixtureRoot();
    try {
        const vendorPath = path.join(root, preparation.BASE_PRELOAD_PATH);
        fs.mkdirSync(path.dirname(vendorPath), {recursive: true});
        fs.writeFileSync(vendorPath, vendorPreload, 'utf8');
        require('./helpers/runtime-template-fixture.cjs').create(root,{'electronapp/preload.js':Buffer.from(vendorPreload)});

        const first = preparation.prepare(root);
        const target = path.join(root, preparation.PREPARED_PRELOAD_PATH);
        assert.equal(first.status, 'passed');
        assert.equal(first.changed, true);
        assert.equal(fs.readFileSync(target, 'utf8'), preparation.buildPreparedPreload(vendorPreload));

        const second = preparation.prepare(root);
        assert.equal(second.changed, false);
        assert.equal(second.preparedSha256, first.preparedSha256);
    } finally {
        fs.rmSync(root, {recursive: true, force: true});
    }
});

test('media binding captures preload modules before access is revoked and is idempotent', () => {
    let preloadOpen = true, installs = 0, receiveCommand, received;
    const playbackManager = {}, events = {}, rendererWindow = {}, window = {};
    const context = {window, process: {env: {ETE_WINDOWS_NATIVE_TRIAL: '1'}},
        ipcRenderer: {send() {}, on(_channel, listener) {receiveCommand=listener;}, invoke() { return Promise.resolve({token: 'fixture'}); }},
        require(name) {
            if (!preloadOpen) throw Error('require access revoked');
            if (name === './enhanced/diagnostics') return {hashPath() {}};
            if (name === './enhanced/renderer-errors') return {install() {}};
            if (name === './enhanced/windows-media-renderer') return {install(target, send, options) {
                installs++;
                assert.equal(target, rendererWindow);
                assert.equal(options.playbackManager, playbackManager);
                assert.equal(options.events, events);
                assert.equal(typeof options.requestNativeSession, 'function');
                const dispose = () => {};
                dispose.command = packet => {received=packet;};
                dispose.status = () => ({bound: true, disposed: false});
                return dispose;
            }};
            throw Error('unexpected module');
        }};
    vm.runInNewContext(preparation.DIAGNOSTICS_BLOCK, context, {timeout: 1000});
    preloadOpen = false;
    window.__eteBindWindowsMedia(playbackManager, events, rendererWindow);
    window.__eteBindWindowsMedia(playbackManager, events, rendererWindow);
    assert.equal(installs, 1);
    const packet={version:1,command:'stop'};receiveCommand({},packet);assert.equal(received,packet);
    assert.equal(window.__eteWindowsMediaDiagnostics().bindError, null);
});

// CI TEMP can be an 8.3 alias; canonicalize fixtures, never relax product validation.
test('temporary parent aliases create physical fixtures while redirected template callers stay forbidden', t => {
    const parent = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-preload-alias-')));
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    const physical = path.join(parent, 'physical'), alias = path.join(parent, 'alias');
    fs.mkdirSync(physical);
    fs.symlinkSync(physical, alias, process.platform === 'win32' ? 'junction' : 'dir');
    const root = physicalFixtureRoot(alias);
    assert.equal(path.dirname(root), physical);
    const source = path.join(root, preparation.BASE_PRELOAD_PATH);
    fs.mkdirSync(path.dirname(source), {recursive: true});
    fs.writeFileSync(source, vendorPreload);
    require('./helpers/runtime-template-fixture.cjs').create(root, {'electronapp/preload.js': Buffer.from(vendorPreload)});
    const first = preparation.prepare(root);
    assert.equal(first.status, 'passed');
    assert.equal(preparation.prepare(root).preparedSha256, first.preparedSha256);
    assert.throws(() => preparation.prepare(path.join(alias, path.basename(root))), /links or redirects are forbidden/);
});
