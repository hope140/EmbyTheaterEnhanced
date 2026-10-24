'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const home=require('../tools/patch-server-home.cjs'),plugin=require('../tools/patch-plugin-settings.cjs'),{makeRuntime}=require('./helpers/plugin-dom.cjs');
const create=()=>{const runtime=makeRuntime({transform:s=>home.patchViewManager(plugin.patchViewManager(s))});runtime.document.body.contains=e=>runtime.document.contains(e);return runtime;};
const load=(r,id,type,Factory)=>r.manager.loadView({url:'/'+id,view:r.page(id),type,controllerFactory:Factory});
function controlled(state){return class Controller{constructor(view){this.view=view;}eteHomeRestoreState(){return state;}};}
test('only an opted-in eligible resident Home is offered for forward restore, without adding slots',async()=>{
 const r=create(),state={enabled:true,allowed:true};await load(r,'home','home',controlled(state));const view=r.manager.currentView();await load(r,'settings','settings');
 assert.equal(r.manager.canRestoreHome({url:'/home',type:'home'}),true);await r.manager.tryRestoreView({url:'/home',type:'home'});assert.equal(r.manager.currentView(),view);assert.equal(r.document.main.children.length,2);
 assert.equal(r.manager.canRestoreHome({url:'/home?tab=other',type:'home'}),false);assert.equal(r.manager.canRestoreHome({url:'/home',type:'settings'}),false);
});
for(const reason of ['identity','native-invalidation','async-scope'])test('resident Home restore refuses '+reason+' before exposing the page',async()=>{
 const r=create(),state={enabled:true,allowed:true};await load(r,'home','home',controlled(state));const view=r.manager.currentView();await load(r,'settings','settings');
 let pending;if(reason==='async-scope'){pending=r.manager.tryRestoreView({url:'/home',type:'home'});state.allowed=false;}else{if(reason==='identity')state.allowed=false;else view.allowRestore=false;pending=r.manager.tryRestoreView({url:'/home',type:'home'});}
 await assert.rejects(pending);assert.equal(r.currentName(),'settings');assert.equal(view.classList.contains('hide'),true);
});
test('baseline and ordinary non-Home restore retain their existing behavior',async()=>{
 const r=create();await load(r,'home','home',controlled(null));await load(r,'settings','settings');assert.equal(r.manager.canRestoreHome({url:'/home',type:'home'}),false);await r.manager.tryRestoreView({url:'/home',type:'home'});assert.equal(r.currentName(),'home');
});
test('evicted Home is not recreated from a separate pool',async()=>{
 const r=create();await load(r,'home','home',controlled({enabled:true,allowed:true}));for(const name of ['one','two','three'])await load(r,name,'settings');assert.equal(r.document.main.children.length,3);assert.equal(r.manager.canRestoreHome({url:'/home',type:'home'}),false);
});
test('navigation transforms require the pinned input anchors and refuse repeated application',()=>{
 const vm=plugin.patchViewManager(fs.readFileSync('vendor/web-snapshot/www/modules/viewmanager/viewmanager.js','utf8')),router=plugin.patchRouter(fs.readFileSync('vendor/web-snapshot/www/modules/approuter.js','utf8')),view=fs.readFileSync('vendor/web-snapshot/www/home/home.js','utf8');
 assert.throws(()=>home.patchViewManager(home.patchViewManager(vm)));assert.throws(()=>home.patchRouter(home.patchRouter(router)));assert.throws(()=>home.patchHomeView(home.patchHomeView(view)));
});

test('Home transform preserves the original single parent destruction chain',()=>{
 const source=fs.readFileSync('vendor/web-snapshot/www/home/home.js','utf8'),patched=home.patchHomeView(source);
 const destroy=text=>text.slice(text.indexOf('HomeView.prototype.destroy='),text.indexOf('HomeView.prototype.loadTabController='));
 assert.equal(destroy(patched),destroy(source));assert.equal(destroy(patched).split('_tabbedview.default.prototype.destroy').length,2);
});
