'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const fixture=require('../tests/helpers/detail-entry-renderer.cjs');
async function main(args=process.argv.slice(2)){
 if(args.length!==2||!args.every(path.isAbsolute))throw Error('Usage: node tools/check-detail-entry-renderer.cjs <installed Chromium> <new absolute evidence directory>');
 const out=args[1],root=path.resolve(__dirname,'..');fs.mkdirSync(out);const browser=await require('playwright').chromium.launch({executablePath:args[0],headless:true}),cases=[];
 try{
  for(const legacyAlias of [true,false])for(const type of ['Movie','Series']){
   const page=await fixture.open(browser,root,{legacyAlias}),name=(legacyAlias?'old-alias':'fixed-alias')+'-'+type;
   try{
    await page.waitForFunction(()=>document.querySelector('.page:not(.hide) .itemsContainer .card .cardTextActionButton'));
    await page.evaluate(type=>{detail.config.type=type;const row=document.querySelector('.page:not(.hide) .itemsContainer');row.items.forEach(item=>{item.Type=type;});},type);
    await page.screenshot({path:path.join(out,name+'-home.png')});
    await page.locator('.page:not(.hide) .itemsContainer .card .cardTextActionButton').first().click();
    await page.waitForFunction(()=>location.pathname==='/item');
    if(legacyAlias)await page.waitForFunction(()=>detail.entry.errors.length>0);
    else await page.waitForFunction(()=>detail.entry.inspect().detail?.visibleTitle);
    const state=await page.evaluate(()=>detail.entry.inspect());await page.screenshot({path:path.join(out,name+'-clicked.png')});
    assert.equal(state.clicks.length,1);assert.equal(state.clicks[0].type,type);assert.ok(state.requests.includes('item/item'));
    if(legacyAlias){assert.ok(state.errors.some(error=>error.includes("reading 'create'")));assert.equal(state.homeVisible,true);assert.equal(state.detail,null);}
    else {assert.deepEqual(state.errors,[]);assert.equal(state.homeVisible,false);assert.equal(state.detail.visibleTitle,true);assert.equal(state.detail.visibleImage,true);assert.ok(state.current.startsWith('/item?'));
     await page.evaluate(()=>detail.store.snapshot());
     await page.evaluate(()=>detail.entry.home());await page.waitForFunction(()=>document.querySelector('.page:not(.hide) .cardTextActionButton'));
     await page.evaluate(type=>{detail.config.holdItem=true;document.querySelector('.page:not(.hide) .itemsContainer').items.forEach(item=>{item.Type=type;});},type);
     await page.locator('.page:not(.hide) .cardTextActionButton').first().click();await page.waitForFunction(()=>detail.entry.inspect().detail?.preview);
     state.cachedReentry=await page.evaluate(()=>detail.entry.inspect());assert.equal(state.cachedReentry.homeVisible,false);assert.equal(state.cachedReentry.detail.visibleTitle,true);assert.deepEqual(state.cachedReentry.errors,[]);
     await page.screenshot({path:path.join(out,name+'-cached-reentry.png')});await page.evaluate(()=>{detail.config.holdItem=false;detail.release('item');return detail.owner.dataPromise;});
    }
    cases.push({name,status:'passed',state});
   }catch(error){fs.writeFileSync(path.join(out,name+'-failure.json'),JSON.stringify(await page.evaluate(()=>({state:detail.entry.inspect(),html:document.body.innerHTML})),null,2));throw error;}finally{await page.unrouteAll({behavior:'ignoreErrors'});await page.close();}
  }
  const report={status:'passed',browser:browser.version(),cases,scope:'Native Home/TabbedView/HomeTab/CardBuilder/ItemsContainer/Shortcuts/CommandProcessor, production router init/load/getRouteUrl, native viewmanager and actual Alameda Item/module alias. Synthetic HTTP/text transport, input/scroller/metadata/device handoff boundaries; no Work, Electron or real NAS acceptance.'};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'passed',evidence:out,cases:cases.length}));
 }finally{await browser.close();}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});module.exports={main};
