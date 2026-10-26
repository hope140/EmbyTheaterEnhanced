'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const os = require('node:os');
const cp = require('node:child_process');
const {createHandoff} = require('../src/electronapp/enhanced/update-install-handoff');

test('real relay and authenticated pipe cancel an inert guard and drain the owned process (Unix transport only)', {
    skip: process.platform === 'win32' && 'Windows uses the real native guard tests instead', timeout: 20000
}, async t => {
    const guardPath = path.resolve(__dirname, '../src/electronapp/enhanced/update-install-guard.cs');
    const original = fs.readFileSync;
    const stub = `using System; public sealed class EteUpdateGuard:IDisposable {
 public EteUpdateGuard(string r,string i,string v,string d,string n,bool c){}
 public void Prepare(string n,string i,long s,string h,string z){}
 public void OpenWizard(){throw new NotSupportedException("Never execute in transport test");}
 public void Dispose(){}
}`;
    t.mock.method(fs, 'readFileSync', function (file, ...args) { return file === guardPath ? Buffer.from(stub) : original.call(fs, file, ...args); });
    let child, closed, diagnostics = '', lease;
    const handoff = createHandoff({platform: 'win32', environment: {...process.env, SystemRoot: 'C:\\Windows'},
        createServer: handler => {
            const server = net.createServer(handler), listen = server.listen.bind(server);
            server.listen = (name, ready) => listen(path.join(os.tmpdir(), 'CoreFxPipe_' + name.slice(name.lastIndexOf('\\') + 1)), ready);
            return server;
        },
        spawn: (_exe, args, options) => {
            child = cp.spawn('pwsh', args, {...options, env: {...options.env, PATH: process.env.PATH}, stdio: ['pipe', 'ignore', 'pipe']});
            child.stderr.on('data', bytes => { diagnostics += bytes; });
            closed = new Promise(resolve => child.once('close', resolve)); return child;
        }});
    t.after(async () => { if (lease) await lease.abort(); else if (child && child.exitCode === null) { child.stdin.end('abort\n'); await closed; } });
    const record = {root: '/inert', rootId: {dev: '1', ino: '1'}, directory: '/inert/update-' + 'a'.repeat(32), directoryId: {ino: '2'},
        executable: process.execPath, fileId: {ino: '3'}, source: 'github',
        installer: {name: 'EmbyTheaterEnhanced-9.1.0-win-x64-setup.exe', size: 1, sha256: 'a'.repeat(64), url: 'https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v9.1.0/a.exe'}};
    const controller = new AbortController();
    try { lease = await handoff.prepare(record, controller.signal); } catch (error) { throw Error(error.message + ': ' + diagnostics); }
    assert.ok(lease.processId > 0); controller.abort(); await lease.abort();
    assert.notEqual(child.exitCode, null, 'launcher exits only after the owned guard has exited');
});
