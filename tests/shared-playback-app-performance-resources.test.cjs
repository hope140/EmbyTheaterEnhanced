'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {nativePeak}=require('../tools/shared-playback-cache/app-performance-resources.cjs');
test('Native RSS observation targets only the live owned PID after timing with one bounded readonly query',async()=>{
  let calls=0;const bytes=await nativePeak({child:{pid:1234,exitCode:null},systemRoot:'C:\\Windows',run:async(file,args,options)=>{
    calls++;assert.equal(file,'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');assert.match(args[3],/Get-Process -Id 1234 /);
    assert.doesNotMatch(args.join(' '),/ExecutionPolicy|RunAs|taskkill|Stop-Process|Set-/);assert.equal(options.timeout,3000);return '1048576';}});
  assert.equal(bytes,1048576);assert.equal(calls,1);
});
test('denied/failed resource queries are not retried, escalated or replaced by zero',async()=>{
  let calls=0;await assert.rejects(nativePeak({child:{pid:1234,exitCode:null},systemRoot:'C:\\Windows',run:async()=>{calls++;throw Object.assign(Error(),{code:'EACCES'});}}),/app-owned-memory-query-failed/);assert.equal(calls,1);
});
test('dead, unknown and malformed targets/results reject without broad process lookup',async()=>{
  for(const child of [{pid:1234,exitCode:0},{pid:0,exitCode:null},{pid:'1234',exitCode:null}])await assert.rejects(nativePeak({child,systemRoot:'C:\\Windows',run:async()=>{assert.fail();}}));
  await assert.rejects(nativePeak({child:{pid:1,exitCode:null},systemRoot:'C:\\Windows',run:async()=> '0'}),/app-owned-memory-result/);
});
