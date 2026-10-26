'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),fixture=require('../tests/helpers/detail-renderer.cjs');
async function main(args=process.argv.slice(2)){
 if(args.length!==2||!args.every(path.isAbsolute))throw Error('Usage: node tools/check-detail-handoff-renderer.cjs <installed Chromium> <new absolute evidence directory>');
 const root=path.resolve(__dirname,'..'),out=args[1];fs.mkdirSync(out);const browser=await require('playwright').chromium.launch({executablePath:args[0],headless:true}),cases=[];
 async function trial(type,tv,mode='success'){
  const page=await fixture.open(browser,root,true),name=type+'-'+(tv?'tv':'standard')+'-'+mode,errors=[],held=[];let hold=false;
  page.on('pageerror',error=>errors.push(error.stack));
  await page.route('http://synthetic.invalid/handoff/**',route=>{const url=route.request().url(),fresh=new URL(url).searchParams.get('tag')?.endsWith('-2'),width=type==='Episode'&&!url.includes('synthetic-person')?640:240;const done=()=>mode==='failure'&&fresh?route.fulfill({status:503,body:''}):route.fulfill({contentType:'image/svg+xml',headers:{'cache-control':'no-store'},body:'<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="360"><rect width="100%" height="100%" fill="#336c88"/><circle cx="50%" cy="50%" r="65" fill="#cda76d"/></svg>'});if(hold&&fresh)held.push(done);else return done();});
  try{
   await page.evaluate(({type,tv})=>{detail.config.type=type;trial.runtime.modules.get('modules/layoutmanager.js').default.tv=tv;document.documentElement.classList.toggle('layout-tv',tv);const original=detail.item;detail.item=()=>({...original(),...(type==='Episode'?{SeriesName:'Synthetic series',IndexNumber:3,ParentIndexNumber:1}:{}),PrimaryImageAspectRatio:type==='Episode'?16/9:2/3,People:[{Id:'synthetic-person',Type:'Actor',Name:'Synthetic actor',PrimaryImageTag:'actor-'+detail.generation}]});detail.api.getImageUrl=(id,options={})=>'http://synthetic.invalid/handoff/'+id+'.svg?'+new URLSearchParams(options);
    detail.handoffState=()=>{const view=detail.view,box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};},visible=e=>!!e&&!!e.getClientRects().length&&!e.closest('.hide')&&getComputedStyle(e).visibility!=='hidden';return {title:view.querySelector('.nameContainer').textContent.trim(),titleBox:box(view.querySelector('.nameContainer')),main:box(view.querySelector('.detailMainContainer')),poster:box(view.querySelector('.detailImageContainer-main')),preview:!!view.querySelector('.eteDetailCachePreview'),covers:[...view.querySelectorAll('.eteDetailImageCover')].filter(visible).length,pendingSections:view.querySelectorAll('.eteDetailVisualPending').length,classes:view.className};};
   },{type,tv});
   await page.evaluate(()=>detail.route('item'));await page.evaluate(()=>detail.owner.dataPromise);await page.evaluate(()=>detail.store.snapshot());await page.waitForTimeout(80);
   const nativeInitial=await page.evaluate(()=>detail.handoffState());
   if(mode==='legacy')await page.evaluate(async()=>{const module=await new Promise((resolve,reject)=>require(['ete-detail-page-cache'],resolve,reject)),scope=module.default.context(detail.api,detail.owner.params),item=detail.item();delete item.PrimaryImageAspectRatio;await detail.store.write(detail.store.ticket(scope),item);});
   if(mode==='render-error')await page.evaluate(async()=>{const info=await new Promise((resolve,reject)=>require(['mediaInfo'],resolve,reject));info.fillSecondaryMediaInfo=()=>{throw Error('Synthetic native renderer failure');};});
   await page.evaluate(()=>detail.route('settings'));await page.evaluate(()=>{detail.generation=2;detail.config.holdItem=true;detail.config.holdSources=true;});hold=true;
   await page.evaluate(()=>detail.route('item'));await page.waitForFunction(()=>detail.handoffState().preview&&!detail.view.classList.contains('eteDetailSizing'));await page.waitForTimeout(50);const preview=await page.evaluate(()=>detail.handoffState());await page.screenshot({path:path.join(out,name+'-preview.png')});
   assert.ok(Math.abs(preview.titleBox.x-nativeInitial.titleBox.x)<1,JSON.stringify({name,nativeInitial,preview}));
   assert.ok(Math.abs(preview.poster.width-nativeInitial.poster.width)<1,JSON.stringify({name,nativeInitial,preview}));
   if(type!=='Episode')assert.ok(Math.abs(preview.main.height-nativeInitial.main.height)<1,JSON.stringify({name,nativeInitial,preview}));
   // Data stays fresh while only visual image readiness is held.
   await page.evaluate(()=>{detail.generation=2;detail.config.holdItem=false;detail.release('item');});
   if(type==='Movie'||type==='Episode')await page.waitForFunction(()=>detail.held.some(entry=>entry.kind==='sources'));
   await page.evaluate(mode=>{detail.config.holdSources=false;detail.release('sources');return mode==='render-error'?detail.owner.dataPromise.catch(error=>{detail.renderFailed=error.message;}):detail.owner.dataPromise;},mode);
   await page.waitForFunction(()=>detail.handoffState().covers>0);const waiting=await page.evaluate(()=>detail.handoffState());await page.screenshot({path:path.join(out,name+'-image-pending.png')});
   if(mode!=='render-error')assert.equal(waiting.preview,false);assert.ok(waiting.title.includes('Synthetic detail 2'));
   // Existing play path must work before image delivery and without another Item GET.
   if(mode==='success'&&type==='Movie'&&!tv){await page.locator('.page:not(.hide) .btnMainPlay').click();await page.waitForFunction(()=>detail.played);assert.equal(await page.evaluate(()=>detail.http.filter(call=>call.kind==='item').length),2);assert.ok((await page.evaluate(()=>detail.handoffState())).covers>0);}
   if(mode==='cancel'){await page.evaluate(()=>detail.route('settings'));assert.equal(await page.locator('.eteDetailImageCover').count(),0);}
   else if(mode==='timeout'||mode==='render-error'){await page.waitForFunction(()=>detail.handoffState().covers===0&&detail.handoffState().pendingSections===0,{},{timeout:1800});if(mode==='render-error')assert.match(await page.evaluate(()=>detail.renderFailed),/Synthetic native renderer failure/);}
   else if(mode==='cleared'){await page.evaluate(()=>detail.store.clear());assert.equal((await page.evaluate(()=>detail.handoffState())).covers,0);}
   else if(mode==='identity'){await page.evaluate(async()=>{detail.user='other-synthetic-user';detail.api._identityEpoch++;const connection=await new Promise((resolve,reject)=>require(['modules/emby-apiclient/connectionmanager.js'],resolve,reject));trial.events.trigger(connection.default,'localusersignedout');});assert.equal((await page.evaluate(()=>detail.handoffState())).covers,0);assert.equal(await page.evaluate(()=>detail.inspect().visibleTitle),false);}
   await Promise.all(held.splice(0).map(done=>done()));
   if(mode!=='cancel')await page.waitForFunction(()=>detail.handoffState().covers===0&&detail.handoffState().pendingSections===0);
   const final=mode==='cancel'?{settings:true,covers:await page.locator('.eteDetailImageCover').count()}:await page.evaluate(()=>detail.handoffState());await page.screenshot({path:path.join(out,name+'-final.png')});
   assert.deepEqual(errors,[]);cases.push({name,nativeInitial,preview,waiting,final});
  }catch(error){fs.writeFileSync(path.join(out,name+'-failure.json'),JSON.stringify(await page.evaluate(()=>detail.handoffState()),null,2));throw error;}
  finally{await page.unrouteAll({behavior:'ignoreErrors'});await page.close();}
 }
 try{for(const type of ['Movie','Series','Season','Episode'])for(const tv of [false,true])await trial(type,tv);for(const mode of ['failure','timeout','cancel','cleared','identity','render-error'])await trial('Movie',false,mode);await trial('Series',false,'legacy');
  const recovery=await fixture.open(browser,root,true);
  try{
   await recovery.evaluate(()=>{detail.create();return detail.begin();});await recovery.evaluate(()=>detail.store.snapshot());
   await recovery.evaluate(()=>{detail.owner.onPause();detail.owner.destroy();detail.view.remove();detail.config.error={status:503,contentType:'application/json'};detail.create();return detail.begin().catch(()=>{});});
   assert.equal(await recovery.evaluate(()=>detail.view.querySelector('.eteDetailPreviewPlay').disabled),true);
   await recovery.evaluate(()=>{delete detail.config.error;detail.user='new-synthetic-user';detail.api._identityEpoch++;detail.wire.serverInfo({Id:'synthetic-server',UserId:detail.user});return detail.begin();});
   assert.equal(await recovery.evaluate(()=>detail.view.querySelector('.btnMainPlay').disabled),false);assert.equal(await recovery.evaluate(()=>detail.inspect().visibleTitle),true);
   cases.push({name:'temporary-refresh-failure-identity-retirement-restores-native-play-button',status:'passed'});
  }finally{await recovery.unrouteAll({behavior:'ignoreErrors'});await recovery.close();}
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({status:'passed',browser:browser.version(),cases,scope:'Native ItemPage/BaseView/composed viewmanager/CardBuilder and maintained API/transport, standard and TV source modes; synthetic image delivery, failures and metadata. No Work/NAS/Windows/Electron/GPU compositor acceptance.'},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'passed',cases:cases.length,evidence:out}));
 }finally{await browser.close();}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});module.exports={main};
