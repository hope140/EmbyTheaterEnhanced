'use strict';
// Owned synthetic client for the hosted-Windows test ONLY; no Electron/bootstrap,
// public downloads, real installer, UI automation or policy changes.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
    process.env.ETE_MANAGED_UPDATE_WIZARD_TEST !== '1' || process.argv.length !== 3) throw Error('hosted-test-only');
const root = fs.realpathSync.native(process.argv[2]);
if (!path.basename(root).startsWith('ete-controlled-wizard-') || !root.startsWith(fs.realpathSync.native(require('node:os').tmpdir()) + path.sep)) throw Error('owned-root-required');
const bytes = fs.readFileSync(path.join(root, 'probe.exe'));
const name = 'EmbyTheaterEnhanced-9.1.0-win-x64-setup.exe';
const installer = {id: 12, name, url: 'https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v9.1.0/' + name,
    size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')};
// Trace-only source instrumentation in this fixture; the real native guard,
// locks, Zone3 and ShellExecute statement remain unchanged. No production hook.
const nativePath=path.resolve(__dirname,'../../src/electronapp/enhanced/update-install-guard.cs');
const scriptPath=path.resolve(__dirname,'../../src/electronapp/enhanced/update-install-handoff.ps1');
const originalRead=fs.readFileSync;
fs.readFileSync=function(file,...args){
    const value=originalRead.call(fs,file,...args);
    if(file===nativePath){
        const source=value.toString();
        const boundary='using (var process = Process.Start(start)) { Require(process != null); process.WaitForExit(); }';
        if(source.split(boundary).length!==2)throw Error('exact-shell-boundary-required');
        const log=name=>JSON.stringify(path.join(root,name));
        const traced='File.WriteAllText('+log('shell-entered')+',"entered"); try { using (var process = Process.Start(start)) { Require(process != null); File.WriteAllText('+log('shell-started')+',process.Id.ToString()); process.WaitForExit(); File.WriteAllText('+log('shell-exited')+',process.ExitCode.ToString()); } } catch(Exception e) { var native=e as System.ComponentModel.Win32Exception; File.WriteAllText('+log('shell-error')+',e.GetType().FullName+"|"+e.HResult+"|"+(native==null?"none":native.NativeErrorCode.ToString())); throw; }';
        return Buffer.from(source.replace(boundary,traced));
    }
    if(file===scriptPath){
        const destination=Buffer.from(path.join(root,'script-error'),'utf8').toString('base64');
        const boundary='} catch {\n    # Keep the verified';
        const normalized=value.replace(/\r\n/g,'\n');
        if(normalized.split(boundary).length!==2)throw Error('exact-error-boundary-required');
        return normalized.replace(boundary,"} catch {\n    $diagnostic=$_.Exception.GetType().FullName+'|'+$_.Exception.HResult; if($_.Exception.InnerException){$diagnostic+='|'+$_.Exception.InnerException.GetType().FullName+'|'+$_.Exception.InnerException.HResult}; [IO.File]::WriteAllText([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('"+destination+"')),$diagnostic)\n    # Keep the verified");
    }
    return value;
};
const update = require('../../src/electronapp/enhanced/manual-app-update');
const handoff = require('../../src/electronapp/enhanced/update-install-handoff').createHandoff({spawn(exe, args, options) {
    // Keep this test-owned orphan in the hosted runner's teardown ownership.
    // Production's credential/environment whitelist remains unchanged.
    const fd=fs.openSync(path.join(root,'relay-stderr'),'wx');
    let child;
    try { child=cp.spawn(exe,args,{...options,env:{...options.env,RUNNER_TRACKING_ID:process.env.RUNNER_TRACKING_ID},stdio:['pipe','ignore',fd]}); } finally { fs.closeSync(fd); }
    if (child.pid) fs.writeFileSync(path.join(root, 'helper-pid.json'), JSON.stringify({pid: child.pid, exe}));
    return child;
}});
const profileRoot = path.join(root, 'profile'); fs.mkdirSync(profileRoot);
const store = require('../../src/electronapp/enhanced/update-install-cache').createStore({profileRoot, executable: process.execPath, handoff,
    downloadInstaller: async (asset, directory) => {
        const file = path.join(directory, asset.name); fs.writeFileSync(file, bytes, {flag: 'wx'});
        fs.writeFileSync(file + ':Zone.Identifier', update.internetZone(asset.url), {flag: 'wx'});
        return {source: 'github'};
    }});
(async () => {
    const request = {currentVersion: '9.0.0', targetVersion: '9.1.0', tag: 'v9.1.0', signal: new AbortController().signal};
    const record = await store.download(installer, request);
    fs.writeFileSync(path.join(root, 'client-pid'), String(process.pid));
    const lease = await store.prepare(record, request.signal);
    const launched = JSON.parse(fs.readFileSync(path.join(root, 'helper-pid.json')));
    fs.writeFileSync(path.join(root, 'helper-pid.json'), JSON.stringify({...launched, pid: lease.processId}));
    await lease.commit();
    fs.writeFileSync(path.join(root, 'committed.json'), JSON.stringify({directory: record.directory, installer}));
    // Natural Node exit after the real handoff detaches; no forced exit/kill.
})().catch(error => { process.stderr.write('Controlled client handoff failed: '+String(error.code||error.message).slice(0,160)+'\n'); process.exitCode = 1; });
