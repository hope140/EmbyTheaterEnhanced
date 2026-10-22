'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),web=require('../tools/web-snapshot-input.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const record=JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/legacy-snapshot-v2.json')));
test('exactly fifteen reviewed old bodies leave the current tree and all three historical manifests retain exact bytes',()=>{
    assert.equal(record.removedOldBodies.length,15);assert.deepEqual(record.removedOldBodies.reduce((m,e)=>(m[e.component]=(m[e.component]||0)+1,m),{}),{'compatibility-resources':9,'small-runtime':4,'web-snapshot':2});
    const oldNonempty=new Set(record.removedOldBodies.filter(x=>x.size).map(x=>x.sha256));
    for(const entry of record.removedOldBodies)assert.equal(fs.existsSync(path.join(root,entry.previousPath)),false,entry.previousPath);
    for(const [name,count]of Object.entries({'compatibility-resources':39,'small-runtime':2,'web-snapshot':718})){
        const input=require('../tools/'+name+'-input.cjs'),manifest=input.load(root),previous=record.components[name];
        assert.equal(manifest.version,'snapshot-v2');assert.equal(manifest.fileCount,count);assert.equal(input.validate(root).status,'passed');assert.deepEqual(input.validate(root).migration,manifest.migration);
        assert.equal(sha(fs.readFileSync(path.join(root,previous.historicalManifestPath))),previous.historicalManifestSha256);
        const old=JSON.parse(fs.readFileSync(path.join(root,previous.historicalManifestPath)));
        for(const entry of manifest.files){const bytes=fs.readFileSync(path.join(root,manifest.inputRoot,entry.path));if(oldNonempty.has(sha(bytes))){const retained=old.files.find(x=>x.path===entry.path);assert.ok(retained,'new location disguises an old body: '+entry.path);assert.equal(retained.sha256,entry.sha256,'pre-existing active bytes must remain unchanged');}}
    }
});
test('current app and index remove obsolete consumers and retain previously approved output identities',()=>{
    const app=fs.readFileSync(path.join(root,web.WEB_ROOT,'app.js'),'utf8'),index=fs.readFileSync(path.join(root,web.WEB_ROOT,'index.html'),'utf8');
    assert.doesNotMatch(app,/CustomCssJS/);assert.doesNotMatch(index,/modules\/themes\/logo\.png/);assert.match(index,/\.\.\/enhanced\/startup\.svg/);
    assert.equal(fs.existsSync(path.join(root,'src/electronapp/enhanced/startup.svg')),true);
    for(const entry of record.webReferenceRewrites)assert.equal(sha(fs.readFileSync(path.join(root,web.INPUT_ROOT,entry.path))),entry.afterSha256);
});
for(const mutation of ['old-version','missing-history','changed-history','changed-retained','removed-retained','added-retired'])test('v2 '+mutation+' is rejected before copying',t=>{
    const dir=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-v2-migration-')));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
    const manifest={schemaVersion:1,inputRoot:web.INPUT_ROOT,files:[{path:'www/keep.js',size:1,sha256:sha(Buffer.from('a'))}],userPatches:[],fileCount:1,bytes:1};manifest.treeSha256=web.treeHash(manifest.files);
    require('./helpers/snapshot-history-fixture.cjs').attach(dir,'web-snapshot',manifest);
    fs.mkdirSync(path.join(dir,web.INPUT_ROOT,'www'),{recursive:true});fs.writeFileSync(path.join(dir,web.INPUT_ROOT,'www/keep.js'),'a');
    if(mutation==='old-version')manifest.version='snapshot-v1';
    if(mutation==='missing-history')fs.unlinkSync(path.join(dir,manifest.migration.historicalManifestPath));
    if(mutation==='changed-history')fs.appendFileSync(path.join(dir,manifest.migration.historicalManifestPath),'changed');
    if(mutation==='changed-retained')manifest.files[0].sha256='0'.repeat(64);
    if(mutation==='removed-retained'){manifest.files[0].path='www/other.js';}
    if(mutation==='added-retired')manifest.files.push({path:'www/modules/themes/logo.png',size:1,sha256:sha(Buffer.from('a'))});
    manifest.fileCount=manifest.files.length;manifest.bytes=manifest.files.reduce((n,e)=>n+e.size,0);manifest.treeSha256=web.treeHash(manifest.files);
    fs.writeFileSync(path.join(dir,web.MANIFEST_PATH),JSON.stringify(manifest));
    const out=path.join(dir,'dist/candidate');assert.throws(()=>web.assemble(dir,out));assert.equal(fs.existsSync(out),false);
});
