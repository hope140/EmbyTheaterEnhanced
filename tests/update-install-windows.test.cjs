'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {createHandoff} = require('../src/electronapp/enhanced/update-install-handoff');
const update = require('../src/electronapp/enhanced/manual-app-update');
const windows = {skip: process.platform !== 'win32' && 'Windows handles / Windows PowerShell 5.1 only', timeout: 30000};
function fixture(t) {
    const scratch = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-update-校验-')));
    t.after(() => fs.rmSync(scratch, {recursive: true, force: true}));
    const root = path.join(scratch, 'updates'), directory = path.join(root, 'update-' + 'a'.repeat(32));
    fs.mkdirSync(directory, {recursive: true});
    const bytes = Buffer.from('inert native guard test; not a PE executable\n');
    const name = 'EmbyTheaterEnhanced-9.1.0-win-x64-setup.exe', file = path.join(directory, name);
    fs.writeFileSync(file, bytes, {flag: 'wx'});
    const installer = {name, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        url: 'https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v9.1.0/' + name};
    fs.writeFileSync(file + ':Zone.Identifier', update.internetZone(installer.url), {flag: 'wx'});
    const identity = file => { const stat = fs.statSync(file, {bigint: true}); return {ino: String(stat.ino), dev: String(stat.dev)}; };
    const record = {root, rootId: identity(root), directory, directoryId: identity(directory), executable: process.execPath,
        fileId: identity(file), source: 'github', installer};
    return {scratch, root, directory, file, bytes, record, handoff: createHandoff()};
}

test('actual Windows handoff locks Unicode paths, denies file/directory replacement, then cancels without executing', windows, async t => {
    const f = fixture(t), lease = await f.handoff.prepare(f.record, new AbortController().signal);
    try {
        assert.throws(() => fs.writeFileSync(f.file, 'tamper'));
        assert.throws(() => fs.unlinkSync(f.file));
        assert.throws(() => fs.renameSync(f.file, f.file + '.moved'));
        assert.throws(() => fs.renameSync(f.directory, f.directory + '-moved'));
        assert.throws(() => fs.renameSync(f.root, f.root + '-moved'));
    } finally { await lease.abort(); }
    assert.deepEqual(fs.readFileSync(f.file), f.bytes);
});

for (const mutation of ['digest', 'file-id', 'volume', 'zone', 'hardlink']) {
    test('actual Windows guard rejects ' + mutation + ' before readiness or execution', windows, async t => {
        const f = fixture(t);
        if (mutation === 'digest') fs.writeFileSync(f.file, Buffer.alloc(f.bytes.length));
        if (mutation === 'file-id') f.record.fileId.ino = (BigInt(f.record.fileId.ino) + 1n).toString();
        if (mutation === 'volume') f.record.rootId.dev = (BigInt(f.record.rootId.dev) + 1n).toString();
        if (mutation === 'zone') fs.writeFileSync(f.file + ':Zone.Identifier', '[ZoneTransfer]\r\nZoneId=0\r\n');
        if (mutation === 'hardlink') fs.linkSync(f.file, path.join(f.scratch, 'extra-hardlink'));
        await assert.rejects(f.handoff.prepare(f.record, new AbortController().signal), /installer-launch-failed/);
        assert.equal(fs.existsSync(f.file), true);
    });
}

test('actual Windows cleanup uses verified handles, refuses unknown files, and never touches Downloads', windows, async t => {
    const f = fixture(t), downloads = path.join(f.scratch, 'Downloads'); fs.mkdirSync(downloads);
    const manual = path.join(downloads, f.record.installer.name); fs.writeFileSync(manual, 'manual user file');
    const unknown = path.join(f.directory, 'unknown.txt'); fs.writeFileSync(unknown, 'test-owned unknown entry');
    const payload = {...f.record, files: [{name: f.record.installer.name, ino: f.record.fileId.ino,
        size: f.record.installer.size, sha256: f.record.installer.sha256}]};
    await assert.rejects(f.handoff.cleanup(payload));
    assert.equal(fs.existsSync(f.file), true); fs.unlinkSync(unknown);
    await f.handoff.cleanup(payload);
    assert.equal(fs.existsSync(f.directory), false); assert.equal(fs.readFileSync(manual, 'utf8'), 'manual user file');
});
