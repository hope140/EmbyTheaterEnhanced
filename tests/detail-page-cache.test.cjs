'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const store=require('../src/electronapp/enhanced/detail-cache/store.js');
const item=()=>({Id:'synthetic-item',Type:'Movie',Name:'A & B',Overview:'<p>A &amp; B</p><script>doNotKeep()</script><div>&lt;literal&gt;</div>',ImageTags:{Primary:'synthetic-image-tag'},ProductionYear:2026});
test('persistent projection copies only static text and versioned image identity',()=>{
 const input=item();for(const field of ['UserData','MediaSources','AccessToken','Path','DirectUrl','Policy'])Object.defineProperty(input,field,{get(){throw Error('Sensitive field read');}});
 const dto=store.project(input);assert.deepEqual(Object.keys(dto),['Id','Type','Name','Overview','ProductionYear','PrimaryImageTag']);assert.equal(dto.Overview,'A & B\n\n<literal>');assert.equal(store.valid(dto),true);assert.equal(JSON.stringify(dto).includes('doNotKeep'),false);
});
for(const type of ['Movie','Series','Season','Episode'])test('allowed detail projection '+type,()=>assert.equal(store.project({...item(),Type:type}).Type,type));
test('unsupported types and unknown persistent fields fail closed',()=>{assert.equal(store.project({...item(),Type:'User'}),null);assert.equal(store.valid({...store.project(item()),UserData:{}}),false);assert.equal(store.valid({...store.project(item()),PrimaryImageTag:123}),false);});
test('same key tickets retire old writes and all identities have distinct keys',()=>{const s=store.create(null),scope={server:'server',endpoint:'https://synthetic.invalid',user:'user',item:'item',representation:'standard'};const a=s.ticket(scope),b=s.ticket(scope);assert.equal(s.current(a),false);assert.equal(s.current(b),true);for(const field of Object.keys(scope))assert.notEqual(s.ticket({...scope,[field]:scope[field]+'-other'}).key,b.key);});
test('unavailable persistence never blocks ordinary fresh page work',async()=>{const s=store.create(null);assert.equal((await s.snapshot()).status,'unavailable');assert.equal((await s.read(s.ticket({server:'s',endpoint:'e',user:'u',item:'i',representation:'r'}))).status,'unavailable');});
function pageModule(){let result;const api={isLoggedIn:()=>true,serverId:()=> 'server',serverAddress:()=> 'https://synthetic.invalid',getCurrentUserId:()=> 'user',getCurrentLocale:()=> 'zh-CN',serverVersion:()=> '4.10',_identityEpoch:1,getUrl:name=>'https://synthetic.invalid/'+name};const connection={currentApiClient:()=>api};vm.runInNewContext(fs.readFileSync('src/electronapp/enhanced/detail-cache/page.js','utf8'),{URL,WeakMap,document:{documentElement:{classList:{contains:()=>false}}},define(names,factory){const exports={};factory(exports,{default:{shared:()=>({subscribe:()=>()=>{}})}},{default:connection},{default:{on(){},off(){}}},{});result=exports.default;}});return {page:result,api,connection};}
function response(status,contentType,payload,url='https://synthetic.invalid/Users/user/Items/item'){const result=new Response(contentType==='text/html'?payload:JSON.stringify(payload),{status,headers:{'content-type':contentType}});Object.defineProperty(result,'url',{value:url});return result;}
for(const fixture of [
 {name:'explicit item missing',error:()=>response(404,'application/json',{ResponseStatus:{ErrorCode:'ItemNotFound'}}),expected:'missing'},
 {name:'qualified server missing',error:()=>response(404,'application/json',{ResponseStatus:{ErrorCode:'ResourceNotFoundException',Message:'Item not found.'}}),expected:'missing'},
 {name:'proxy HTML 404',error:()=>response(404,'text/html','<html>Not found</html>'),expected:'temporary'},
 {name:'unqualified generic JSON 404',error:()=>response(404,'application/json',{error:'Not Found'}),expected:'temporary'},
 {name:'PlaybackInfo 404',error:()=>response(404,'application/json',{ResponseStatus:{ErrorCode:'ItemNotFound'}},'https://synthetic.invalid/Items/item/PlaybackInfo'),expected:'temporary'},
 {name:'server 503',error:()=>response(503,'application/json',{}),expected:'temporary'},
 {name:'network abort',error:()=>new DOMException('timeout','AbortError'),expected:'temporary'},
 {name:'401',error:()=>response(401,'application/json',{}),expected:'authorization'},
 {name:'403',error:()=>response(403,'application/json',{}),expected:'authorization'}
])test('error semantics: '+fixture.name,async()=>{const {page,api}=pageModule();assert.equal(await page.failure(fixture.error(),api,{id:'item'}),fixture.expected);});
test('current account, endpoint, auth epoch and display representation are separate context',()=>{const {page,api,connection}=pageModule();const a=page.context(api,{id:'item'});api._identityEpoch++;assert.notEqual(page.context(api,{id:'item'}).epoch,a.epoch);api.getCurrentUserId=()=> 'other';assert.notEqual(page.context(api,{id:'item'}).user,a.user);connection.currentApiClient=()=>null;assert.equal(page.context(api,{id:'item'}),null);});
test('canonical transforms preserve baseline lifecycle and reject repeated cache injection',()=>{const lifecycle=require('../tools/patch-item-lifecycle.cjs'),baseline=lifecycle.patchItemLifecycle(require('../tools/patch-externalplayer-residue.cjs').patchItemText(fs.readFileSync('vendor/web-snapshot/www/item/item.js','utf8'))),candidate=lifecycle.patchDetailCache(baseline);assert.doesNotThrow(()=>new Function(candidate));assert.throws(()=>lifecycle.patchDetailCache(candidate));assert.match(candidate,/instance\.eteDetail\.sources\(\)/);assert.match(candidate,/MultiSelect\.canPlay\(\).*MultiSelect\.play/);assert.match(candidate,/_eteNextUpRevision!==nextRevision/);assert.match(candidate,/instance\._eteDetailEpoch !== epoch \|\| instance\.view !== view/);});

test('unknown/credential query inputs and explicit playback sources never enter cache context',()=>{const {page,api}=pageModule();for(const extra of [{AccessToken:'synthetic'},{mediaSourceId:'source'},{timerId:'timer'},{context:'https://invalid/?token=synthetic'}])assert.equal(page.context(api,{id:'item',...extra}),null);});

test('a cache-ineligible detail keeps the original error path',async()=>{const {page,api}=pageModule();const owner={view:{},params:{id:'item',mediaSourceId:'source'}};const helper=page.create(owner,{});helper.begin(api);assert.equal(await helper.error(response(503,'application/json',{})),false);assert.equal(helper.isCurrent(),true);helper.dispose();});

test('static geometry fields are bounded, optional and do not introduce playback or permission state',()=>{
 const dto=store.project({...item(),PrimaryImageAspectRatio:16/9,SeriesName:'Synthetic series',IndexNumber:3,ParentIndexNumber:2,MediaSources:[{Path:'private'}],Policy:{EnableMediaPlayback:true}});
 assert.equal(dto.PrimaryImageAspectRatio,16/9);assert.equal(dto.SeriesName,'Synthetic series');assert.equal(dto.IndexNumber,3);assert.equal(dto.ParentIndexNumber,2);assert.equal(store.valid(dto),true);
 assert.equal(store.valid({...dto,PrimaryImageAspectRatio:Infinity}),false);assert.equal(store.valid({...dto,IndexNumber:-1}),false);assert.equal(store.valid({...dto,SeriesName:'x'.repeat(2049)}),false);
 assert.equal(store.valid(store.project(item())),true);assert.equal('MediaSources' in dto,false);assert.equal('Policy' in dto,false);
});
