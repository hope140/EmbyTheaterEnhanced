'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {sources,openTrial}=require('../tests/helpers/home-flow-renderer.cjs'),native=require('../tests/helpers/home-native-renderer.cjs'),routes=require('../tests/helpers/home-route-renderer.cjs');
async function main(args=process.argv.slice(2)){
 if(args.length!==2||!args.every(path.isAbsolute))throw Error('Usage: node tools/check-home-route-renderer.cjs <installed Chromium> <new absolute evidence directory>');
 const root=path.resolve(__dirname,'..'),out=args[1],control='d79fc6dac70ff7ecdea82034f243d5df87362abb';fs.mkdirSync(out);
 const browser=await require('playwright').chromium.launch({headless:true,executablePath:args[0]}),passed=[];
 async function page(mode,candidate){const input=routes.augment(root,native.augment(root,sources(root,candidate?undefined:control)),candidate);const p=await openTrial(browser,input,mode,{native:true,nativeItems:8,viewport:{width:1920,height:1080}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.evaluate(()=>{(0,eval)(trial.runtime.input.routeSetup)(trial);});return {p,errors};}
 async function finish(p,errors){assert.deepEqual(errors,[]);await p.close();}
 try{
  for(const candidate of [false,true])for(const mode of ['baseline','retain','sections']){
   const {p,errors}=await page(mode,candidate),name=(candidate?'candidate':'control')+'-'+mode;
   try{
    await p.evaluate(()=>trial.route.navigate('home'));await p.evaluate(()=>trial.route.settleHome());
    const before=await p.evaluate(()=>{trial.route.original=trial.route.manager.currentView();trial.route.originalStage=trial.route.homeTab().sectionsContainer.firstChild;return {...trial.route.state(),visual:trial.route.visual()};});
    await p.evaluate(()=>trial.route.navigate('settings'));await p.waitForFunction(()=>document.querySelector('.navMenuOption-settings'));
    await p.evaluate(()=>{trial.bump();trial.config.holdAllItems=true;trial.route.frames=[];trial.route.record=true;const tick=()=>{if(!trial.route.record)return;trial.route.frames.push(trial.route.visual());requestAnimationFrame(tick);};requestAnimationFrame(tick);return trial.route.navigate('home');});await p.waitForTimeout(35);
    const pending=await p.evaluate(()=>({...trial.route.state(),sameView:trial.route.original===trial.route.manager.currentView(),sameStage:trial.route.originalStage===trial.route.homeTab().sectionsContainer.firstChild,
     visual:trial.route.visual(),progress:[...trial.route.manager.currentView().querySelectorAll('.itemProgressBar')].map(e=>getComputedStyle(e).visibility)}));
    await p.screenshot({path:path.join(out,name+'-settings-return.png')});
    if(candidate&&mode!=='baseline'){assert.equal(pending.created,1);assert.equal(pending.sameView,true);assert.equal(pending.sameStage,true);assert.equal(pending.skeletons,0);assert.equal(pending.cards,16);assert.ok(pending.progress.every(x=>x==='hidden'));assert.equal(pending.visual.rows.length,2);for(let row=0;row<2;row++){assert.ok(pending.visual.rows[row].cards>0);assert.ok(Math.abs(pending.visual.rows[row].top-before.visual.rows[row].top)<1);assert.ok(Math.abs(pending.visual.rows[row].height-before.visual.rows[row].height)<1);}}
    else{assert.equal(pending.created,2);assert.equal(pending.sameView,false);if(mode!=='baseline')assert.equal(pending.skeletons,2);}
    await p.evaluate(()=>{trial.config.holdAllItems=false;trial.release();});await p.evaluate(()=>trial.route.settleHome());
    assert.ok(await p.evaluate(()=>[...trial.route.manager.currentView().querySelectorAll('.itemProgressBarForeground')].every(e=>e.style.width==='20%')));
    const settled=await p.evaluate(()=>{trial.route.record=false;return {...trial.route.state(),visual:trial.route.visual(),frames:trial.route.frames};});
    const homeFrames=settled.frames.filter(frame=>frame.home),blankFrames=homeFrames.filter(frame=>frame.rows.length!==2||frame.rows.some(row=>row.cards===0)).length;
    assert.ok(homeFrames.length>0);if(candidate&&mode!=='baseline')assert.equal(blankFrames,0,'resident cross-route return must retain visible card rails every sampled frame');else if(mode!=='baseline')assert.ok(blankFrames>0,'old cross-route control must reproduce visible skeleton frames');settled.blankFrames=blankFrames;await p.screenshot({path:path.join(out,name+'-response.png')});passed.push({name,before,pending,settled});
   }finally{await finish(p,errors);}
  }
  for(const mode of ['retain','sections']){
   const {p,errors}=await page(mode,true);try{
    await p.evaluate(()=>trial.route.navigate('home'));await p.evaluate(()=>trial.route.settleHome());const first=await p.evaluate(()=>{trial.route.original=trial.route.manager.currentView();return trial.route.state();});
    await p.evaluate(()=>trial.route.tab(1));await p.evaluate(()=>trial.route.tab(0));assert.equal(await p.evaluate(()=>trial.route.state().created),1);
    await p.evaluate(()=>trial.route.navigate('settings'));await p.waitForFunction(()=>[...document.querySelectorAll('.navMenuOption-settings')].some(e=>e.textContent.includes('缓存管理')));
    await p.locator('.navMenuOption-settings').filter({hasText:'缓存管理'}).click();await p.waitForFunction(()=>document.querySelector('.cacheHttpValue')?.textContent.includes('128'));
    assert.equal(await p.evaluate(()=>trial.route.manager.currentViewInfo().url),'/plugins/libmpvmediaplayer/mpvplayer/cache-management.html');
    assert.equal(await p.locator('.btnClearAllCaches').evaluate(button=>button.classList.contains('emby-button')),true);const layout=await p.locator('.cacheManagementPage').evaluate(root=>{const rows=[...root.querySelectorAll('.ete-settings-section')].map(row=>{const rect=row.getBoundingClientRect();return {top:rect.top,bottom:rect.bottom};});return {direction:getComputedStyle(root).flexDirection,rows};});assert.equal(layout.direction,'column');assert.ok(layout.rows.every((row,i)=>!i||row.top>=layout.rows[i-1].bottom));await p.screenshot({path:path.join(out,'cache-page-'+mode+'.png')});await p.locator('.btnClearAllCaches').click();await p.waitForFunction(()=>!document.querySelector('.btnClearAllCaches').disabled);
    assert.deepEqual(await p.evaluate(()=>trial.route.ipcCalls),['enhanced-http-cache-status','enhanced-http-cache-clear']);assert.match(await p.locator('.cacheOperationState').textContent(),/以上缓存已清理/);
    await p.evaluate(()=>{trial.config.holdAllItems=true;return trial.route.navigate('home');});const back=await p.evaluate(()=>({...trial.route.state(),same:trial.route.original===trial.route.manager.currentView()}));assert.equal(back.same,true);assert.equal(back.skeletons,0);
    await p.evaluate(()=>{trial.config.holdAllItems=false;trial.release();});await p.evaluate(()=>trial.route.settleHome());passed.push({name:'native-settings-click-and-cache-return-'+mode,first,back});
   }finally{await finish(p,errors);}
  }
  for(const reason of ['evicted','identity','native-invalidated']){
   const {p,errors}=await page('sections',true);try{
    await p.evaluate(()=>trial.route.navigate('home'));await p.evaluate(()=>trial.route.settleHome());
    if(reason==='evicted'){for(const target of ['one','two','three'])await p.evaluate(target=>trial.route.navigate(target),target);const removed=await p.evaluate(()=>({state:trial.route.state(),oldTabs:trial.route.homes[0].tabControllers}));assert.equal(removed.state.destroyed,1);assert.equal(removed.oldTabs,null);}
    else {await p.evaluate(()=>trial.route.navigate('settings'));if(reason==='identity')await p.evaluate(()=>trial.setUser('other-synthetic-user'));else await p.evaluate(()=>trial.route.homes[0].view.allowRestore=false);}
    await p.evaluate(()=>{trial.config.holdAllItems=true;return trial.route.navigate('home');});await p.waitForTimeout(30);const state=await p.evaluate(()=>trial.route.state());assert.equal(state.created,2);assert.equal(state.skeletons,2);assert.ok(state.pages<=3);
    await p.evaluate(()=>{trial.config.holdAllItems=false;trial.release();});await p.evaluate(()=>trial.route.settleHome());passed.push({name:'cold-after-'+reason,state});
   }finally{await finish(p,errors);}
  }
  const report={status:'passed',sourceBaseCommit:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),control,browser:browser.version(),scenarios:passed.length,passed,scope:'actual router init/content functions, composed viewmanager, HomeView/TabbedView/BaseView/HomeTab, native card/list/shortcuts/settings drawer, cache page and owner; controlled API, module/text loader, input/scroller/metadata boundaries; not full Windows/real service acceptance'};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'passed',evidence:out,scenarios:passed.length,scope:report.scope}));
 }finally{await browser.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});module.exports={main};
