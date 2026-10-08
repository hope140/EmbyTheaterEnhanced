'use strict';
// Test-only interactive observer. The runtime is read-only; commands are fixed enums.
const {app, BrowserWindow, screen, desktopCapturer} = require('electron');
const fs = require('fs');
const path = require('path');
const {fileURLToPath} = require('url');
const runtime = process.env.ETE_TEST_RUNTIME;
const evidence = process.env.ETE_TEST_EVIDENCE;
if (!runtime || !evidence || !process.argv[2]) throw Error('isolated-paths-required');
app.setPath('appData', path.join(evidence, 'appdata'));
app.setPath('userData', process.argv[2]);
const events = [];
let main, busy = false, lastId = 0;
function geometry(win) {
    return {bounds:win.getBounds(), contentBounds:win.getContentBounds(), normalBounds:win.getNormalBounds(),
        fullscreen:win.isFullScreen(), maximized:win.isMaximized(), minimized:win.isMinimized(),
        resizable:win.isResizable(), movable:win.isMovable(), visible:win.isVisible(), focused:win.isFocused()};
}
function record(name, win, extra) {
    if (events.length < 2000) events.push({at:Date.now(), name, role:win === main ? 'main' : 'auxiliary',
        ...geometry(win), ...extra});
    fs.writeFileSync(path.join(evidence,'events.json'), JSON.stringify(events,null,2));
}
async function snapshot(label) {
    if (!main || main.isDestroyed()) throw Error('main-unavailable');
    const renderer = await main.webContents.executeJavaScript(`({state:document.windowState,
        width:innerWidth,height:innerHeight, visibility:document.visibilityState,
        top:[...document.querySelectorAll('.windowDragRegion')].map(e=>{let r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,display:s.display,background:s.backgroundColor,appRegion:s.webkitAppRegion}})})`);
    const display = screen.getDisplayMatching(main.getBounds());
    const result = {label, at:Date.now(), main:geometry(main), renderer,
        display:{bounds:display.bounds,workArea:display.workArea,scaleFactor:display.scaleFactor},
        auxiliary:BrowserWindow.getAllWindows().filter(w=>w!==main).map(geometry)};
    fs.writeFileSync(path.join(evidence,'latest.json'),JSON.stringify(result,null,2));
    fs.writeFileSync(path.join(evidence,label+'.json'),JSON.stringify(result,null,2));
    return result;
}
function renderer(source) { return main.webContents.executeJavaScript(source); }
function state(value) { return renderer(`new Promise(r=>require(['apphost'],h=>{h.setWindowState(${JSON.stringify(value)});r(true)}))`); }
async function sampleVideo(label) {
    const samples=[];
    for(let i=0;i<6;i++) {
        const b=main.getBounds(), d=screen.getDisplayMatching(b), scale=d.scaleFactor;
        if (!main.isFocused() || main.isMinimized() || b.x<d.bounds.x || b.y<d.bounds.y || b.x+b.width>d.bounds.x+d.bounds.width || b.y+b.height>d.bounds.y+d.bounds.height) throw Error('video-observer-window-unavailable');
        const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:Math.round(d.bounds.width*scale),height:Math.round(d.bounds.height*scale)}});
        const source=sources.find(s=>s.display_id===String(d.id));
        if (!source || source.thumbnail.isEmpty() || !main.isFocused()) throw Error('video-observer-capture-unavailable');
        const roi=source.thumbnail.crop({x:Math.round((b.x-d.bounds.x+b.width*.15)*scale),y:Math.round((b.y-d.bounds.y+b.height*.55)*scale),width:Math.round(b.width*.7*scale),height:Math.round(b.height*.3*scale)}).resize({width:96,height:54});
        const data=roi.toBitmap(),sum=[0,0,0];
        for(let j=0;j<data.length;j+=4) for(let c=0;c<3;c++) sum[c]+=data[j+c];
        samples.push({at:Date.now(),hash:require('crypto').createHash('sha256').update(data).digest('hex'),bgr:sum.map(n=>Math.round(n/(data.length/4)))});
        await new Promise(r=>setTimeout(r,180));
    }
    const result={label,samples,uniqueHashes:new Set(samples.map(s=>s.hash)).size};
    fs.writeFileSync(path.join(evidence,label+'-video.json'),JSON.stringify(result,null,2));
    return result;
}
async function topCapture(label) {
    const d = screen.getDisplayMatching(main.getBounds());
    if (!['x','y','width','height'].every(k=>main.getBounds()[k]===d.bounds[k]) || !main.isVisible() || main.isMinimized()) throw Error('capture-requires-full-display');
    const sources = await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:Math.round(d.bounds.width*d.scaleFactor),height:Math.round(d.bounds.height*d.scaleFactor)}});
    const source = sources.find(s=>s.display_id===String(d.id));
    if (!source || source.thumbnail.isEmpty()) throw Error('screen-unavailable');
    const size = source.thumbnail.getSize();
    const strip = source.thumbnail.crop({x:Math.floor(size.width/4),y:0,width:Math.floor(size.width/2),height:24});
    fs.writeFileSync(path.join(evidence,label+'-desktop-top.png'),strip.toPNG());
    const page = await main.webContents.capturePage({x:Math.floor(d.bounds.width/4),y:0,width:Math.floor(d.bounds.width/2),height:24});
    fs.writeFileSync(path.join(evidence,label+'-renderer-top.png'),page.toPNG());
    function rows(img) {
        const data=img.toBitmap(),s=img.getSize(),out=[];
        for(let y=0;y<Math.min(s.height,6);y++) {
            let sums=[0,0,0,0];
            for(let x=0;x<s.width;x++) for(let c=0;c<4;c++) sums[c]+=data[(y*s.width+x)*4+c];
            out.push(sums.map(n=>Math.round(n/s.width*100)/100));
        }
        return out;
    }
    fs.writeFileSync(path.join(evidence,label+'-pixels.json'),JSON.stringify({order:'BGRA',desktop:rows(strip),renderer:rows(page)},null,2));
}
async function command(c) {
    if (!Number.isInteger(c.id) || c.id <= lastId || !/^[a-z0-9-]{1,48}$/.test(c.action)) return;
    lastId = c.id;
    const label = String(c.id)+'-'+c.action;
    switch(c.action) {
    case 'fullscreen': await state('Fullscreen'); break;
    case 'normal': await state('Normal'); break;
    case 'minimize': await state('Minimized'); break;
    case 'restore': main.restore(); break;
    case 'resize-normal': main.setBounds({x:120,y:100,width:1000,height:600}); break;
    case 'snapshot': break;
    case 'capture-top': await topCapture(label); break;
    case 'play':
        await renderer(`new Promise((resolve,reject)=>require(['pluginManager'],async pm=>{try{
            const registered=pm.ofType('mediaplayer').find(p=>p.id==='libmpvmediaplayer');
            const p=window.__fullscreenProbePlayer || (window.__fullscreenProbePlayer=new registered.constructor());
            const url=${JSON.stringify(path.join(evidence,'transition-a.y4m'))};
            await p.play({item:{Id:'fullscreen-fixture',Name:'Synthetic fullscreen fixture',MediaType:'Video',Type:'Movie'},
                mediaSource:{Id:'fullscreen-source',Path:url,Container:'y4m',MediaStreams:[],RunTimeTicks:300000000},url,mediaType:'Video',fullscreen:false,playMethod:'DirectPlay'});
            p.pause();resolve(true);
        }catch(e){reject(e)}}))`); break;
    case 'stop': await renderer('window.__fullscreenProbePlayer && window.__fullscreenProbePlayer.stop()'); break;
    case 'motion-cycle':
        await renderer('window.__fullscreenProbePlayer.unpause()');
        await sampleVideo(label+'-initial');
        await state('Fullscreen');
        await new Promise(r=>setTimeout(r,400));
        await snapshot(label+'-fullscreen');
        await sampleVideo(label+'-fullscreen');
        await state('Normal');
        await new Promise(r=>setTimeout(r,400));
        await snapshot(label+'-normal');
        await sampleVideo(label+'-normal');
        await state('Fullscreen');
        await new Promise(r=>setTimeout(r,400));
        await state('Minimized');
        await new Promise(r=>setTimeout(r,400));
        main.restore();
        await new Promise(r=>setTimeout(r,400));
        await snapshot(label+'-restored');
        await sampleVideo(label+'-restored');
        await renderer('window.__fullscreenProbePlayer.pause()');
        break;
    case 'quit':
        await renderer('window.__fullscreenProbePlayer && window.__fullscreenProbePlayer.stop()').catch(()=>{});
        await snapshot(label); main.close(); return;
    default: throw Error('unknown-action');
    }
    await new Promise(r=>setTimeout(r,250));
    await snapshot(label);
}
app.on('browser-window-created',(_,win)=>{
    ['enter-full-screen','leave-full-screen','resize','resized','move','moved','maximize','unmaximize','minimize','restore'].forEach(name=>win.on(name,()=>record(name,win)));
    ['will-resize','will-move'].forEach(name=>win.on(name,(_,bounds)=>record(name,win,{proposedBounds:bounds})));
    win.webContents.once('did-finish-load',async()=>{
        let matches=false;
        try { matches=path.resolve(fileURLToPath(win.webContents.getURL().split('?')[0]))===path.resolve(runtime,'electronapp/www/index.html'); } catch(_){}
        if (!matches) return;
        main=win;
        win.setTitle('ETE Fullscreen Probe');
        setTimeout(()=>snapshot('startup').catch(()=>{}),1800);
    });
});
setInterval(async()=>{
    if(busy || !main || main.isDestroyed()) return;
    busy=true;
    try {
        const input=path.join(evidence,'command.json');
        if(fs.existsSync(input)) await command(JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,'')));
    } catch(e) { fs.writeFileSync(path.join(evidence,'error.json'),JSON.stringify({id:lastId,message:e.message})); }
    finally { busy=false; }
},200);
setTimeout(()=>app.quit(),15*60*1000);
if (process.env.ETE_TEST_SURFACE_FRAMELESS === '1') {
    const serviceModule=require(path.join(runtime,'electronapp/native-helper/service.js'));
    const create=serviceModule.createService;
    serviceModule.createService=options=>create({...options,electron:{...options.electron,BrowserWindow:class extends BrowserWindow {
        constructor(options) { super({...options,thickFrame:false,resizable:false,movable:false}); }
    }}});
}
require(path.join(runtime,'electronapp/main.js'));
