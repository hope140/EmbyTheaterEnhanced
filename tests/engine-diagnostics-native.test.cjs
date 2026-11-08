'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
test('exact native projection, scrubber, startup windows and error-priority bounds compile and execute offline', t=>{
    const root=path.resolve(__dirname,'..');
    const pinned=path.join(root,'.work/toolchain/msys2/ucrt64/bin/g++.exe');
    const compiler=process.env.ETE_DIAGNOSTIC_CXX || (process.platform==='win32' && fs.existsSync(pinned)?pinned:process.platform==='win32'?'C:/msys64/ucrt64/bin/g++.exe':'g++');
    const env={...process.env,PATH:path.dirname(compiler)+path.delimiter+process.env.PATH};
    const version=cp.spawnSync(compiler,['--version'],{encoding:'utf8',env,windowsHide:true});
    if(version.error){t.skip('C++ compiler unavailable; native gate must run on the Windows build host');return;}
    const work=fs.mkdtempSync(path.join(os.tmpdir(),'ete-engine-core-'));t.after(()=>fs.rmSync(work,{recursive:true,force:true}));
    const source=fs.readFileSync(path.join(root,'native/mpv-helper/ete-mpv-helper.cpp'),'utf8');
    const section=(a,b)=>{assert.ok(source.includes(a)&&source.includes(b));return source.slice(source.indexOf(a),source.indexOf(b));};
    const core=section('std::string quote(', 'struct Json {')+'\n'+section('struct NetworkLogProjection {','// END NETWORK_LOG_CORE')+'\n'+section('// BEGIN ENGINE_DIAGNOSTIC_CORE','// END ENGINE_DIAGNOSTIC_CORE');
    fs.writeFileSync(path.join(work,'engine-core-under-test.h'),core);
    const exe=path.join(work,process.platform==='win32'?'probe.exe':'probe');
    const build=cp.spawnSync(compiler,['-std=c++17','-O2','-Wall','-Wextra','-Werror','-I'+work,path.join(root,'tests/helpers/engine-diagnostics-core-probe.cpp'),'-o',exe],{encoding:'utf8',env,windowsHide:true,timeout:60000});
    assert.equal(build.status,0,build.stdout+build.stderr);
    const run=cp.spawnSync(exe,[],{encoding:'utf8',env,windowsHide:true,timeout:60000});assert.equal(run.status,0,run.stdout+run.stderr);
    const measured=JSON.parse(run.stdout.trim());assert.equal(measured.retainedRecords,64);assert.ok(measured.snapshotBytes<65536);
    t.diagnostic('Synthetic CPU/retention measurement: '+JSON.stringify(measured));
});
