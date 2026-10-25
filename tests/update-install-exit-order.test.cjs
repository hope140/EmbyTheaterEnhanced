'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');

// Exercise the real PS orchestration against owned inert Node processes. The
// explicitly substituted C# guard only writes a marker; it has NO ShellExecute
// or installer functionality. Production has no guard-source override option.
const guard = `using System; using System.IO;
public sealed class EteUpdateGuard : IDisposable {
 string root;
 public EteUpdateGuard(string r,string i,string v,string d,string n,bool c){root=r;}
 public void Prepare(string n,string i,long s,string h,string z){}
 public void OpenWizard(){File.WriteAllText(Path.Combine(root,"wizard-marker"),"synthetic guard only");}
 public void ValidateCleanup(string[] names){}
 public void DeleteOwned(string n,string i,long s,string h){}
 public void RemoveEmptyDirectory(){}
 public void Dispose(){}
}`;
const script = fs.readFileSync(path.resolve(__dirname, '../src/electronapp/enhanced/update-install-handoff.ps1'), 'utf8');
const command = "$eteGuardSource=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + Buffer.from(guard).toString('base64') + "'))\n" + script;

function owned(t, executable, args, options) {
    const child = spawn(executable, args, {...options, windowsHide: true});
    const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code)); });
    t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill(); await exited.catch(() => {}); });
    return {child, exited};
}

for (const [name, mainCode, hostCode, opens] of [['normal', 0, 0, true], ['main-crash', 3, 0, false], ['host-error', 0, 4, false]]) {
    // Unix Process.GetProcessById can observe a non-child's exit but cannot
    // retrieve its exit code. This product handoff is Windows-only; preserve
    // the exact nonzero assertions on Windows rather than accepting Unix zero.
    // https://github.com/dotnet/runtime/blob/v8.0.5/src/libraries/System.Diagnostics.Process/src/System/Diagnostics/ProcessWaitState.Unix.cs
    test('real handoff script ' + name + ' waits owned process handles and never executes software', {
        timeout: 20000, skip: process.platform !== 'win32' && !opens && 'Windows non-child exit-code/handle semantics only'
    }, async t => {
        const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-exit-order-校验-')));
        t.after(() => fs.rmSync(root, {recursive: true, force: true}));
        const dummy = 'setInterval(()=>{},1000);process.on("message",code=>process.exit(code));';
        const main = owned(t, process.execPath, ['-e', dummy], {stdio: ['ignore', 'ignore', 'ignore', 'ipc']});
        const host = owned(t, process.execPath, ['-e', dummy], {stdio: ['ignore', 'ignore', 'ignore', 'ipc']});
        const shell = process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'pwsh';
        const helper = owned(t, shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], {stdio: ['pipe', 'pipe', 'pipe']});
        let output = '', error = '';
        helper.child.stdout.on('data', bytes => { output += bytes.toString().replace(/\r/g, ''); });
        helper.child.stderr.on('data', bytes => { error += bytes.toString(); });
        const token = value => new Promise((resolve, reject) => {
            const inspect = () => { if (output.includes(value)) { helper.child.stdout.removeListener('data', inspect); resolve(); } };
            helper.child.stdout.on('data', inspect); inspect();
            helper.exited.then(() => { if (!output.includes(value)) reject(Error('helper closed before token: ' + error)); });
        });
        const request = {mode: 'install', root, rootIno: '1', rootDev: '1', directory: root, directoryIno: '1',
            parentPid: main.child.pid, mainExecutable: process.execPath, hostPid: host.child.pid, hostPath: process.execPath,
            name: 'inert', ino: '1', size: 1, sha256: 'a'.repeat(64), zone: 'not used by synthetic guard'};
        helper.child.stdin.write(JSON.stringify(request).replace(/[^\x20-\x7e]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')) + '\n');
        await token('ETE_INSTALL_READY');
        assert.equal(fs.existsSync(path.join(root, 'wizard-marker')), false);
        helper.child.stdin.end('commit\n'); await token('ETE_INSTALL_ARMED');
        main.child.send(mainCode); await main.exited;
        assert.equal(fs.existsSync(path.join(root, 'wizard-marker')), false, 'same-location host is still alive');
        host.child.send(hostCode); await host.exited;
        assert.equal(await helper.exited, opens ? 0 : 1, error);
        assert.equal(fs.existsSync(path.join(root, 'wizard-marker')), opens);
    });
}
