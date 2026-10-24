'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const flow=require('../tests/helpers/home-flow-renderer.cjs'),native=require('../tests/helpers/home-native-renderer.cjs'),routes=require('../tests/helpers/home-route-renderer.cjs');
async function main(args=process.argv.slice(2)){
 if(args.length!==2||!args.every(path.isAbsolute))throw Error('Usage: node tools/check-cache-button-alignment.cjs <installed Chromium> <new absolute evidence directory>');
 const root=path.resolve(__dirname,'..'),out=args[1],base='ff92bead401a458f3cc83f3e450f48be97af31b2';fs.mkdirSync(out);
 const original=cp.execFileSync('git',['show',base+':src/electronapp/plugins/mpvplayer/cache-management.css'],{cwd:root,encoding:'utf8'});
 const candidate=fs.readFileSync(path.join(root,'src/electronapp/plugins/mpvplayer/cache-management.css'),'utf8');
 const browser=await require('playwright').chromium.launch({executablePath:args[0],headless:true}),cases=[];
 try{
  for(const width of [1920,1280,720,480]){
   const input=routes.augment(root,native.augment(root,flow.sources(root)),true);
   input.nativeCss=input.nativeCss.replace(candidate,original);
   const page=await flow.openTrial(browser,input,'retain',{native:true,origin:'http://synthetic.invalid/',viewport:{width,height:1080}}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   try{
    await page.evaluate(()=>{(0,eval)(trial.runtime.input.routeSetup)(trial);});await page.evaluate(()=>trial.route.navigate('settings'));
    await page.waitForFunction(()=>[...document.querySelectorAll('.navMenuOption-settings')].some(element=>element.textContent.includes('缓存管理')));
    await page.locator('.navMenuOption-settings').filter({hasText:'缓存管理'}).click();await page.waitForFunction(()=>document.querySelector('.cacheHttpValue')?.textContent.includes('128'));
    async function measure(){return page.evaluate(()=>{const box=element=>{const rect=element.getBoundingClientRect();return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,cx:rect.x+rect.width/2,cy:rect.y+rect.height/2};};
     return [...document.querySelectorAll('.cacheManagementPage button')].map(button=>{const range=document.createRange();range.selectNodeContents(button);const rect=range.getBoundingClientRect(),outer=box(button),style=getComputedStyle(button),row=button.closest('.cacheRow');return {name:button.textContent.trim(),row:!!row,box:outer,dx:rect.x+rect.width/2-outer.cx,dy:rect.y+rect.height/2-outer.cy,justifyContent:style.justifyContent,alignItems:style.alignItems,markup:button.outerHTML};});});}
    const before=await measure();assert.ok(before.filter(button=>button.row).every(button=>button.dx < -5),'baseline must reproduce horizontally off-center labels');
    await page.screenshot({path:path.join(out,width+'-before.png')});await page.addStyleTag({content:candidate});
    const after=await measure();for(let index=0;index<after.length;index++){const button=after[index];assert.ok(Math.abs(button.dx)<1,button.name);assert.equal(button.box.width,before[index].box.width);assert.equal(button.box.height,before[index].box.height);assert.equal(button.dy,before[index].dy);assert.ok(button.box.x>=0&&button.box.x+button.box.width<=width);if(button.row){assert.equal(button.justifyContent,'center');assert.equal(button.alignItems,'center');}}
    await page.screenshot({path:path.join(out,width+'-after.png')});
    await page.evaluate(()=>document.querySelectorAll('.cacheManagementPage button').forEach(button=>{button.disabled=true;}));const disabled=await measure();assert.ok(disabled.every(button=>Math.abs(button.dx)<1));assert.deepEqual(errors,[]);cases.push({width,before,after,disabled});
   }finally{await page.close();}
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({status:'passed',baseline:base,source:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),browser:browser.version(),cases,scope:'Real settings click navigation, cache page DOM/CSS and native Emby button. Text Range geometry, screenshots and disabled state at four widths; controlled API/HTTP IPC, Linux fonts. Original user screenshot unavailable; not Windows/Electron visual acceptance.'},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:'passed',evidence:out,widths:cases.length}));
 }finally{await browser.close();}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});module.exports={main};
