'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {bindRootRequest}=require('../tools/shared-playback-cache/windows-ci-root.cjs');
const {acquireGuard}=require('../src/electronapp/enhanced/playback-range-identity');
const createRoot=()=>require('./helpers/range-fixture-root.cjs').temporaryRoot('ete-shared-app-',
  [0,1].map(index=>'performance/profile-'+index+'/userdata/shared-playback-byte-cache-v2'));

test('explicit entry admission binds and closes the exact real product guards before emitting the owned root',async()=>{
  const roots=[],out=[],err=[];let result;
  try {
    result=await bindRootRequest('performance','entry',{createRoot,acquireGuard:async root=>{roots.push(root);return acquireGuard(root);},writeOut:r=>out.push(r),writeErr:r=>err.push(r)});
    assert.equal(roots.length,2);assert.equal(out.length,1);assert.deepEqual(JSON.parse(out[0]),result);
    assert.deepEqual(roots,[0,1].map(index=>path.join(result.path,'performance','profile-'+index,'userdata','shared-playback-byte-cache-v2')));
    assert.deepEqual(fs.readdirSync(result.path),[]);
    const row=JSON.parse(err[0]);assert.equal(row.bindRetries,0);assert.equal(row.guardsClosed,true);assert.equal(row.exactProductGuards,2);
    // The real product guard can be reacquired now, proving the preflight
    // did not retain a lock that would block actual playback cache ownership.
    for(const root of roots){const guard=await acquireGuard(root);await guard.close();}
  }finally{if(result)fs.rmdirSync(result.path);}
});

test('a real occupied second guard fails once, closes the first and emits no success root',async()=>{
  let calls=0,ownedRoot,firstPath,contender;const out=[];
  try {
    await assert.rejects(bindRootRequest('performance','entry',{createRoot,acquireGuard:async root=>{
      calls++;ownedRoot=path.resolve(root,'../../../..');
      if(calls===1){firstPath=root;return acquireGuard(root);}
      contender=await acquireGuard(root);return acquireGuard(root);
    },writeOut:r=>out.push(r),writeErr(){}}),/windows-ci-root-bind-eaddrinuse/);
    assert.equal(calls,2);assert.deepEqual(out,[]);assert.equal(fs.existsSync(ownedRoot),false);
    const first=await acquireGuard(firstPath);await first.close();
  }finally{if(contender)await contender.close();}
});

test('a permission error stops without selecting another root or retrying any bind',async()=>{
  let calls=0,closed=0,ownedRoot;const out=[];
  await assert.rejects(bindRootRequest('performance','entry',{acquireGuard:async root=>{
    calls++;ownedRoot=path.resolve(root,'../../../..');
    if(calls===1)return {close:async()=>{closed++;}};
    throw Object.assign(Error('private machine detail'),{code:'EACCES'});
  },writeOut:r=>out.push(r),writeErr(){}}),/^Error: windows-ci-root-bind-eacces$/);
  assert.equal(calls,2);assert.equal(closed,1);assert.deepEqual(out,[]);assert.equal(fs.existsSync(ownedRoot),false);
});

test('undefined rejection and uncertain guard closure cannot emit an admission success',async()=>{
  for(const rejectClose of [false,true]){
    let root,calls=0;const out=[];
    await assert.rejects(bindRootRequest('performance','entry',{acquireGuard:async value=>{
      root=path.resolve(value,'../../../..');calls++;
      if(!rejectClose)throw undefined;
      return {close:()=>Promise.reject(Error('unconfirmed-close'))};
    },writeOut:r=>out.push(r),writeErr(){}}),/windows-ci-root-bind-failed/);
    assert.equal(calls,rejectClose?2:1);assert.deepEqual(out,[]);assert.equal(fs.existsSync(root),false);
  }
});

test('the explicit bind mode is entry-only and the real CLI emits one JSON control record',async()=>{
  let called=0;
  await assert.rejects(bindRootRequest('performance','matrix',{acquireGuard:()=>{called++;}}),/bind-entry-only/);assert.equal(called,0);
  const script=require.resolve('../tools/shared-playback-cache/windows-ci-root.cjs');
  const result=spawnSync(process.execPath,[script,'performance','entry','--bind-guards'],{encoding:'utf8',timeout:10000});
  assert.equal(result.error,undefined);assert.equal(result.signal,null);
  if(process.platform==='win32'&&result.status!==0){
    // A fresh random Windows path can map to a reserved/occupied guard. This
    // is an observed fail-closed admission, not a retry or successful launch.
    assert.equal(result.status,1);assert.equal(result.stdout,'');assert.match(result.stderr,/^windows-ci-root-bind-(eacces|eperm|eaddrinuse)\r?\n$/);return;
  }
  assert.equal(result.status,0);
  const lines=result.stdout.trimEnd().split(/\r?\n/);assert.equal(lines.length,1);
  const root=JSON.parse(lines[0]);try{assert.equal(root.kind,'performance');assert.equal(root.schema,1);assert.equal(path.isAbsolute(root.path),true);}
  finally{fs.rmdirSync(root.path);}
});
