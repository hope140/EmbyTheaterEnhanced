'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process'),crypto=require('node:crypto');
const {sources,openTrial}=require('../tests/helpers/home-flow-renderer.cjs'),{augment}=require('../tests/helpers/home-native-renderer.cjs');
async function main(args=process.argv.slice(2)){
 if(args.length!==2||!args.every(path.isAbsolute))throw Error('Usage: node tools/check-home-flow-visual.cjs <installed Chromium> <new absolute evidence directory>');
 const root=path.resolve(__dirname,'..'),out=args[1],control='778b1efbf9f140bc26f11a11b20a84f7b7005604';fs.mkdirSync(out,{recursive:false});
 const browser=await require('playwright').chromium.launch({headless:true,executablePath:args[0]}),cases=[];
 try{
  for(const revision of ['control','candidate'])for(const mode of ['baseline','retain','sections'])for(const count of mode==='baseline'?[3]:[3,8]){
   const name=revision+'-'+mode+'-'+count,p=await openTrial(browser,augment(root,sources(root,revision==='control'?control:undefined)),mode,{native:true,nativeItems:count,sectionTypes:['resume','onnow'],viewport:{width:1920,height:1080},holdAllItems:true});
   const errors=[];p.on('pageerror',e=>errors.push(e.message));
   try{
    await p.evaluate(()=>{
     trial.inspect=()=>{
      const viewport=trial.owner.view.getBoundingClientRect();
      function visible(e){if(!e)return false;const r=e.getBoundingClientRect();if(r.width<1||r.height<1||r.bottom<=viewport.top||r.top>=viewport.bottom||r.right<=viewport.left||r.left>=viewport.right)return false;
       for(let n=e;n;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden'||s.contentVisibility==='hidden'||Number(s.opacity)===0)return false;}return true;}
      return {rows:[...document.querySelectorAll('.verticalSection')].map(row=>{const items=row.querySelector('.itemsContainer'),status=row.querySelector('[data-home-flow-status]'),r=row.getBoundingClientRect(),placeholder=row.querySelector('.homeFlowPlaceholder');return {top:r.top,height:r.height,
       cards:[...items.querySelectorAll('.card')].filter(visible).length,progress:[...items.querySelectorAll('.itemProgressBar')].filter(visible).length,
       widths:[...items.querySelectorAll('.itemProgressBarForeground')].map(x=>x.style.width),inert:items.inert,
       placeholder:!!placeholder&&visible(placeholder),placeholderHeight:placeholder?.getBoundingClientRect().height||0,
       statusClipped:!!status&&getComputedStyle(status).position==='absolute',busy:row.getAttribute('aria-busy')==='true'};}),loading:trial.owner.sectionsContainer.dataset.loading};
     };
     trial.pending=trial.controller.resume();
    });
    await p.waitForFunction(()=>trial.calls.filter(x=>x.kind==='items').length===2);
    const cold=await p.evaluate(()=>trial.inspect());await p.screenshot({path:path.join(out,name+'-cold.png')});
    if(revision==='candidate'&&mode!=='baseline')assert.ok(cold.rows.every(x=>x.placeholder&&x.placeholderHeight>50&&x.statusClipped));
    await p.evaluate(()=>{trial.config.holdAllItems=false;trial.release();});await p.evaluate(()=>trial.pending);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const before=await p.evaluate(()=>trial.inspect());assert.equal(before.rows.length,2);assert.ok(before.rows.every(x=>x.cards>0&&x.progress>0),name+' before='+JSON.stringify(before));
    await p.screenshot({path:path.join(out,name+'-before.png')});
    await p.evaluate(()=>{
     document.querySelector('.itemsContainer .card')?.focus({preventScroll:true});
     trial.frames=[];trial.record=true;const tick=()=>{if(!trial.record)return;trial.frames.push(trial.inspect());requestAnimationFrame(tick);};requestAnimationFrame(tick);
     trial.oldStage=trial.owner.sectionsContainer.firstChild;trial.oldCalls=trial.calls.filter(x=>x.kind==='items').length;
     trial.controller.pause();trial.bump();trial.config.holdLayout=true;trial.pending=trial.controller.resume();
    });
    await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const immediate=await p.evaluate(()=>trial.inspect());await p.screenshot({path:path.join(out,name+'-return.png')});
    await p.evaluate(()=>{trial.config.holdLayout=false;trial.config.holdAllItems=true;trial.release();});
    await p.waitForFunction(()=>trial.calls.filter(x=>x.kind==='items').length===trial.oldCalls+2);
    const pending=await p.evaluate(()=>trial.inspect());await p.screenshot({path:path.join(out,name+'-pending.png')});
    await p.evaluate(()=>{trial.config.holdAllItems=false;trial.release();});await p.evaluate(()=>trial.pending);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const result=await p.evaluate(()=>{trial.record=false;return {after:trial.inspect(),frames:trial.frames,reused:trial.oldStage===trial.owner.sectionsContainer.firstChild,focused:document.activeElement?.getAttribute('data-id')};});
    await p.screenshot({path:path.join(out,name+'-response.png')});
    const blankFrames=result.frames.filter(f=>f.rows.length!==2||f.rows.some(x=>x.cards===0)).length;
    if(revision==='candidate'&&mode!=='baseline'){
     assert.equal(result.reused,true);assert.equal(result.focused,'0-0');assert.equal(blankFrames,0,name+' must keep both card rails throughout return');
     for(const state of [immediate,pending])for(let i=0;i<2;i++){
      assert.ok(state.rows[i].cards>0);assert.equal(state.rows[i].progress,0);assert.equal(state.rows[i].inert,true);assert.equal(state.rows[i].placeholder,false);
      assert.ok(Math.abs(state.rows[i].top-before.rows[i].top)<1);assert.ok(Math.abs(state.rows[i].height-before.rows[i].height)<1);
     }
     assert.ok(result.after.rows.every(x=>!x.inert&&x.progress>0&&x.widths.every(w=>w==='20%')));
    }
    if(revision==='control'&&mode!=='baseline')assert.ok(blankFrames>0,'control must reproduce the reported missing-card frames');
    assert.deepEqual(errors,[]);cases.push({name,cold,before,immediate,pending,after:result.after,blankFrames,frames:result.frames.length,reused:result.reused});
   }finally{await p.evaluate(()=>trial.controller.dispose()).catch(()=>{});await p.close();}
  }
  for(const safety of ['failure-retry','identity-late','empty-return']){
   const p=await openTrial(browser,augment(root,sources(root)),'sections',{native:true,nativeItems:safety==='empty-return'?0:8,sectionTypes:['resume','onnow'],viewport:{width:1920,height:1080},ignoreAbort:true});
   const errors=[];p.on('pageerror',e=>errors.push(e.message));
   try{
    await p.evaluate(()=>trial.controller.resume());
    if(safety==='empty-return'){
     const result=await p.evaluate(async()=>{trial.controller.pause();trial.config.holdLayout=true;trial.pending=trial.controller.resume();await new Promise(r=>requestAnimationFrame(r));const during=[...document.querySelectorAll('.verticalSection')].map(e=>getComputedStyle(e).display);trial.config.holdLayout=false;trial.release();await trial.pending;return {during,after:[...document.querySelectorAll('.verticalSection')].map(e=>getComputedStyle(e).display)};});
     assert.ok(result.during.every(x=>x==='none'));assert.ok(result.after.every(x=>x==='none'));
     await p.evaluate(()=>{trial.config.errorRow=1;return trial.controller.refresh();});
     const failedEmpty=await p.evaluate(()=>{const row=document.querySelectorAll('.verticalSection')[1];return {display:getComputedStyle(row).display,status:row.querySelector('[data-home-flow-status]').textContent};});
     assert.notEqual(failedEmpty.display,'none');assert.match(failedEmpty.status,/无法加载/);
    }else if(safety==='failure-retry'){
     await p.evaluate(()=>{trial.bump();trial.config.errorRow=1;trial.controller.pause();trial.pending=trial.controller.resume();});await p.evaluate(()=>trial.pending);
     const state=await p.evaluate(()=>{const row=document.querySelectorAll('.verticalSection')[1],items=row.querySelector('.itemsContainer');return {cards:items.querySelectorAll('.card').length,inert:items.inert,progress:[...items.querySelectorAll('.itemProgressBar')].map(e=>getComputedStyle(e).visibility),error:row.querySelector('[data-home-flow-status]').textContent,clipped:row.querySelector('[data-home-flow-status]').classList.contains('homeFlowStatus-loading'),calls:trial.calls.length};});
     assert.ok(state.cards>0&&state.inert);assert.ok(state.progress.every(x=>x==='hidden'));assert.equal(state.clipped,false);assert.match(state.error,/无法加载/);
     await p.screenshot({path:path.join(out,'candidate-error.png')});
     await p.evaluate(()=>{delete trial.config.errorRow;document.querySelector('[data-home-flow-status] button').click();});
     await p.waitForFunction(()=>!document.querySelectorAll('.itemsContainer')[1].inert);assert.equal(await p.evaluate(()=>trial.calls.length),state.calls+1);
    }else{
     await p.evaluate(()=>{trial.bump();trial.controller.pause();trial.config.holdAllItems=true;trial.pending=trial.controller.resume();});
     await p.waitForFunction(()=>trial.calls.filter(x=>x.kind==='items').length===4);
     const empty=await p.evaluate(()=>{trial.setUser('other-synthetic-user');return trial.owner.sectionsContainer.childElementCount;});assert.equal(empty,0);
     await p.evaluate(()=>{trial.bump();trial.config.holdAllItems=false;trial.next=trial.controller.resume();});await p.evaluate(()=>trial.next);
     const before=await p.evaluate(()=>document.querySelector('.sections').innerHTML);await p.evaluate(()=>trial.release());await p.evaluate(()=>trial.pending);
     assert.equal(await p.evaluate(()=>document.querySelector('.sections').innerHTML),before);
    }
    assert.deepEqual(errors,[]);cases.push({name:'native-'+safety,status:'passed'});
   }finally{await p.evaluate(()=>trial.controller.dispose()).catch(()=>{});await p.close();}
  }
  const report={status:'passed',control,candidateBaseCommit:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),candidateControllerSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'src/electronapp/enhanced/home/home-tab.js'))).digest('hex'),browser:browser.version(),cases,scope:'actual Home, ItemsContainer, VirtualScroller, CardBuilder, ItemsRefresher, ImageLoader, indicators and fixed CSS; synthetic APIs/artwork and explicit scroller/input/metadata helpers; headless Chromium, not full Windows/real Emby visual acceptance'};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:report.status,evidence:out,cases:cases.map(({name,blankFrames,frames,reused})=>({name,blankFrames,frames,reused})),scope:report.scope}));
 }finally{await browser.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
