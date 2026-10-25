'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {observeExpression}=require('../tools/shared-playback-cache/windows-smoke.cjs');
function fixture(value) {const reports=[];return {reports,context:{window:{target:()=>value,prefixHarness:{report:v=>reports.push(v.code)}},Promise}};}
test('evaluation diagnostics retain the original Promise and distinguish entry, return and settlement',async()=>{
 let resolve;const promise=new Promise(r=>{resolve=r;}),f=fixture(promise);
 const actual=vm.runInNewContext(observeExpression('window.target()','seek-unpause'),f.context);
 assert.equal(actual,promise);assert.deepEqual(f.reports,['entered','returned']);
 resolve(42);assert.equal(await actual,42);await Promise.resolve();assert.deepEqual(f.reports,['entered','returned','settled']);
});
test('evaluation diagnostics preserve rejected and synchronous failure outcomes',async()=>{
 const rejected=Promise.reject(Error('actual-rejection')),f=fixture(rejected);
 const actual=vm.runInNewContext(observeExpression('window.target()','stop-command'),f.context);
 assert.equal(actual,rejected);await assert.rejects(actual,/actual-rejection/);await Promise.resolve();assert.deepEqual(f.reports,['entered','returned','rejected']);
 const s=fixture(null);assert.throws(()=>vm.runInNewContext(observeExpression('(() => {throw Error("sync");})()','stop-command'),s.context),/sync/);assert.deepEqual(s.reports,['entered']);
});
