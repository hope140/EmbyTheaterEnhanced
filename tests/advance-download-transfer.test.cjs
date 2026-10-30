'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {download} = require('../src/electronapp/enhanced/advance-download/transfer');
const probe = require('../src/electronapp/enhanced/advance-download/source-probe');
const {fixture, media} = require('./helpers/advance-download-fixture.cjs');

async function setup(t, deps) {
    const f = await fixture(t);
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-media-transfer-')));
    fs.writeFileSync(path.join(root, 'user-file.txt'), 'keep');
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const session = f.session({}, deps), source = await session.acquire();
    return {...f, root, session, source};
}
function assertFile(f, result) {
    assert.equal(result.status, 'downloaded');
    assert.deepEqual(fs.readFileSync(path.join(f.root, result.fileName)), media);
    assert.equal(fs.readFileSync(path.join(f.root, 'user-file.txt'), 'utf8'), 'keep');
    assert.ok(!fs.readdirSync(f.root).some(name => name.endsWith('.part')));
}

test('an authenticated Emby/CD2 source is streamed to a directly usable video without replacing an existing file', async t => {
    const f = await setup(t);
    fs.writeFileSync(path.join(f.root, 'Synthetic Movie.mkv'), 'existing-download');
    const progress = [];
    const result = await download({session: f.session, source: f.source, directory: f.root, onProgress: value => progress.push(value)});
    assert.equal(result.fileName, 'Synthetic Movie (1).mkv');
    assert.equal(fs.readFileSync(path.join(f.root, 'Synthetic Movie.mkv'), 'utf8'), 'existing-download');
    assertFile(f, result);
    assert.equal(progress.at(-1).bytes, media.length);
    assert.equal(f.calls.filter(call => call.url.startsWith('/direct') && !call.headers.range).length, 1);
});

test('a cut response resumes only after reauthorization, a fresh URL and matching strong validator', async t => {
    const f = await setup(t);
    f.state.cutTransfer = 1;
    const result = await download({session: f.session, source: f.source, directory: f.root});
    assertFile(f, result);
    assert.ok(f.calls.some(call => call.headers.range === 'bytes=1024-' && call.headers['if-range'] === '"movie-v1"'));
    assert.equal(f.state.closedServices, 2);
});

test('an interrupted download without a strong validator restarts its own temporary file instead of appending', async t => {
    const f = await fixture(t);
    f.state.etag = null;
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-media-no-validator-')));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const session = f.session(), source = await session.acquire();
    f.state.cutTransfer = 1;
    const result = await download({session, source, directory: root});
    assert.deepEqual(fs.readFileSync(path.join(root, result.fileName)), media);
    assert.equal(f.calls.filter(call => call.url.startsWith('/direct') && !call.headers.range).length, 2);
    assert.ok(!f.calls.some(call => /^bytes=\d+-$/.test(call.headers.range || '')));
});

test('all bytes arriving without a complete HTTP message still require a clean fresh transfer', async t => {
    const f = await setup(t);
    f.state.cutTransfer = 1; f.state.cutAfterBody = true;
    const result = await download({session: f.session, source: f.source, directory: f.root});
    assertFile(f, result);
    assert.equal(f.calls.filter(call => call.url.startsWith('/direct') && !call.headers.range).length, 2);
    assert.ok(!f.calls.some(call => call.headers.range === 'bytes=4096-'));
});

test('a changed representation after interruption is never published or appended', async t => {
    const f = await setup(t);
    f.state.cutTransfer = 1; f.state.changeOnCut = true;
    await assert.rejects(download({session: f.session, source: f.source, directory: f.root}), error => probe.reasonOf(error) === 'representation-changed');
    assert.deepEqual(fs.readdirSync(f.root), ['user-file.txt']);
    assert.equal(fs.readFileSync(path.join(f.root, 'user-file.txt'), 'utf8'), 'keep');
});

test('a redirect during actual transfer is not followed with credentials; refreshed source probing strips them', async t => {
    const f = await fixture(t);
    f.state.pointer = false;
    const session = f.session({}, {getConfig: () => ({resolver: {version: 1, enabled: false, rules: []}, runtime: {enabled: false}})});
    const source = await session.acquire();
    f.state.redirectOnTransfer = true;
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-media-redirect-')));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const result = await download({session, source, directory: root});
    assert.deepEqual(fs.readFileSync(path.join(root, result.fileName)), media);
    assert.ok(f.calls.filter(call => call.url.startsWith('/direct')).every(call => !call.headers['x-emby-token']));
});

test('cancellation closes the stream and removes only this operation own incomplete file', async t => {
    const f = await setup(t), controller = new AbortController();
    f.state.transferStall = true;
    const timer = setTimeout(() => controller.abort(), 20);
    try {
        await assert.rejects(download({session: f.session, source: f.source, directory: f.root, signal: controller.signal}), error => probe.reasonOf(error) === 'cancelled');
    } finally {clearTimeout(timer);}
    assert.deepEqual(fs.readdirSync(f.root), ['user-file.txt']);
    for (let index = 0; index < 50 && f.sockets.size; index++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(f.sockets.size, 0);
});

test('an exchanged temporary path is not published or deleted and the unrelated target survives', async t => {
    const f = await setup(t);
    let exchanged = false;
    await assert.rejects(download({session: f.session, source: f.source, directory: f.root, onProgress() {
        if (exchanged) return;
        const temporary = fs.readdirSync(f.root).find(name => name.endsWith('.part'));
        if (!temporary) return;
        fs.unlinkSync(path.join(f.root, temporary));
        fs.symlinkSync(path.join(f.root, 'user-file.txt'), path.join(f.root, temporary), 'file');
        exchanged = true;
    }}), error => probe.reasonOf(error) === 'temporary-changed');
    assert.equal(fs.readFileSync(path.join(f.root, 'user-file.txt'), 'utf8'), 'keep');
    assert.ok(!fs.readdirSync(f.root).some(name => name.endsWith('.mkv')));
    assert.ok(fs.readdirSync(f.root).some(name => name.endsWith('.part')));
});
