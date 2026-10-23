'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const host=require('../tools/windows-host-input.cjs'),exclusions=require('../tools/runtime-exclusions.cjs');
const root=path.resolve(__dirname,'..');
for(const expected of host.RETIRED_CEC)for(const mutation of ['hash','size','case'])test('CEC projection rejects altered '+mutation+': '+expected.path,()=>{
    const changed={...expected};if(mutation==='hash')changed.sha256='0'.repeat(64);if(mutation==='size')changed.size++;if(mutation==='case')changed.path=changed.path.toUpperCase();
    assert.throws(()=>host.runtimeSelection({files:[changed]}),/projection identity mismatch/);
});
test('all ten CEC runtime consumers are explicitly forbidden; deletion cannot hide bad assembly',t=>{
    assert.equal(exclusions.RETIRED_CEC_RUNTIME_PATHS.length,10);
    for(const c of host.RETIRED_CEC)assert.ok(exclusions.RETIRED_CEC_RUNTIME_PATHS.includes(c.path));
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ete-cec-exclusion-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
    const target=path.join(temp,'cec/cec.dll');fs.mkdirSync(path.dirname(target));fs.writeFileSync(target,'unknown-owned-fixture');
    assert.equal(exclusions.verify(temp).status,'failed');assert.throws(()=>exclusions.remove(temp),/must be omitted by assembly/);assert.equal(fs.readFileSync(target,'utf8'),'unknown-owned-fixture');
});
test('installer exact identities agree with generated Pascal and official binary inputs',()=>{
    const retired=JSON.parse(fs.readFileSync(path.join(root,'installer/retired-runtime.json'))),pascal=fs.readFileSync(path.join(root,'installer/retired-runtime-identities.iss'),'utf8');
    assert.equal(retired.files.length,14);assert.deepEqual(retired.files.map(f=>f.path).sort(),[host.PRIVATE_CONFIGURATION.path,...exclusions.RETIRED_CEC_RUNTIME_PATHS,...host.RETIRED_SERIALIZATION.map(f=>f.path)].sort());
    for(const [i,f]of retired.files.entries()) {
        assert.ok(pascal.includes(i+": Result := '"+f.path.replaceAll('/','\\')+"';"));assert.ok(pascal.includes(i+": Result := '"+f.sha256+"';"));
        const official=host.EXCLUDED_FILES.find(x=>x.path===f.path);
        if(official)assert.deepEqual({path:f.path,size:f.size,sha256:f.sha256},{path:official.path,size:official.size,sha256:official.sha256});
        else {assert.match(f.predecessor.commit,/^[a-f0-9]{40}$/);assert.match(f.predecessor.gitBlob,/^[a-f0-9]{40}$/);assert.equal(f.predecessor.path,'src/'+f.path);}
    }
});
test('installer checks before install and retires only after payload copy, retaining existing guards',()=>{
    const setup=fs.readFileSync(path.join(root,'installer/EmbyTheaterEnhanced.iss'),'utf8'),cleanup=fs.readFileSync(path.join(root,'installer/retired-runtime.iss'),'utf8');
    assert.match(setup,/if Result = '' then Result := CheckRetiredRuntime/);assert.match(setup,/if CurStep = ssPostInstall then RetireKnownRuntime/);
    assert.match(cleanup,/RetiredTargetIsOwned/);assert.match(cleanup,/GetSHA256OfFile/);assert.match(cleanup,/RetiredPathIsPhysical/);assert.match(cleanup,/GuardCreateFile/);
    assert.doesNotMatch(cleanup,/DelTree|RemoveDirectory|Exec\(|ShellExec|Uninstall.*Driver|DPInst/i);
});

for(const expected of host.RETIRED_SERIALIZATION)for(const mutation of ['hash','size','case'])test('retired serializer projection rejects altered '+mutation+': '+expected.path,()=>{
 const changed={...expected};if(mutation==='hash')changed.sha256='0'.repeat(64);if(mutation==='size')changed.size++;if(mutation==='case')changed.path=changed.path.toUpperCase();
 assert.throws(()=>host.runtimeSelection({files:[changed]}),/projection identity mismatch/);
});
