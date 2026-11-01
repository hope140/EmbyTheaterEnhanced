'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {PassThrough} = require('node:stream');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {createHandoff} = require('../src/electronapp/enhanced/update-install-handoff');
const record = {root: 'C:\\profile\\updates', rootId: {dev: '1', ino: '9007199254740993'}, directory: 'C:\\profile\\updates\\update-' + 'a'.repeat(32),
    directoryId: {ino: '22'}, executable: 'C:\\app\\electron.exe', fileId: {ino: '33'}, source: 'github',
    installer: {name: 'EmbyTheaterEnhanced-9.1.0-win-x64-setup.exe', size: 12, sha256: 'a'.repeat(64), url: 'https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v9.1.0/a.exe'}};
function fixture(mode = 'install') {
    const calls = [];
    const child = new EventEmitter(); child.exitCode = null; child.killed = false;
    child.stdin = new PassThrough(); child.stdout = new PassThrough();
    child.unref = () => { child.unreferenced = true; };
    let input = '', outgoing = '', connect;
    const connection = new EventEmitter();
    connection.destroy = () => { if (!connection.destroyed) { connection.destroyed = true; connection.emit('close'); } };
    connection.write = bytes => {
        outgoing += bytes.toString();
        setImmediate(() => {
            if (mode === 'hold-release' && outgoing.endsWith('launch\n')) return;
            if (mode === 'hold-armed' && outgoing.endsWith('commit\n')) return;
            if (outgoing.endsWith('launch\n')) connection.emit('data', Buffer.from('ETE_INSTALL_RELEASED\r\n'));
            else if (outgoing.endsWith('commit\n')) connection.emit('data', Buffer.from('ETE_INSTALL_ARMED\r\n'));
            else if (!['cleanup', 'empty-exit', 'bad-auth'].includes(mode)) connection.emit('data', Buffer.from('ETE_INSTALL_READY\r\n'));
            else { if (mode === 'cleanup') connection.emit('data', Buffer.from('ETE_CLEANUP_DONE\r\n')); child.exitCode = 0; child.emit('close', 0); }
        });
    };
    child.stdin.on('data', bytes => {
        input += bytes.toString();
        if (mode !== 'abort-hangs' && input.includes('\nabort\n')) { child.killed = true; setImmediate(() => { child.exitCode = 1; child.emit('close', 1); }); }
    });
    const handoff = createHandoff({platform: 'win32', environment: {SystemRoot: 'C:\\Windows', APPDATA: 'C:\\profile', GITHUB_TOKEN: 'secret-canary', NODE_OPTIONS: 'secret-canary', HTTPS_PROXY: 'secret-canary'},
        randomBytes: size => Buffer.alloc(size, 1),
        createServer: listener => {
            connect = listener; const server = new EventEmitter();
            server.close = () => {};
            server.listen = (_name, ready) => { setImmediate(ready); };
            return server;
        },
        spawn: (...args) => { calls.push(args); setImmediate(() => {
            connect(connection);
            connection.emit('data', Buffer.from((mode === 'bad-auth' ? '02' : '01').repeat(32) + ' 4321\r\n'));
            if (mode === 'bad-auth') { child.exitCode = 1; child.emit('close', 1); }
        }); return child; }});
    return {handoff, child, connection, calls, transmitted: () => outgoing, payload: () => JSON.parse(outgoing.split('\n')[1])};
}

test('private handoff uses fixed system executable, no inherited credentials/policy override or installer args', async () => {
    const f = fixture(), signal = new AbortController().signal;
    const lease = await f.handoff.prepare(record, signal);
    const [executable, args, options] = f.calls[0];
    assert.equal(executable, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    assert.deepEqual(args.slice(0, 4), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command']);
    assert.doesNotMatch(JSON.stringify(options.env), /secret-canary|TOKEN|NODE_OPTIONS|PROXY/);
    assert.match(args[4], /Import-Module.*\$PSHOME.*Microsoft\.PowerShell\.Utility\.psd1/);
    assert.equal(options.env.PSModuleAnalysisCachePath, undefined);
    assert.equal(options.shell, undefined); assert.equal(options.detached, false);
    assert.equal(lease.processId, 4321);
    assert.equal(f.payload().rootIno, '9007199254740993');
    assert.equal(f.payload().zone.includes('ZoneId=3'), true);
    assert.equal(f.child.unreferenced, undefined);
    await lease.commit(); assert.equal(f.child.unreferenced, undefined); await lease.release(); assert.equal(f.child.unreferenced, true); assert.equal(f.child.killed, false);
});

test('cancellation before commit kills only the owned helper and never detaches it', async () => {
    const f = fixture(), controller = new AbortController();
    const lease = await f.handoff.prepare(record, controller.signal); controller.abort();
    assert.equal(f.child.killed, true); assert.equal(f.child.unreferenced, undefined);
    assert.throws(() => lease.commit(), /installer-launch-failed/);
    await lease.abort(); assert.equal(f.child.exitCode, 1, 'cancel drains actual owned close');
});

test('a committed helper is independent of subsequent normal main shutdown cancellation', async () => {
    const f = fixture(), controller = new AbortController();
    const lease = await f.handoff.prepare(record, controller.signal); await lease.commit(); await lease.release(); controller.abort(); await assert.rejects(lease.abort(), {code: 'handoff-cancel-unconfirmed'});
    assert.equal(f.child.killed, false);
});

test('arming is cancellable until the final launch release and never detaches early', async () => {
    const f = fixture(), controller = new AbortController();
    const lease = await f.handoff.prepare(record, controller.signal); await lease.commit();
    assert.equal(f.child.unreferenced, undefined); controller.abort(); await lease.abort();
    assert.equal(f.child.exitCode, 1); assert.equal(f.child.killed, true);
    await assert.rejects(lease.release());
});

for (const [mode, frame] of [['hold-armed', 'ETE_INSTALL_ARMED'], ['hold-release', 'ETE_INSTALL_RELEASED']]) {
    test('late ' + frame + ' cannot authorize detachment or installation', async t => {
        const f = fixture(mode); let now = Date.now(); t.mock.method(Date, 'now', () => now);
        const lease = await f.handoff.prepare(record, new AbortController().signal);
        if (mode === 'hold-release') await lease.commit();
        const result = mode === 'hold-release' ? lease.release() : lease.commit();
        const rejected = assert.rejects(result);
        await new Promise(resolve => setImmediate(resolve)); now += 5001;
        f.connection.emit('data', Buffer.from(frame + '\n')); await rejected;
        assert.equal(f.child.unreferenced, undefined); assert.equal(f.child.exitCode, 1);
    });
}

test('a cancellation deadline reports unconfirmed while retaining the owned child', async t => {
    const f = fixture('abort-hangs'), lease = await f.handoff.prepare(record, new AbortController().signal);
    t.mock.timers.enable({apis: ['setTimeout']});
    const aborted = lease.abort(); const rejected = assert.rejects(aborted, {code: 'handoff-cancel-unconfirmed'});
    t.mock.timers.tick(5001); await rejected;
    assert.equal(f.child.exitCode, null); assert.equal(f.child.unreferenced, undefined);
    await assert.rejects(f.handoff.prepare(record, new AbortController().signal), {code: 'handoff-cancel-unconfirmed'});
    assert.equal(f.calls.length, 1);
    f.child.exitCode = 1; f.child.emit('close', 1); await lease.abort();
});

test('cleanup is local-only and waits for helper exit', async () => {
    const f = fixture('cleanup'); await f.handoff.cleanup({...record, files: []});
    assert.equal(f.payload().mode, 'cleanup'); assert.equal(f.child.unreferenced, undefined);
});

test('zero helper exit without explicit cleanup completion cannot report deletion success', async () => {
    const f = fixture('empty-exit'); await assert.rejects(f.handoff.cleanup({...record, files: []}), /installer-launch-failed/);
});

test('unauthenticated pipe clients receive neither installer identity nor shipped code', async () => {
    const f = fixture('bad-auth'); await assert.rejects(f.handoff.prepare(record, new AbortController().signal));
    assert.equal(f.transmitted(), '');
});

test('native guard compiles and handoff PowerShell parses without installing or invoking Windows APIs', () => {
    const source = path.resolve(__dirname, '../src/electronapp/enhanced/update-install-guard.cs');
    const script = path.resolve(__dirname, '../src/electronapp/enhanced/update-install-handoff.ps1');
    const result = spawnSync('pwsh', ['-NoLogo', '-NoProfile', '-Command',
        'Add-Type -LiteralPath $env:ETE_GUARD_SOURCE; Add-Type -LiteralPath $env:ETE_RELAY_SOURCE; $t=$null; $e=$null; [Management.Automation.Language.Parser]::ParseFile($env:ETE_HANDOFF_SCRIPT,[ref]$t,[ref]$e)>$null; if($e.Count){throw "parse-failed"}'],
    {env: {...process.env, ETE_GUARD_SOURCE: source, ETE_RELAY_SOURCE: path.join(path.dirname(source), 'update-install-relay.cs'), ETE_HANDOFF_SCRIPT: script}, encoding: 'utf8', timeout: 15000});
    assert.equal(result.status, 0, result.stderr);
    const text = fs.readFileSync(script, 'utf8');
    assert.match(text, /WaitForExit\(120000\)/); assert.match(text, /hostProcess.WaitForExit/);
    assert.match(text, /parent.ExitCode -ne 0/); assert.match(text, /hostProcess.ExitCode -ne 0/);
    assert.doesNotMatch(text, /Stop-Process|\.Kill\(|ExecutionPolicy/);
});
