'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const net = require('node:net');
const {createHandoff} = require('../src/electronapp/enhanced/update-install-handoff');
const update = require('../src/electronapp/enhanced/manual-app-update');
const windows = {skip: process.platform !== 'win32' && 'Windows handles / Windows PowerShell 5.1 only', timeout: 30000};

test('Windows relay compiler diagnostic keeps the control input open without executing a program', {...windows, timeout: 100000}, async () => {
    const exe = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const records = [];
    for (const form of ['compile-relay', 'run-relay']) {
        const source = fs.readFileSync(path.resolve(__dirname, '../src/electronapp/enhanced/update-install-relay.cs')).toString('base64');
        const command = "[Console]::Error.WriteLine('COMPILER_ENTER'); Add-Type -TypeDefinition ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + source + "'))); [Console]::Error.WriteLine('COMPILER_DONE'); " +
            (form === 'compile-relay' ? "[Console]::Out.WriteLine('ETE_COMPILER_FINISHED'); exit 7" : "exit [EteUpdateRelay]::Run()");
        const began = Date.now();
        const row = await new Promise(resolve => {
            const child = cp.spawn(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], {windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
            let stdout = '', stderr = '';
            const timer = setTimeout(() => child.kill(), 45000);
            child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += '[' + (Date.now()-began) + 'ms]' + bytes; });
            child.on('error', () => {}); child.on('close', code => { clearTimeout(timer); resolve({form, code, printed: stdout.includes('ETE_COMPILER_FINISHED'), elapsed: Date.now() - began, error: stderr.slice(0, 400)}); });
            child.stdin.write(Buffer.from("[Console]::Out.WriteLine('ETE_COMPILER_FINISHED'); exit 7", 'utf16le').toString('base64') + '\n');
        });
        records.push(row);
    }
    process.stderr.write('ETE_NATIVE_DIAG compiler-matrix=' + JSON.stringify(records) + '\n');
    assert.equal(records.length, 2);
});

test('Windows helper startup diagnostic uses only literal printing and owned processes', {...windows, timeout: 60000}, async () => {
    const full = process.env;
    const minimal = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)']
        .filter(key => full[key] !== undefined).map(key => [key, full[key]]));
    const exe = path.join(full.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const records = [];
    for (const [environment, env] of [['minimal', minimal], ['full', full]]) for (const detached of [false, true]) for (const long of [false, true]) {
        const command = (long ? "$padding='" + 'x'.repeat(13431) + "'; " : '') + "[Console]::Out.WriteLine('ETE_PRINT_ONLY'); exit 7";
        const result = await new Promise(resolve => {
            const child = cp.spawn(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], {env, detached, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
            let stdout = '', stderr = '';
            const timer = setTimeout(() => child.kill(), 5000);
            child.stdout.on('data', bytes => { stdout += bytes.toString(); }); child.stderr.on('data', bytes => { stderr += bytes.toString(); });
            child.on('error', () => {}); child.on('close', code => { clearTimeout(timer); resolve({code, printed: stdout.includes('ETE_PRINT_ONLY'), stderr: stderr.slice(0, 200)}); });
            child.stdin.end();
        });
        records.push({environment, detached, long, ...result});
    }
    process.stderr.write('ETE_NATIVE_DIAG print-matrix=' + JSON.stringify(records) + '\n');
    assert.ok(records.some(row => row.code === 7 && row.printed), 'at least the standard host control must execute');
});
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
    return {scratch, root, directory, file, bytes, record, handoff: createHandoff({createServer(handler) {
        const server = net.createServer(connection => { process.stderr.write('ETE_NATIVE_DIAG pipe-connection\n'); handler(connection); });
        const listen = server.listen.bind(server);
        server.listen = (name, ready) => listen(name, () => {
            process.stderr.write('ETE_NATIVE_DIAG pipe-listening hash=' + crypto.createHash('sha256').update(name).digest('hex').slice(0, 12) + '\n');
            const probe = net.connect(name);
            t.after(() => probe.destroy());
            probe.resume(); probe.on('end', () => probe.destroy());
            probe.on('connect', () => { process.stderr.write('ETE_NATIVE_DIAG node-pipe-connected\n'); probe.end('invalid-test-client\n'); });
            probe.on('error', error => { process.stderr.write('ETE_NATIVE_DIAG node-pipe-error=' + error.code + '\n'); probe.destroy(); });
            ready();
        });
        return server;
    }, spawn(exe, args, options) {
        const began = Date.now();
        const diagnosticArgs = [...args];
        diagnosticArgs[4] = "[Console]::Error.WriteLine('ETE_NATIVE_SCRIPT_ENTERED');\n" + diagnosticArgs[4];
        const child = cp.spawn(exe, diagnosticArgs, {...options, stdio: ['pipe', 'pipe', 'pipe']});
        let diagnostics = '', output = '';
        child.stderr.on('data', bytes => { diagnostics += '[+' + (Date.now() - began) + 'ms] ' + bytes.toString(); });
        child.stdout.on('data', bytes => { output += bytes.toString(); });
        child.on('close', code => { process.stderr.write('ETE_NATIVE_DIAG exit=' + code + ' chars=' + diagnosticArgs[4].length +
            ' stdout=' + output.slice(0, 120).replace(/[\r\n]+/g, ' ') + ' stderr=' + diagnostics.slice(0, 5500).replace(/[\r\n]+/g, ' ') + '\n'); });
        return child;
    }})};
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

test('actual Windows managed cache retains cancelled verified bytes, retries, and cleans only after version confirmation', windows, async t => {
    const f = fixture(t), profile = path.join(f.scratch, 'managed-profile'); fs.mkdirSync(profile);
    let transfers = 0;
    const store = require('../src/electronapp/enhanced/update-install-cache').createStore({profileRoot: profile, executable: process.execPath,
        handoff: f.handoff, downloadInstaller: async (installer, directory) => {
            transfers++;
            const file = path.join(directory, installer.name); fs.copyFileSync(f.file, file);
            // Windows CopyFile preserves ADS; assert preservation, never replace it.
            assert.equal(fs.readFileSync(file + ':Zone.Identifier', 'utf8'), update.internetZone(installer.url));
            return {source: 'github'};
        }});
    const installer = {...f.record.installer, id: 12};
    // Match the official descriptor's stable key order for persisted identity.
    const asset = {id: 12, name: installer.name, url: installer.url, size: installer.size, sha256: installer.sha256};
    const request = {currentVersion: '9.0.0', targetVersion: '9.1.0', tag: 'v9.1.0', signal: new AbortController().signal};
    const record = await store.download(asset, request), lease = await store.prepare(record, request.signal);
    await lease.abort();
    assert.deepEqual(fs.readFileSync(path.join(record.directory, asset.name)), f.bytes);
    assert.equal((await store.download(asset, request)).reused, true); assert.equal(transfers, 1);
    assert.equal((await store.reconcile('9.0.0')).removed, 0);
    assert.deepEqual(await store.reconcile('9.1.0'), {removed: 1, retained: 0});
    assert.equal(fs.existsSync(record.directory), false); assert.equal(fs.existsSync(f.file), true);
});
