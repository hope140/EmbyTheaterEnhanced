'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
test('production app alias retains the namespace consumed by native ItemPage', {timeout:5000},async()=>{
 const requested=[],base='file:///synthetic/electronapp/www/';
 const context=vm.createContext({URL,Promise,AbortController,WeakMap,console,setTimeout,clearTimeout,window:{},document:{
  createElement(tag){assert.equal(tag,'script');const listeners=new Map();return {addEventListener(name,fn){listeners.set(name,fn);},fire(name){listeners.get(name)?.({target:this,type:name});}};},
  head:{appendChild(script){const relative=new URL(script.src,base).pathname.replace('/synthetic/','src/');if(!['src/electronapp/enhanced/detail-cache/store.js','src/electronapp/enhanced/detail-cache/page.js'].includes(relative)){queueMicrotask(()=>script.fire('error'));return;}
   requested.push(relative);vm.runInContext(fs.readFileSync(path.join(root,relative),'utf8'),context,{filename:relative});queueMicrotask(()=>script.fire('load'));}}
 }});
 vm.runInContext(fs.readFileSync(path.join(root,'vendor/web-snapshot/www/modules/alameda/alameda.js'),'utf8'),context);
 context.require.config({baseUrl:base,noRequireCss:true});
 context.define('modules/emby-apiclient/connectionmanager.js',[],()=>({default:{currentApiClient:()=>null}}));
 context.define('modules/emby-apiclient/events.js',[],()=>({default:{on(){},off(){}}}));
 const app=fs.readFileSync(path.join(root,'vendor/web-snapshot/www/app.js'),'utf8'),patched=require('../tools/patch-server-home.cjs').patchApp(app);
 const helpers=app.slice(app.indexOf('  function returnFirstDependencyDefault('),app.indexOf('  function enableNativeGamepadKeyMapping('))+app.slice(app.indexOf('  function getDynamicImportWithoutExport('),app.indexOf('  function loadAppStorage('));
 const aliases=patched.split('\n').filter(line=>/define\("ete-detail-(?:cache-store|page-cache)",/.test(line)).map(line=>line.trim().replace(/,$/,';')).join('\n');
 vm.runInContext(helpers+'\n'+aliases,context);
 const namespace=await context.require(['ete-detail-page-cache'],value=>value);
 assert.equal(typeof namespace.default?.create,'function');
 const helper=namespace.default.create({view:{},params:{}},{});assert.equal(typeof helper.begin,'function');helper.dispose();
 const canonical=await context.require(['../enhanced/detail-cache/page.js'],value=>value);assert.equal(namespace,canonical);
 assert.equal(requested.filter(name=>name.endsWith('/page.js')).length,1);assert.equal(requested.filter(name=>name.endsWith('/store.js')).length,1);
});
