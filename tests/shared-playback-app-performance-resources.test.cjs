'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {nativePeak}=require('../tools/shared-playback-cache/app-performance-resources.cjs');

const target=()=>({pid:1234,exitCode:null});

test('Native peak observation makes one bounded query for the known live owned PID',async()=>{
  let calls=0;const observations=[];
  const bytes=await nativePeak({child:target(),systemRoot:'C:\\Windows',onObservation:value=>observations.push(value),run:async(file,args,options)=>{
    calls++;
    assert.equal(file,'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    assert.match(args[3],/Get-Process -Id 1234 /);
    assert.doesNotMatch(args.join(' '),/ExecutionPolicy|RunAs|taskkill|Stop-Process|Set-/);
    assert.equal(options.timeout,3000);assert.equal(options.maxBuffer,1024);return '1048576';
  }});
  assert.equal(bytes,1048576);assert.equal(calls,1);
  assert.deepEqual(observations,[{stage:'result',reason:'measured',exit:0,code:null,signal:null,childBefore:'live',childAfter:'live'}]);
});

test('permission failures are classified once without exposing exception details or retrying',async()=>{
  for(const error of [Object.assign(Error('secret token https://private.invalid/x?token=secret'),{code:'EACCES'}),
    Object.assign(Error('sensitive'),{code:'EPERM'}),Object.assign(Error('denied'),{code:4,stderr:'ETE_ACCESS_DENIED'})]){
    let calls=0;const observations=[];
    await assert.rejects(nativePeak({child:target(),systemRoot:'C:\\Windows',onObservation:value=>observations.push(value),run:async()=>{calls++;throw error;}}),
      /^Error: app-owned-memory-query-denied$/);
    assert.equal(calls,1);assert.equal(observations.length,1);assert.equal(observations[0].reason,'denied');
    const record=JSON.stringify(observations[0]);assert.doesNotMatch(record,/private|token|secret|sensitive|https?:/);
    assert.ok(['EACCES','EPERM','EXIT_4'].includes(observations[0].code));
  }
});

test('timeout and unclassified failures are distinct and still perform no retry',async()=>{
  for(const [error,reason,expected] of [
    [Object.assign(Error('timed out'),{code:'ETIMEDOUT',signal:'SIGTERM',killed:true}),'timeout','app-owned-memory-query-timeout'],
    [Object.assign(Error('opaque failure https://private.invalid/?token=secret'),{code:'ENOENT'}),'unknown','app-owned-memory-query-unknown'],
  ]){
    let calls=0;const observations=[];
    await assert.rejects(nativePeak({child:target(),systemRoot:'C:\\Windows',onObservation:value=>observations.push(value),run:async(_file,_args,options)=>{
      calls++;assert.equal(options.timeout,3000);throw error;
    }}),new RegExp('^Error: '+expected+'$'));
    assert.equal(calls,1);assert.equal(observations.length,1);assert.equal(observations[0].reason,reason);
    assert.doesNotMatch(JSON.stringify(observations[0]),/private|token|secret|opaque/);
  }
});

test('a child that exits during the query is reported as target-exited',async()=>{
  const child=target(),observations=[];let calls=0;
  await assert.rejects(nativePeak({child,systemRoot:'C:\\Windows',onObservation:value=>observations.push(value),run:async()=>{
    calls++;child.exitCode=7;return '1048576';
  }}),/^Error: app-owned-memory-target-exited$/);
  assert.equal(calls,1);
  assert.deepEqual(observations,[{stage:'result',reason:'target-exited',exit:null,code:null,signal:null,childBefore:'live',childAfter:'exited'}]);
});

test('an explicit denial remains a denial even if the owned child then exits',async()=>{
  const child=target(),observations=[];let calls=0;
  await assert.rejects(nativePeak({child,systemRoot:'C:\\Windows',onObservation:value=>observations.push(value),run:async()=>{
    calls++;child.exitCode=0;throw Object.assign(Error('private'),{code:'EACCES'});
  }}),/^Error: app-owned-memory-query-denied$/);
  assert.equal(calls,1);assert.equal(observations[0].reason,'denied');assert.equal(observations[0].childAfter,'exited');
});

test('dead and malformed targets are rejected before a query',async()=>{
  for(const child of [{pid:1234,exitCode:0},{pid:0,exitCode:null},{pid:'1234',exitCode:null},null]){
    let calls=0;const observations=[];
    await assert.rejects(nativePeak({child,systemRoot:'C:\\Windows',onObservation:value=>observations.push(value),run:async()=>{calls++;}}));
    assert.equal(calls,0);assert.equal(observations.length,1);
    assert.ok(['target-exited','unknown'].includes(observations[0].reason));
  }
});

test('invalid measurements are unknown and never become a zero sample',async()=>{
  for(const text of ['0','', 'not a size','9007199254740992']){
    const observations=[];let calls=0;
    await assert.rejects(nativePeak({child:target(),systemRoot:'C:\\Windows',onObservation:value=>observations.push(value),run:async()=>{calls++;return text;}}),
      /^Error: app-owned-memory-query-unknown$/);
    assert.equal(calls,1);assert.equal(observations.length,1);assert.equal(observations[0].reason,'unknown');
  }
});
