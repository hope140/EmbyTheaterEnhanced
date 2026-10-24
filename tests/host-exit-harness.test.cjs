'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const tool=require('../tools/host-exit-harness.cjs'),root=path.resolve(__dirname,'..');
const current=fs.readFileSync(path.join(root,'native/windows-host/changes/Emby.Theater/Program.cs'),'utf8');
const old=cp.execFileSync('git',['-C',root,'show','abe1c7426f0c8d0b5d1f7febadd0d39fb9a80a1d:native/windows-host/changes/Emby.Theater/Program.cs'],{encoding:'utf8'});
test('real-loop harness embeds selected exact production methods for both source revisions; it never substitutes fake Forms or Dispatcher',()=>{
 const before=tool.build(old),after=tool.build(current);assert.equal(before.fixed,false);assert.equal(after.fixed,true);assert.notEqual(before.methodSha256,after.methodSha256);
 for(const signature of ['private static void InitializeExitDispatcher()','private static void OnExitIdle(object sender, EventArgs e)','private static void ExitWhenMessageLoopReady()','private static void RunApplicationLoop(ApplicationContext context)','public static void Exit()'])assert.ok(after.code.includes(tool.method(current,signature)));
 assert.doesNotMatch(after.code,/namespace System\.Windows|class Dispatcher|class Application\b/);assert.match(after.code,/Program\.RunForHarness\(new ApplicationContext\(\)\)/);
 assert.match(after.code,/child\.Exited\+=/);assert.match(after.code,/watchdog=true;Application\.ExitThread\(\)/);
});
test('harness refuses missing or partial production exit implementation before any compiler or process starts',()=>{
 assert.throws(()=>tool.build('class Example {}'),/Exit missing/);
 const helper=tool.method(current,'private static void OnExitIdle(object sender, EventArgs e)');assert.throws(()=>tool.build(current.replace(helper,'')),/Incomplete/);
 assert.throws(()=>tool.method('public static void Exit(){','public static void Exit()'),/Unbalanced/);
});
