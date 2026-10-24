'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),plugin=path.join(root,'src/electronapp/plugins/mpvplayer');
const source=fs.readFileSync(path.join(plugin,'cache-settings.js'),'utf8');
function gate(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function flush(){for(let i=0;i<35;i++)await Promise.resolve();}
function fixture(){
 const nodes=new Map(),calls=[],owners=[];let onClear=null,layoutFails=false,httpFails=false,httpHeld=null,httpMeasurementUnavailable=false;
 const info={status:'ok',entries:1,serializedBytes:512,enabledOwners:1,maxEntries:2,maxSerializedBytes:4096,pending:0};
 const pages={snapshot:()=>({...info}),clear(){owners.push('layout-clear');if(onClear)onClear();if(layoutFails)throw Error('PRIVATE layout');info.entries=0;info.serializedBytes=0;return {...info};}};
 function node(selector){if(!nodes.has(selector))nodes.set(selector,{textContent:'',disabled:false,attributes:{},handlers:new Map(),setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,f){this.handlers.set(k,f);},removeEventListener(k,f){if(this.handlers.get(k)===f)this.handlers.delete(k);},querySelector:node});return nodes.get(selector);}
 const view={querySelector:s=>s==='.cacheManagementPage'?node(s):null};let module;const define=(deps,factory)=>{assert.deepEqual(Array.from(deps),['ete-home-layout-cache']);module=factory({default:{management:pages}});};define.amd={};vm.runInNewContext(source,{define,Number,Promise});
 const manager=module.create(view,async channel=>{calls.push(channel);if(channel.endsWith('clear')){owners.push('http-clear');if(httpHeld)await httpHeld.promise;if(httpFails)throw Error('PRIVATE HTTP');if(httpMeasurementUnavailable)return {status:'cleared',measurement:'unavailable'};return {status:'cleared',bytes:3};}return {status:'ok',bytes:2048};});
 return {view,nodes,node,calls,owners,manager,info,click(selector){const fn=node(selector).handlers.get('click');assert.ok(fn,'listener exists');fn();},layoutFailure(v){layoutFails=v;},httpFailure(v){httpFails=v;},onClear(fn){onClear=fn;},holdHttp(){return httpHeld=gate();},measurementUnavailable(){httpMeasurementUnavailable=true;}};
}
test('independent plugin route uses real plugin manager mapPath/mapRoute and points at maintained page/controller',()=>{
 let manager;const code=fs.readFileSync(path.join(root,'vendor/web-snapshot/www/modules/common/pluginmanager.js'),'utf8');vm.runInNewContext(code,{define(deps,factory){const exports={};factory(exports,{default:{}},{default:{}},{appHost:{}},{default:{}});manager=exports.default;},console});
 const text=fs.readFileSync(path.join(root,'src/electronapp/plugins/libmpv.js'),'utf8');const begin=text.indexOf('self.getRoutes = function () {')+'self.getRoutes = '.length,end=text.indexOf('        self.getTranslations',begin);
 const self={id:'libmpvmediaplayer',baseUrl:'file:///synthetic/runtime/electronapp/plugins'};const getRoutes=vm.runInNewContext('('+text.slice(begin,end).trim().replace(/;$/,'')+')',{self,pluginManager:manager});
 const routes=getRoutes(),rows=routes.filter(r=>r.title==='缓存管理');assert.equal(rows.length,1);const route=rows[0];assert.equal(route.type,'settings');assert.equal(route.category,'General');
 assert.equal(route.path,'mpvplayer/cache-management.html');assert.equal(route.controller,manager.mapPath(self,'mpvplayer/cache-management.js'));assert.equal(manager.mapRoute(self,route),'/plugins/libmpvmediaplayer/mpvplayer/cache-management.html');
 for(const file of ['cache-management.html','cache-management.js','cache-management.css'])assert.ok(fs.statSync(path.join(plugin,file)).isFile());
 const html=fs.readFileSync(path.join(plugin,'cache-management.html'),'utf8');assert.match(html,/btnClearAllCaches/);assert.match(html,/HTTP 缓存总量/);assert.match(html,/不清除登录、服务器配置、个人设置、embydata/);assert.doesNotMatch(fs.readFileSync(path.join(plugin,'about.html'),'utf8'),/aboutCacheManagement/);
});
test('entry reads owner counts and HTTP total but never clears; manual layout clear remains separate',async()=>{
 const f=fixture();await f.manager.resume();assert.deepEqual(f.calls,['enhanced-http-cache-status']);assert.deepEqual(f.owners,[]);assert.match(f.node('.cachePageValue').textContent,/1 条；序列化占用 512 bytes/);assert.match(f.node('.cacheHttpValue').textContent,/2.0 KiB（2048 bytes）/);
 f.click('.btnClearPageCache');await flush();assert.deepEqual(f.owners,['layout-clear']);assert.equal(f.calls.length,1);assert.match(f.node('.cachePageState').textContent,/已清理/);f.manager.dispose();
});
test('combined clear gives both independent results and rejects repeated clicks while pending',async()=>{
 const f=fixture();await f.manager.resume();const held=f.holdHttp();f.click('.btnClearAllCaches');f.click('.btnClearAllCaches');await flush();assert.deepEqual(f.owners,['layout-clear','http-clear']);assert.equal(f.node('.btnClearPageCache').disabled,true);assert.equal(f.node('.btnRefreshCache').disabled,true);held.resolve();await flush();assert.match(f.node('.cachePageState').textContent,/已清理/);assert.match(f.node('.cacheHttpState').textContent,/清理完成/);assert.equal(f.node('.btnClearAllCaches').disabled,false);assert.equal(f.node('.cacheOperationState').textContent,'以上缓存已清理。');f.manager.dispose();
});
for(const failed of ['layout','HTTP'])test('combined clear isolates '+failed+' failure without suppressing the other owner',async()=>{
 const f=fixture();await f.manager.resume();if(failed==='layout')f.layoutFailure(true);else f.httpFailure(true);f.click('.btnClearAllCaches');await flush();assert.deepEqual(f.owners,['layout-clear','http-clear']);assert.equal(f.node('.cacheOperationState').textContent,'部分清理完成，请查看各项结果。');assert.equal(f.node(failed==='layout'?'.cachePageState':'.cacheHttpState').attributes.role,'alert');assert.match(f.node(failed==='layout'?'.cacheHttpState':'.cachePageState').textContent,/清理/);assert.equal(f.node('.cacheOperationState').textContent.includes('PRIVATE'),false);f.manager.dispose();
});
test('completed HTTP clear with failed measurement remains success without a fabricated zero',async()=>{
 const f=fixture();await f.manager.resume();f.measurementUnavailable();f.click('.btnClearAllCaches');await flush();assert.equal(f.node('.cacheHttpValue').textContent,'无法读取');assert.match(f.node('.cacheHttpState').textContent,/清理完成；统计暂不可用/);assert.equal(f.node('.cacheOperationState').textContent,'清理已完成，部分统计暂不可用。');assert.equal(f.node('.cacheOperationState').attributes.role,'status');f.manager.dispose();
});
test('leaving before queued combination starts performs no physical action',async()=>{
 const f=fixture();await f.manager.resume();f.click('.btnClearAllCaches');f.manager.pause();await flush();assert.deepEqual(f.owners,[]);f.manager.dispose();
});
test('leaving after layout step prevents the not-yet-started HTTP action',async()=>{
 const f=fixture();await f.manager.resume();f.onClear(()=>f.manager.pause());f.click('.btnClearAllCaches');await flush();assert.deepEqual(f.owners,['layout-clear']);assert.deepEqual(f.calls,['enhanced-http-cache-status']);f.manager.dispose();
});
test('late HTTP response after pause does not mutate the hidden UI; resume reads fresh statistics',async()=>{
 const f=fixture();await f.manager.resume();const held=f.holdHttp();f.click('.btnClearAllCaches');await flush();f.manager.pause();const before=[...f.nodes.values()].map(n=>n.textContent);held.resolve();await flush();assert.deepEqual([...f.nodes.values()].map(n=>n.textContent),before);await f.manager.resume();assert.match(f.node('.cacheHttpValue').textContent,/2048 bytes/);f.manager.dispose();
});
test('resume while an old operation is pending cannot start another clear or apply its old numbers',async()=>{
 const f=fixture();await f.manager.resume();const held=f.holdHttp();f.click('.btnClearAllCaches');await flush();f.manager.pause();f.manager.resume();assert.equal(f.node('.cacheHttpValue').textContent,'等待刷新');held.resolve();await flush();assert.equal(f.node('.cacheHttpValue').textContent,'等待刷新');assert.equal(f.node('.cacheHttpState').textContent,'统计待刷新');assert.match(f.node('.cacheOperationState').textContent,/上次操作已结束/);assert.deepEqual(f.owners,['layout-clear','http-clear']);f.manager.dispose();
});
test('destroy removes handlers and consumes late completion without mutation or a new operation',async()=>{
 const f=fixture();await f.manager.resume();const held=f.holdHttp();f.click('.btnClearHttpCache');await flush();f.manager.dispose();const before=[...f.nodes.values()].map(n=>n.textContent);held.resolve();await flush();assert.deepEqual([...f.nodes.values()].map(n=>n.textContent),before);for(const selector of ['.btnClearHttpCache','.btnClearPageCache','.btnClearAllCaches','.btnRefreshCache'])assert.equal(f.node(selector).handlers.size,0);assert.deepEqual(f.owners,['http-clear']);
});
test('standalone controller delegates resume/pause/destroy to the supplied BaseView and actual UI',async()=>{
 const f=fixture();let Controller;function Base(view){this.view=view;}Base.prototype.onResume=function(){};Base.prototype.onPause=function(){};Base.prototype.destroy=function(){this.view=null;};const file=fs.readFileSync(path.join(plugin,'cache-management.js'),'utf8');let started=0;const ui={create(view,request){assert.equal(view,f.view);started++;return f.manager;}};vm.runInNewContext(file,{define(deps,factory){assert.deepEqual(Array.from(deps).slice(0,2),['baseView','./cache-settings.js']);Controller=factory(Base,ui);},window:{}});const controller=new Controller(f.view);await controller.onResume();controller.onPause();controller.destroy();assert.equal(started,1);assert.equal(controller.view,null);assert.equal(f.node('.btnClearAllCaches').handlers.size,0);
});
