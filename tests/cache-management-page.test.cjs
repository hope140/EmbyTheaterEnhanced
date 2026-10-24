'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),plugin=path.join(root,'src/electronapp/plugins/mpvplayer');
const source=fs.readFileSync(path.join(plugin,'cache-settings.js'),'utf8');
function gate(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function flush(){for(let i=0;i<50;i++)await Promise.resolve();}
function fixture({inject=true}={}){
 const nodes=new Map(),calls=[],owners=[],reads=[],failures={},holds={},results={};let onClear=null,sharedCalls=0,httpMeasurementUnavailable=false;
 const info={status:'ok',entries:1,serializedBytes:512,enabledOwners:1,maxEntries:2,maxSerializedBytes:4096,pending:0};
 const detailInfo={status:'ok',entries:2,serializedBytes:768};
 function outcome(name,clear,data){
  if(clear){owners.push(name+'-clear');if(onClear)onClear(name);}else reads.push(name);
  if(failures[name+(clear?'Clear':'Read')])throw Error('PRIVATE '+name);
  if(clear){data.entries=0;data.serializedBytes=0;}
  return results[name+(clear?'Clear':'Read')]||{...data};
 }
 const pages={snapshot:()=>outcome('layout',false,info),clear:()=>outcome('layout',true,info)};
 const detailOwner={async snapshot(){if(holds.detailRead)await holds.detailRead.promise;return outcome('detail',false,detailInfo);},async clear(){
  owners.push('detail-clear');if(onClear)onClear('detail');if(holds.detailClear)await holds.detailClear.promise;
  if(failures.detailClear)throw Error('PRIVATE detail');detailInfo.entries=0;detailInfo.serializedBytes=0;return results.detailClear||{...detailInfo};
 }};
 function node(selector){if(!nodes.has(selector))nodes.set(selector,{textContent:'',disabled:false,attributes:{},handlers:new Map(),setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,f){this.handlers.set(k,f);},removeEventListener(k,f){if(this.handlers.get(k)===f)this.handlers.delete(k);},querySelector:node});return nodes.get(selector);}
 const view={querySelector:s=>s==='.cacheManagementPage'?node(s):null};let module;
 const define=(deps,factory)=>{assert.deepEqual(Array.from(deps),['ete-home-layout-cache','ete-detail-cache-store']);module=factory({default:{management:pages}},{default:{shared(){sharedCalls++;return detailOwner;}}});};define.amd={};vm.runInNewContext(source,{define,Number,Promise});
 const request=async channel=>{calls.push(channel);if(channel.endsWith('clear')){owners.push('http-clear');if(holds.http)await holds.http.promise;if(failures.HTTP)throw Error('PRIVATE HTTP');if(httpMeasurementUnavailable)return {status:'cleared',measurement:'unavailable'};return {status:'cleared',bytes:3};}return {status:'ok',bytes:2048};};
 const manager=inject?module.create(view,request,detailOwner):module.create(view,request);
 return {view,nodes,node,calls,owners,reads,manager,info,detailInfo,get sharedCalls(){return sharedCalls;},click(selector){const fn=node(selector).handlers.get('click');assert.ok(fn,'listener exists');fn();},failure(name,v=true){failures[name]=v;},result(name,value){results[name]=value;},onClear(fn){onClear=fn;},hold(name){return holds[name]=gate();},measurementUnavailable(){httpMeasurementUnavailable=true;}};
}
function texts(f){return [...f.nodes.values()].map(n=>n.textContent);}
test('independent plugin route uses real plugin manager mapPath/mapRoute and a concise two-category page',()=>{
 let manager;const code=fs.readFileSync(path.join(root,'vendor/web-snapshot/www/modules/common/pluginmanager.js'),'utf8');vm.runInNewContext(code,{define(deps,factory){const exports={};factory(exports,{default:{}},{default:{}},{appHost:{}},{default:{}});manager=exports.default;},console});
 const text=fs.readFileSync(path.join(root,'src/electronapp/plugins/libmpv.js'),'utf8');const begin=text.indexOf('self.getRoutes = function () {')+'self.getRoutes = '.length,end=text.indexOf('        self.getTranslations',begin);
 const self={id:'libmpvmediaplayer',baseUrl:'file:///synthetic/runtime/electronapp/plugins'};const getRoutes=vm.runInNewContext('('+text.slice(begin,end).trim().replace(/;$/,'')+')',{self,pluginManager:manager});
 const rows=getRoutes().filter(r=>r.title==='缓存管理');assert.equal(rows.length,1);const route=rows[0];assert.equal(route.type,'settings');assert.equal(route.category,'General');
 assert.equal(route.path,'mpvplayer/cache-management.html');assert.equal(route.controller,manager.mapPath(self,'mpvplayer/cache-management.js'));assert.equal(manager.mapRoute(self,route),'/plugins/libmpvmediaplayer/mpvplayer/cache-management.html');
 for(const file of ['cache-management.html','cache-management.js','cache-management.css'])assert.ok(fs.statSync(path.join(plugin,file)).isFile());
 const html=fs.readFileSync(path.join(plugin,'cache-management.html'),'utf8');assert.equal((html.match(/class="cacheName"/g)||[]).length,2);assert.match(html,/>资源缓存<\/h2>/);assert.match(html,/>页面缓存<\/h2>/);assert.match(html,/btnClearAllCaches">清理全部/);assert.match(html,/资源为 HTTP 总量，页面为数据大小。不清登录和设置。/);assert.match(html,/class="cachePageBudget" hidden/);assert.doesNotMatch(html,/视频|字幕|profile|图片解码|当前配置上限/);assert.doesNotMatch(fs.readFileSync(path.join(plugin,'about.html'),'utf8'),/aboutCacheManagement/);
});
test('entry reads both real page owners and separate HTTP total without clearing; page clear delegates to both owners',async()=>{
 const f=fixture();await f.manager.resume();assert.deepEqual(f.calls,['enhanced-http-cache-status']);assert.deepEqual(f.reads,['layout','detail']);assert.deepEqual(f.owners,[]);assert.equal(f.sharedCalls,0);assert.match(f.node('.cachePageValue').textContent,/1280 bytes/);assert.doesNotMatch(f.node('.cachePageValue').textContent,/条|3328/);assert.match(f.node('.cacheHttpValue').textContent,/2048 bytes/);
 f.click('.btnClearPageCache');await flush();assert.deepEqual(f.owners,['layout-clear','detail-clear']);assert.equal(f.calls.length,1);assert.equal(f.node('.cachePageValue').textContent,'0 bytes');assert.equal(f.node('.cachePageState').textContent,'首页布局已清理；详情数据已清理。');f.manager.dispose();
});
test('production default obtains the shared detail owner, while CommonJS exposes the same create contract',async()=>{
 const f=fixture({inject:false});await f.manager.resume();assert.equal(f.sharedCalls,1);assert.deepEqual(f.reads,['layout','detail']);assert.equal(typeof require('../src/electronapp/plugins/mpvplayer/cache-settings.js').create,'function');f.manager.dispose();
});
test('combined clear gives all three independent results and rejects every repeated control while pending',async()=>{
 const f=fixture();await f.manager.resume();const held=f.hold('detailClear');f.click('.btnClearAllCaches');for(const selector of ['.btnClearAllCaches','.btnClearPageCache','.btnClearHttpCache','.btnRefreshCache'])f.click(selector);await flush();assert.deepEqual(f.owners,['layout-clear','detail-clear']);assert.equal(f.node('.btnClearPageCache').disabled,true);assert.equal(f.node('.btnRefreshCache').disabled,true);held.resolve();await flush();assert.deepEqual(f.owners,['layout-clear','detail-clear','http-clear']);assert.match(f.node('.cachePageState').textContent,/首页布局已清理；详情数据已清理/);assert.match(f.node('.cacheHttpState').textContent,/清理完成/);assert.equal(f.node('.btnClearAllCaches').disabled,false);assert.equal(f.node('.cacheOperationState').textContent,'以上缓存已清理。');f.manager.dispose();
});
for(const failed of ['layoutClear','detailClear','HTTP'])test('combined clear isolates '+failed+' failure without suppressing other owners',async()=>{
 const f=fixture();await f.manager.resume();f.failure(failed);f.click('.btnClearAllCaches');await flush();assert.deepEqual(f.owners,['layout-clear','detail-clear','http-clear']);assert.equal(f.node('.cacheOperationState').textContent,'部分清理完成，请查看各项结果。');assert.equal(f.node(failed==='HTTP'?'.cacheHttpState':'.cachePageState').attributes.role,'alert');assert.match(f.node(failed==='HTTP'?'.cachePageState':'.cacheHttpState').textContent,/清理/);assert.equal(texts(f).join('').includes('PRIVATE'),false);
 if(failed!=='HTTP'){assert.match(f.node('.cachePageValue').textContent,/0 bytes（部分可读）/);assert.match(f.node('.cachePageState').textContent,new RegExp((failed==='layoutClear'?'首页布局':'详情数据')+'清理未确认'));}f.manager.dispose();
});
test('both page owners can fail while the HTTP owner still completes',async()=>{
 const f=fixture();await f.manager.resume();f.failure('layoutClear');f.failure('detailClear');f.click('.btnClearAllCaches');await flush();assert.deepEqual(f.owners,['layout-clear','detail-clear','http-clear']);assert.equal(f.node('.cachePageValue').textContent,'无法读取');assert.match(f.node('.cachePageState').textContent,/首页布局清理未确认.*详情数据清理未确认/);assert.equal(f.node('.cacheHttpState').textContent,'清理完成。');assert.match(f.node('.cacheOperationState').textContent,/部分清理完成/);f.manager.dispose();
});
test('page-only clear reports its successful owner when the other clear returns unavailable',async()=>{
 const f=fixture();await f.manager.resume();f.result('detailClear',{status:'unavailable'});f.click('.btnClearPageCache');await flush();assert.deepEqual(f.owners,['layout-clear','detail-clear']);assert.equal(f.calls.length,1);assert.match(f.node('.cacheOperationState').textContent,/部分清理完成/);assert.match(f.node('.cachePageState').textContent,/首页布局已清理；详情数据清理未确认/);f.manager.dispose();
});
for(const failed of ['layoutRead','detailRead'])test('snapshot '+failed+' failure displays only readable serialized bytes and preserves HTTP refresh',async()=>{
 const f=fixture();f.failure(failed);await f.manager.resume();assert.deepEqual(f.owners,[]);assert.match(f.node('.cachePageValue').textContent,new RegExp((failed==='layoutRead'?'768':'512')+' bytes（部分可读）'));assert.match(f.node('.cachePageState').textContent,/统计不可用，请刷新/);assert.match(f.node('.cacheHttpValue').textContent,/2048 bytes/);f.manager.dispose();
});
test('invalid or unavailable snapshots never fabricate an empty page cache',async()=>{
 const f=fixture();f.result('layoutRead',{status:'ok',entries:1,serializedBytes:-1});f.result('detailRead',{status:'unavailable'});await f.manager.resume();assert.equal(f.node('.cachePageValue').textContent,'无法读取');assert.equal(f.node('.cachePageState').attributes.role,'alert');f.manager.dispose();
});
test('completed HTTP clear with failed measurement remains success without a fabricated zero',async()=>{
 const f=fixture();await f.manager.resume();f.measurementUnavailable();f.click('.btnClearAllCaches');await flush();assert.equal(f.node('.cacheHttpValue').textContent,'无法读取');assert.match(f.node('.cacheHttpState').textContent,/清理完成；统计暂不可用/);assert.equal(f.node('.cacheOperationState').textContent,'清理已完成，部分统计暂不可用。');assert.equal(f.node('.cacheOperationState').attributes.role,'status');f.manager.dispose();
});
test('leaving before queued combination starts performs no physical action',async()=>{
 const f=fixture();await f.manager.resume();f.click('.btnClearAllCaches');f.manager.pause();await flush();assert.deepEqual(f.owners,[]);f.manager.dispose();
});
test('leaving after synchronous layout clear prevents detail and HTTP from starting',async()=>{
 const f=fixture();await f.manager.resume();f.onClear(name=>{if(name==='layout')f.manager.pause();});f.click('.btnClearAllCaches');await flush();assert.deepEqual(f.owners,['layout-clear']);assert.deepEqual(f.calls,['enhanced-http-cache-status']);f.manager.dispose();
});
test('leaving during asynchronous detail clear ignores late UI and prevents HTTP clear',async()=>{
 const f=fixture();await f.manager.resume();const held=f.hold('detailClear');f.click('.btnClearAllCaches');await flush();assert.deepEqual(f.owners,['layout-clear','detail-clear']);f.manager.pause();const before=texts(f);held.resolve();await flush();assert.deepEqual(texts(f),before);assert.deepEqual(f.calls,['enhanced-http-cache-status']);await f.manager.resume();assert.equal(f.node('.cachePageValue').textContent,'0 bytes');assert.match(f.node('.cacheHttpValue').textContent,/2048 bytes/);f.manager.dispose();
});
test('leaving during detail snapshot prevents the not-yet-started HTTP read',async()=>{
 const f=fixture();const held=f.hold('detailRead');const resume=f.manager.resume();await flush();f.manager.pause();const before=texts(f);held.resolve();await resume;assert.deepEqual(texts(f),before);assert.deepEqual(f.calls,[]);f.manager.dispose();
});
test('late HTTP response after pause does not mutate the hidden UI; resume reads fresh statistics',async()=>{
 const f=fixture();await f.manager.resume();const held=f.hold('http');f.click('.btnClearAllCaches');await flush();f.manager.pause();const before=texts(f);held.resolve();await flush();assert.deepEqual(texts(f),before);await f.manager.resume();assert.match(f.node('.cacheHttpValue').textContent,/2048 bytes/);f.manager.dispose();
});
for(const pendingOwner of ['detailClear','http'])test('resume during '+pendingOwner+' cannot start another clear or apply old numbers',async()=>{
 const f=fixture();await f.manager.resume();const held=f.hold(pendingOwner);f.click('.btnClearAllCaches');await flush();f.manager.pause();f.manager.resume();f.click('.btnClearAllCaches');assert.equal(f.node('.cachePageValue').textContent,'等待刷新');assert.equal(f.node('.cacheHttpValue').textContent,'等待刷新');held.resolve();await flush();assert.equal(f.node('.cachePageValue').textContent,'等待刷新');assert.equal(f.node('.cacheHttpValue').textContent,'等待刷新');assert.equal(f.node('.cacheHttpState').textContent,'统计待刷新');assert.match(f.node('.cacheOperationState').textContent,/上次操作已结束/);assert.deepEqual(f.owners,pendingOwner==='detailClear'?['layout-clear','detail-clear']:['layout-clear','detail-clear','http-clear']);f.manager.dispose();
});
for(const pendingOwner of ['detailClear','http'])test('destroy consumes late '+pendingOwner+' rejection without mutation or new owner work',async()=>{
 const f=fixture();await f.manager.resume();const held=f.hold(pendingOwner);f.click('.btnClearAllCaches');await flush();f.manager.dispose();const before=texts(f);held.reject(Error('PRIVATE delayed'));await flush();assert.deepEqual(texts(f),before);for(const selector of ['.btnClearHttpCache','.btnClearPageCache','.btnClearAllCaches','.btnRefreshCache'])assert.equal(f.node(selector).handlers.size,0);assert.deepEqual(f.owners,pendingOwner==='detailClear'?['layout-clear','detail-clear']:['layout-clear','detail-clear','http-clear']);
});
test('standalone controller delegates resume/pause/destroy to supplied BaseView and actual UI',async()=>{
 const f=fixture();let Controller;function Base(view){this.view=view;}Base.prototype.onResume=function(){};Base.prototype.onPause=function(){};Base.prototype.destroy=function(){this.view=null;};const file=fs.readFileSync(path.join(plugin,'cache-management.js'),'utf8');let started=0;const ui={create(view,request){assert.equal(view,f.view);started++;return f.manager;}};vm.runInNewContext(file,{define(deps,factory){assert.deepEqual(Array.from(deps).slice(0,2),['baseView','./cache-settings.js']);Controller=factory(Base,ui);},window:{}});const controller=new Controller(f.view);await controller.onResume();controller.onPause();controller.destroy();assert.equal(started,1);assert.equal(controller.view,null);assert.equal(f.node('.btnClearAllCaches').handlers.size,0);
});
