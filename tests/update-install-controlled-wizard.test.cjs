'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const hosted = process.platform === 'win32' && process.env.GITHUB_ACTIONS === 'true' && process.env.RUNNER_ENVIRONMENT === 'github-hosted' && process.env.ETE_MANAGED_UPDATE_WIZARD_TEST === '1';

test('hosted Windows real guard/ShellExecute starts an asInvoker probe after natural client exit and confirms cleanup', {
    skip: !hosted && 'Explicit hosted-Windows short validation only; no Work installation', timeout: 150000
}, async t => {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-controlled-wizard-')));
    // Everything is generated here and belongs to this disposable CI test.
    const marker = path.join(root, 'probe-started'), release = path.join(root, 'release-probe');
    const source = `using System; using System.IO; using System.Diagnostics; using System.Threading;
class Probe { static int Main() {
 string root = ${JSON.stringify(root)};
 int client = Int32.Parse(File.ReadAllText(Path.Combine(root,"client-pid")));
 bool alive = false; try { using(var p = Process.GetProcessById(client)) alive = !p.HasExited; } catch(ArgumentException) {}
 File.WriteAllText(Path.Combine(root,"probe-started.part"), (alive ? "running" : "exited") + "|" + Environment.GetCommandLineArgs().Length);
 File.Move(Path.Combine(root,"probe-started.part"),Path.Combine(root,"probe-started"));
 for(int i=0;i<800 && !File.Exists(Path.Combine(root,"release-probe"));i++) Thread.Sleep(25);
 return 0;
} }`;
    fs.writeFileSync(path.join(root, 'probe.cs'), '\ufeff' + source);
    fs.writeFileSync(path.join(root, 'probe.manifest'), '<?xml version="1.0" encoding="UTF-8"?><assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0"><trustInfo xmlns="urn:schemas-microsoft-com:asm.v3"><security><requestedPrivileges><requestedExecutionLevel level="asInvoker" uiAccess="false" /></requestedPrivileges></security></trustInfo></assembly>');
    const compiler = path.join(process.env.SystemRoot, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
    const compiled = spawnSync(compiler, ['/nologo', '/target:winexe', '/platform:x64', '/codepage:65001', '/win32manifest:' + path.join(root, 'probe.manifest'), '/out:' + path.join(root, 'probe.exe'), path.join(root, 'probe.cs')], {encoding: 'utf8', timeout: 60000, windowsHide: true});
    assert.equal(compiled.status, 0, JSON.stringify({stage: 'compile-owned-asInvoker-probe', error: compiled.error && compiled.error.code, signal: compiled.signal, stdout: compiled.stdout, stderr: compiled.stderr}));
    const driver = spawn(process.execPath, [path.join(__dirname, 'fixtures/managed-update-client.cjs'), root], {stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true});
    let errors = ''; driver.stderr.on('data', bytes => { errors += bytes.toString(); });
    const driverExit = new Promise((resolve, reject) => { driver.once('error', reject); driver.once('exit', resolve); });
    t.after(async () => {
        if (fs.existsSync(root)) fs.writeFileSync(release, 'finish owned probe');
        if (driver.exitCode === null && driver.signalCode === null) driver.kill();
        await driverExit;
        // On blocked OS security UI, leave the owned files for this disposable
        // job teardown. Never click/disable/accept a warning or kill system UI.
    });
    assert.equal(await driverExit, 0, errors);
    const deadline = Date.now() + 15000;
    while (!fs.existsSync(marker) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    if (!fs.existsSync(marker)) {
        const stages={};
        for(const name of ['shell-entered','shell-started','shell-exited','shell-error','script-error']) if(fs.existsSync(path.join(root,name))) stages[name]=fs.readFileSync(path.join(root,name),'utf8').slice(0,1000);
        process.stderr.write('ETE_NATIVE_DIAG controlled-shell='+JSON.stringify(stages)+'\n');
    }
    assert.equal(fs.existsSync(marker), true, 'Controlled ShellExecute produced no marker; keep security UI unchanged and inspect fixed stage/error diagnostics');
    assert.equal(fs.readFileSync(marker, 'utf8'), 'exited|1', 'client must be gone and installer arguments must be empty');
    const helper = JSON.parse(fs.readFileSync(path.join(root, 'helper-pid.json')));
    const observerScript = '$ErrorActionPreference="Stop"; $p=[Diagnostics.Process]::GetProcessById([int]$env:ETE_PROBE_PID); $null=$p.Handle; if(-not [String]::Equals($p.MainModule.FileName,$env:ETE_PROBE_EXE,[StringComparison]::OrdinalIgnoreCase)){throw "owner-mismatch"}; [Console]::Out.WriteLine("HELD"); [Console]::Out.Flush(); if(-not $p.WaitForExit(15000)){throw "owner-not-exited"}; if($p.ExitCode -ne 0){throw "owner-failed"}; $p.Dispose()';
    const observer = spawn(helper.exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', observerScript], {windowsHide: true, env: {...process.env, ETE_PROBE_PID: String(helper.pid), ETE_PROBE_EXE: helper.exe}, stdio: ['ignore', 'pipe', 'pipe']});
    const observedExit = new Promise((resolve, reject) => { observer.once('error', reject); observer.once('exit', resolve); });
    t.after(async () => { if (observer.exitCode === null && observer.signalCode === null) observer.kill(); await observedExit; });
    let output = '';
    await new Promise((resolve, reject) => {
        observer.stdout.on('data', bytes => { output += bytes; if (output.includes('HELD')) resolve(); });
        observedExit.then(() => { if (!output.includes('HELD')) reject(Error('Unable to capture owned helper handle')); });
    });
    fs.writeFileSync(release, 'finish owned probe'); assert.equal(await observedExit, 0);
    const downloaded = JSON.parse(fs.readFileSync(path.join(root, 'committed.json')));
    const store = require('../src/electronapp/enhanced/update-install-cache').createStore({profileRoot: path.join(root, 'profile'), executable: process.execPath,
        handoff: require('../src/electronapp/enhanced/update-install-handoff').createHandoff()});
    assert.deepEqual(await store.reconcile('9.0.0'), {removed: 0, retained: 1});
    assert.equal(fs.existsSync(path.join(downloaded.directory, downloaded.installer.name)), true);
    assert.deepEqual(await store.reconcile('9.1.0'), {removed: 1, retained: 0});
    assert.equal(fs.existsSync(downloaded.directory), false);
    // Successful controlled path releases all handles before removing only our scratch.
    fs.rmSync(root, {recursive: true});
});
