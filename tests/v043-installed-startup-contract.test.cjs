'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),path=require('node:path');
const script=path.resolve(__dirname,'../tools/check-v043-installed-startup.ps1');
const available=cp.spawnSync('pwsh',['-NoProfile','-Command','$PSVersionTable.PSVersion.ToString()'],{encoding:'utf8'});
test('installed-startup pure contracts reject traversal/device names/digest drift and compile the exact Windows declarations without installing', {skip:!!available.error},()=>{
 const r=cp.spawnSync('pwsh',['-NoProfile','-File',script,'-ContractSelfTest'],{encoding:'utf8',timeout:30000});
 assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/CONTRACT_SELFTEST_PASSED/);
});
test('normal entry with no artifact identity fails before creating output or attempting installation', {skip:!!available.error},()=>{
 const r=cp.spawnSync('pwsh',['-NoProfile','-File',script],{encoding:'utf8',timeout:30000});
 assert.equal(r.error,undefined);assert.notEqual(r.status,0);assert.match(r.stderr,/HOSTED_WINDOWS_REQUIRED|REPOSITORY_MISMATCH|EXACT_INPUTS_REQUIRED/);
});
