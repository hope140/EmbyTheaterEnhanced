'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const web = require('../tools/web-snapshot-input.cjs');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function fixture(t) {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-web-component-')));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const data = new Map([['www/index.html',Buffer.from('\ufeff<html>\r\n</html>')],['www/empty.js',Buffer.alloc(0)],
        ['www/images/data.bin',Buffer.from([0,255,13,10,0])],['user-patches/client.js',Buffer.from('user increment')]]);
    const entries = [...data].map(([name,bytes])=>({path:name,size:bytes.length,sha256:sha(bytes),originalPath:name.startsWith('www/')?'electronapp/'+name:'payload/'+name}));
    for (const [name,bytes] of data) { const file=path.join(root,web.INPUT_ROOT,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes); }
    const files=entries.filter(e=>e.path.startsWith('www/'));
    const manifest={schemaVersion:1,inputRoot:web.INPUT_ROOT,fileCount:files.length,bytes:files.reduce((n,f)=>n+f.size,0),treeSha256:web.treeHash(files),files,userPatches:entries.filter(e=>!files.includes(e))};
    fs.writeFileSync(path.join(root,web.MANIFEST_PATH),JSON.stringify(manifest));
    return {root,data,manifest,output:path.join(root,'dist/component')};
}
test('Web component assembles byte-identical binary, empty and BOM/CRLF files with no legacy materials',t=>{
    const f=fixture(t);
    assert.equal(fs.existsSync(path.join(f.root,'vendor/carnival')),false);
    assert.equal(fs.existsSync(path.join(f.root,'vendor/patch')),false);
    assert.equal(web.assemble(f.root,f.output).fileCount,3);
    for(const [name,bytes]of f.data) {
        if(name.startsWith('www/')) assert.deepEqual(fs.readFileSync(path.join(f.output,'electronapp',name)),bytes);
    }
    assert.equal(fs.existsSync(path.join(f.output,'user-patches')),false);
    assert.throws(()=>web.assemble(f.root,f.output),/absent www/);
});
for(const mutation of ['changed','missing','extra','patch-changed'])test('component rejects '+mutation+' before output exists',t=>{
    const f=fixture(t),base=path.join(f.root,web.INPUT_ROOT);
    if(mutation==='changed')fs.writeFileSync(path.join(base,'www/index.html'),'different');
    if(mutation==='missing')fs.unlinkSync(path.join(base,'www/empty.js'));
    if(mutation==='extra')fs.writeFileSync(path.join(base,'www/unexpected.js'),'extra');
    if(mutation==='patch-changed')fs.writeFileSync(path.join(base,'user-patches/client.js'),'different');
    assert.throws(()=>web.assemble(f.root,f.output),/snapshot input|snapshot identity/);
    assert.equal(fs.existsSync(f.output),false);
});
test('component rejects duplicate, retired and escaping manifest entries',t=>{
    const f=fixture(t);
    for(const name of ['www/../outside','www/modules/externalplayer/old.js','www/INDEX.HTML']) {
        const files=[...f.manifest.files,{...f.manifest.files[0],path:name}];
        const bad={...f.manifest,files,fileCount:files.length,bytes:files.reduce((n,f)=>n+f.size,0),treeSha256:web.treeHash(files)};
        fs.writeFileSync(path.join(f.root,web.MANIFEST_PATH),JSON.stringify(bad));
        assert.throws(()=>web.validate(f.root),/Invalid|summary mismatch/);
    }
});
test('component rejects a redirected input directory and outputs outside dedicated dist',t=>{
    const f=fixture(t),input=path.join(f.root,web.INPUT_ROOT),saved=path.join(f.root,'saved-input');
    assert.throws(()=>web.assemble(f.root,path.join(f.root,'src')),/dedicated dist/);
    fs.renameSync(input,saved);
    fs.symlinkSync(saved,input,process.platform==='win32'?'junction':'dir');
    assert.throws(()=>web.validate(f.root),/links or redirects/);
});
test('one-time import checks all identities before creating input and never overwrites',t=>{
    const f=fixture(t),input=path.join(f.root,web.INPUT_ROOT),saved=path.join(f.root,'saved-input');
    fs.renameSync(input,saved);
    const old=path.join(f.root,'old');
    for(const entry of [...f.manifest.files,...f.manifest.userPatches]) {
        const file=path.join(old,entry.originalPath);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,f.data.get(entry.path));
    }
    const first=path.join(old,f.manifest.files[0].originalPath);
    fs.writeFileSync(first,'changed');
    assert.throws(()=>web.importSnapshot(f.root,old,old),/import identity mismatch/);
    assert.equal(fs.existsSync(input),false);
    fs.writeFileSync(first,f.data.get(f.manifest.files[0].path));
    assert.equal(web.importSnapshot(f.root,old,old).status,'passed');
    assert.throws(()=>web.importSnapshot(f.root,old,old),/already exists/);
});

test('independent Web restoration uses no legacy layout and preserves all raw and user-patch bytes',t=>{
    const f=fixture(t),input=path.join(f.root,web.INPUT_ROOT),saved=path.join(f.root,'independent-source');
    fs.renameSync(input,saved);
    assert.equal(web.restoreSnapshot(f.root,saved).status,'passed');
    for(const [name,bytes]of f.data)assert.deepEqual(fs.readFileSync(path.join(input,name)),bytes);
    assert.equal(fs.existsSync(path.join(f.root,'vendor/carnival')),false);
    assert.equal(fs.existsSync(path.join(f.root,'vendor/patch')),false);
    assert.throws(()=>web.restoreSnapshot(f.root,saved),/already exists/);
});

test('independent Web restoration preflights user patches and extra files before any writes',t=>{
    const f=fixture(t),input=path.join(f.root,web.INPUT_ROOT),saved=path.join(f.root,'independent-source');
    fs.renameSync(input,saved);fs.appendFileSync(path.join(saved,'user-patches/client.js'),'changed');
    assert.throws(()=>web.restoreSnapshot(f.root,saved),/identity/);assert.equal(fs.existsSync(input),false);
    fs.writeFileSync(path.join(saved,'user-patches/client.js'),f.data.get('user-patches/client.js'));
    fs.writeFileSync(path.join(saved,'unexpected'),'extra');
    assert.throws(()=>web.restoreSnapshot(f.root,saved),/snapshot input/);assert.equal(fs.existsSync(input),false);
});
