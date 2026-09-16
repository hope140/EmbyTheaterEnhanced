'use strict';
const { app, BrowserWindow, nativeImage, screen } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');
const mode = process.env.SPIKE_MODE;
const output = path.resolve(process.env.SPIKE_OUTPUT);
const binary = path.resolve(process.env.SPIKE_BINARY);
const dll = path.resolve(process.env.SPIKE_LIBMPV);
const media = path.resolve(process.env.SPIKE_MEDIA);
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'profile'));
const softwareUi = process.env.SPIKE_UI_SOFTWARE === '1';
if (softwareUi) app.disableHardwareAcceleration(); // Diagnostic comparison only, not a product requirement.
const evidence = { mode, versions: process.versions, checks: {}, observations: {}, events: [] };
evidence.observations.chromiumSoftwareUi = softwareUi;
let win, bridge, interval, finishing = false;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function save() { fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2)); }
function pass(name, detail = true) { evidence.checks[name] = { status: 'PASS', detail }; save(); }
async function until(predicate, label, timeout = 8000) {
  const start = performance.now();
  while (performance.now() - start < timeout) { if (await predicate()) return performance.now() - start; await delay(30); }
  throw new Error(`timeout:${label}`);
}
class Addon {
  async create(hwnd) {
    this.native = require(path.join(binary, 'bridge-addon.node'));
    await this.native.invoke('create', dll, hwnd);
  }
  async request(op) { return JSON.parse(this.native.invoke(op)); }
  async destroy() { await this.native.invoke('destroy'); }
}
class Helper {
  constructor() { this.pending = new Map(); this.sequence = 0; this.exited = false; }
  async create(hwnd) {
    this.child = spawn(path.join(binary, 'bridge-helper.exe'), [dll, hwnd], { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    this.child.stdin.on('error', () => {});
    this.closed = new Promise(resolve => this.child.once('exit', (code, signal) => {
      this.exited = true; this.exit = {code, signal};
      for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error('helper-exited')); }
      this.pending.clear(); resolve(this.exit);
    }));
    let buffer = '';
    this.ready = new Promise((resolve, reject) => {
      this.child.once('error', reject);
      this.child.stdout.on('data', chunk => {
        buffer += chunk;
        if (buffer.length > 1024*1024) { reject(new Error('ipc-frame-limit')); this.child.kill(); return; }
        let n;
        while ((n=buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0,n); buffer = buffer.slice(n+1);
          try {
            const packet = JSON.parse(line);
            if (packet.ready) resolve();
            if (packet.failure) reject(new Error(packet.failure));
            const item = this.pending.get(packet.id);
            if (item) { clearTimeout(item.timer); this.pending.delete(packet.id); item.resolve(packet.result); }
          } catch (_) { reject(new Error('invalid-helper-json')); }
        }
      });
    });
    // Keep raw stderr local; it is deliberately excluded from published evidence.
    this.child.stderr.pipe(fs.createWriteStream(path.join(output, `helper-${this.child.pid}.stderr.log`)));
    await Promise.race([this.ready, this.closed.then(() => {throw new Error('helper-early-exit');}), delay(15000).then(() => {throw new Error('helper-ready-timeout');})]);
  }
  request(op) {
    if (this.exited) return Promise.reject(new Error('helper-exited'));
    const id = ++this.sequence;
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('ipc-timeout')); }, 4000);
      this.pending.set(id,{resolve,reject,timer}); this.child.stdin.write(`${id}\t${op}\n`);
    });
  }
  async destroy() {
    if (!this.exited) this.child.stdin.end(`${++this.sequence}\tdestroy\n`);
    await Promise.race([this.closed, delay(5000).then(() => {throw new Error('helper-exit-timeout');})]);
    assert.equal(this.exit.code, 0);
  }
}
async function capture(label) {
  win.focus(); await delay(250);
  const raw=path.join(output,`${label}.bgra`);
  const captured=await bridge.request(`capture\t${raw}`); assert.equal(captured.ok,true);
  const image=nativeImage.createFromBitmap(fs.readFileSync(raw),{width:captured.width,height:captured.height});
  fs.writeFileSync(path.join(output,`${label}.png`),image.toPNG());
  evidence.observations[`${label}Screenshot`] = {width:image.getSize().width,height:image.getSize().height};
  save();
}
async function get(name) { return (await bridge.request(`get\t${name}`)).value; }
async function command(op) { const r=await bridge.request(op); assert.equal(r.rc,0); }
async function start() {
  bridge = mode === 'A' ? new Addon() : new Helper();
  const begin=performance.now();
  await bridge.create(win.getNativeWindowHandle().readBigUInt64LE().toString());
  if (!evidence.observations.initializeMs) evidence.observations.initializeMs=[];
  evidence.observations.initializeMs.push(+(performance.now()-begin).toFixed(2));
  pass('INITIALIZE');
  interval=setInterval(async () => {
    const current=bridge;
    try { const events=await current.request('poll'); if (current===bridge && evidence.events.length<5000) evidence.events.push(...events); }
    catch (_) { /* Exit/recreate intentionally ends this generation. */ }
  },30);
}
async function stopPolling() { clearInterval(interval); await delay(50); }
async function run() {
  assert.equal(process.versions.electron,'18.3.15');
  const area=screen.getPrimaryDisplay().workArea;
  win=new BrowserWindow({x:area.x+40,y:area.y+40,width:900,height:620,show:true,
    webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,preload:path.join(__dirname,'preload.cjs')}});
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  win.webContents.on('will-navigate',event => event.preventDefault());
  await win.loadFile(path.join(__dirname,'index.html'));
  win.webContents.send('spike-status', `${mode}: running bounded control and lifecycle checks`);
  await start();
  const loadStart=performance.now(); await command(`load\t${media}`); pass('LOAD');
  await until(async () => Number(await get('time-pos'))>0.2,'core-playing');
  evidence.observations.loadToAdvancingMs=+(performance.now()-loadStart).toFixed(2); pass('CORE_PLAYING');
  await capture('playing');
  evidence.observations.surface=await bridge.request('surface'); assert.equal(evidence.observations.surface.child,true);
  for (const name of ['mpv-version','current-vo','gpu-api','gpu-context','hwdec','hwdec-current','video-codec','video-params','duration','d3d11-output-mode']) evidence.observations[name]=await get(name);
  const roundtrips=[];
  for(let i=0;i<5;i++){const t=performance.now();await get('pause');roundtrips.push(+(performance.now()-t).toFixed(3));}
  evidence.observations.propertyRoundTripMs=roundtrips;
  await command('pause\tyes'); await until(async () => await get('pause')==='yes','pause');
  const paused=Number(await get('time-pos')); await delay(200); assert.ok(Math.abs(Number(await get('time-pos'))-paused)<0.08); pass('PAUSE');
  const seekStart=performance.now();await command('seek\t4'); await until(async () => Math.abs(Number(await get('time-pos'))-4)<0.15,'seek');
  evidence.observations.seekMs=+(performance.now()-seekStart).toFixed(2); pass('SEEK');
  await command('pause\tno'); await until(async () => Number(await get('time-pos'))>4.2,'unpause'); pass('UNPAUSE');
  win.setSize(1050,720); await delay(400); evidence.observations.resizedSurface=await bridge.request('surface');
  assert.ok(evidence.observations.resizedSurface.width>evidence.observations.surface.width); await capture('resized'); pass('RESIZE_GEOMETRY');
  win.minimize(); await delay(350); assert.ok(win.isMinimized()); win.restore(); await delay(350); assert.ok(!win.isMinimized());
  await capture('restored'); pass('MINIMIZE_RESTORE');
  win.setFullScreen(true); await until(() => win.isFullScreen(),'fullscreen'); await delay(500); await capture('fullscreen');
  evidence.observations.fullscreenSurface=await bridge.request('surface');
  win.setFullScreen(false); await until(() => !win.isFullScreen(),'fullscreen-exit'); await delay(400); await capture('fullscreen-exit'); pass('FULLSCREEN_ENTER_EXIT');
  await until(() => evidence.events.some(e=>e.name==='time-pos'&&e.value>0) && evidence.events.some(e=>e.name==='pause'&&e.value===true) && evidence.events.some(e=>e.name==='duration'&&e.value>0),'property-events'); pass('PROPERTY_EVENTS');
  await command('stop'); await until(async()=>await get('idle-active')==='yes','stop'); pass('STOP');
  await stopPolling(); await bridge.destroy(); pass('DESTROY');
  await start(); await command(`load\t${media}`);await until(async()=>Number(await get('time-pos'))>0.2,'recreate');pass('RECREATE');
  if(mode==='B') {
    await stopPolling(); bridge.child.kill(); await bridge.closed; pass('HELPER_FORCE_KILL_DETECTED',bridge.exit);
    await start();await command(`load\t${media}`);await until(async()=>Number(await get('time-pos'))>0.2,'recreate-after-kill');pass('HELPER_RECREATE_AFTER_KILL');
    await stopPolling();bridge.request('crash').catch(()=>{});await until(()=>bridge.exited,'native-crash');pass('HELPER_NATIVE_CRASH_DETECTED',bridge.exit);
    await start();await command(`load\t${media}`);await until(async()=>Number(await get('time-pos'))>0.2,'recreate-after-crash');pass('HELPER_RECREATE_AFTER_CRASH');
    assert.equal(await win.webContents.executeJavaScript('document.title'),'Bridge Phase 2 isolated harness');pass('NO_ELECTRON_CRASH');
  }
  evidence.observations.cpu='NOT MEASURED: no steady-state interval; helper/addon scopes differ';
  await stopPolling();await bridge.destroy();bridge=null;pass('FINAL_DESTROY');
  finishing=true; save();win.destroy();app.quit();
}
app.on('window-all-closed',()=>{if(finishing)app.quit();});
app.whenReady().then(run).catch(async error=>{
  evidence.failure=String(error.message).replaceAll(media,'<generated-media>').replaceAll(dll,'<libmpv>'); save();
  clearInterval(interval);
  try {if(bridge)await bridge.destroy();}catch(_){
    if(bridge && bridge.child && !bridge.exited){bridge.child.kill();await Promise.race([bridge.closed,delay(2000)]);}
  }
  app.exit(1);
});
app.on('will-quit',()=>{evidence.observations.willQuit=true;save();});
