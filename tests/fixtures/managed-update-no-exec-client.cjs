'use strict';
// Hosted diagnostic fixture only. Explicitly substitutes a marker-only guard;
// there is NO ShellExecute or executable launch in the substituted code.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
    process.env.ETE_MANAGED_UPDATE_NO_EXEC_LIFECYCLE !== '1' || process.argv.length !== 3) throw Error('hosted-diagnostic-only');
const root = fs.realpathSync.native(process.argv[2]);
if (!path.basename(root).startsWith('ete-no-exec-lifecycle-') || !root.startsWith(fs.realpathSync.native(require('node:os').tmpdir()) + path.sep)) throw Error('owned-root-required');
const guardPath = path.resolve(__dirname, '../../src/electronapp/enhanced/update-install-guard.cs');
const original = fs.readFileSync;
const source = `using System; using System.IO; public sealed class EteUpdateGuard:IDisposable {
 string root;
 public EteUpdateGuard(string r,string i,string v,string d,string n,bool c){root=r;Log("constructed");}
 void Log(string s){File.AppendAllText(Path.Combine(root,"trace"),s+"\\n");}
 public void Prepare(string n,string i,long s,string h,string z){Log("prepared");}
 public void OpenWizard(){Log("marker-only-no-execution");File.WriteAllText(Path.Combine(root,"marker"),"client-exited");}
 public void Dispose(){Log("disposed");}
}`;
fs.readFileSync = function(file, ...args) { return file === guardPath ? Buffer.from(source) : original.call(fs,file,...args); };
const handoff = require('../../src/electronapp/enhanced/update-install-handoff').createHandoff({spawn(exe,args,options) {
    const fd = fs.openSync(path.join(root,'relay-stderr'),'wx');
    try { return cp.spawn(exe,args,{...options, env:{...options.env,RUNNER_TRACKING_ID:process.env.RUNNER_TRACKING_ID}, stdio:['pipe','ignore',fd]}); }
    finally { fs.closeSync(fd); }
}});
(async()=>{
    const lease = await handoff.prepare({root, rootId:{dev:'1',ino:'1'},directory:root,directoryId:{ino:'2'},executable:process.execPath,fileId:{ino:'3'},source:'github',
        installer:{name:'EmbyTheaterEnhanced-9.1.0-win-x64-setup.exe',size:1,sha256:'a'.repeat(64),url:'https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v9.1.0/fixture.exe'}},new AbortController().signal);
    fs.writeFileSync(path.join(root,'guard-pid'),String(lease.processId));
    const deadline=Date.now()+15000;
    while(!fs.existsSync(path.join(root,'allow-exit')) && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,25));
    if(!fs.existsSync(path.join(root,'allow-exit'))){await lease.abort();throw Error('observer-not-ready');}
    await lease.commit();
    fs.writeFileSync(path.join(root,'committed'),'yes');
    // Deliberately natural exit; no app bootstrap or forced client termination.
})().catch(()=>{process.stderr.write('No-exec lifecycle fixture failed.\n');process.exitCode=1;});
