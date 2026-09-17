'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {app, BrowserWindow, desktopCapturer, screen} = require('electron');
const {createService} = require('../src/electronapp/native-helper/service');

const args = process.argv.slice(2).map(value => path.resolve(value));
if (args.length !== 3) throw new Error('Usage: electron native-helper-service-smoke.cjs <runtime-root> <media> <output>');
const [runtimeRoot, mediaPath, outputPath] = args;
const result = {schemaVersion: 1, status: 'running'};
let main;
let service;
let endpointId;
let generationId = null;

function delay(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }
async function until(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(25);
  }
  throw new Error('timeout:' + label);
}

async function bridgeCall(operation, payload) {
  const value = Object.assign({}, payload || {});
  if (['set-property', 'set-properties', 'get-property', 'command', 'set-visible'].includes(operation)) value.generationId = generationId;
  const response = await service.call(operation, value, endpointId);
  if (operation === 'begin-generation') generationId = response.generationId;
  return response;
}
async function surfaceStatus() { return (await bridgeCall('surface-status')).value; }

async function run() {
  main = new BrowserWindow({width: 800, height: 450, frame: false, transparent: true, backgroundColor: '#00000000', show: true,
    webPreferences: {nodeIntegration: false, contextIsolation: true, sandbox: true}});
  await main.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<style>html,body{margin:0;background:transparent}.osd{position:fixed;left:20px;bottom:20px;color:#fff;background:#000a;padding:12px}button{font-size:24px}</style><div class="osd"><button id="control">Pause</button><span id="count">0</span></div><script>window.clicks=0;control.onclick=()=>{count.textContent=String(++window.clicks)}</script>'));
  service = createService({electron: require('electron'), getMainWindow: () => main, getWebContents: () => main.webContents, runtimeRoot, mode: 'native-helper'});
  const created = await service.call('create');
  endpointId = created.endpointId;
  await bridgeCall('observe', {properties: ['core-idle', 'time-pos', 'pause']});
  await bridgeCall('begin-generation', {label: 'service-smoke'});
  await bridgeCall('set-properties', {entries: [{name: 'volume', value: 0}, {name: 'pause', value: false}]});
  await bridgeCall('command', {data: ['loadfile', mediaPath]});
  await until(async () => (await bridgeCall('get-property', {name: 'core-idle'})).value === false, 15000, 'core-playing');
  await bridgeCall('set-visible', {visible: true});
  await delay(300);
  const initial = await surfaceStatus();
  main.focus();
  main.setAlwaysOnTop(true);
  main.setAlwaysOnTop(false);
  await delay(200);
  const display = screen.getDisplayMatching(main.getBounds());
  const sources = await desktopCapturer.getSources({types: ['screen'], thumbnailSize: {
    width: Math.round(display.bounds.width * display.scaleFactor),
    height: Math.round(display.bounds.height * display.scaleFactor)
  }});
  const source = sources.find(entry => String(entry.display_id) === String(display.id)) || sources[0];
  const screenshotPath = path.join(path.dirname(outputPath), 'native-helper-service-smoke.png');
  if (source && !source.thumbnail.isEmpty()) {
    const bounds = main.getBounds();
    const factorX = source.thumbnail.getSize().width / display.bounds.width;
    const factorY = source.thumbnail.getSize().height / display.bounds.height;
    fs.writeFileSync(screenshotPath, source.thumbnail.crop({
      x: Math.max(0, Math.round((bounds.x - display.bounds.x) * factorX)),
      y: Math.max(0, Math.round((bounds.y - display.bounds.y) * factorY)),
      width: Math.round(bounds.width * factorX),
      height: Math.round(bounds.height * factorY)
    }).toPNG());
  }

  main.setSize(960, 540);
  await delay(250);
  const resized = await surfaceStatus();
  main.maximize();
  await until(() => main.isMaximized(), 3000, 'maximize');
  await delay(250);
  const maximized = await surfaceStatus();
  main.unmaximize();
  await until(() => !main.isMaximized(), 3000, 'unmaximize');
  await delay(500);
  const enteredFullscreen = new Promise(resolve => main.once('enter-full-screen', resolve));
  main.setFullScreen(true);
  await Promise.race([enteredFullscreen, delay(5000).then(() => { throw new Error('timeout:fullscreen-enter'); })]);
  await delay(250);
  const fullscreen = await surfaceStatus();
  const leftFullscreen = new Promise(resolve => main.once('leave-full-screen', resolve));
  main.setFullScreen(false);
  await Promise.race([leftFullscreen, delay(5000).then(() => { throw new Error('timeout:fullscreen-exit'); })]);
  main.minimize();
  await until(() => main.isMinimized(), 3000, 'minimize');
  await delay(150);
  const minimizedVisible = service.status().surfaceVisible;
  main.restore();
  await until(() => !main.isMinimized(), 3000, 'restore');
  await delay(250);
  const restoredVisible = service.status().surfaceVisible;

  main.focus();
  const button = await main.webContents.executeJavaScript('(function(){const r=control.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()');
  main.webContents.sendInputEvent({type: 'mouseMove', x: button.x, y: button.y});
  main.webContents.sendInputEvent({type: 'mouseDown', x: button.x, y: button.y, button: 'left', clickCount: 1});
  main.webContents.sendInputEvent({type: 'mouseUp', x: button.x, y: button.y, button: 'left', clickCount: 1});
  await delay(100);
  const clicks = await main.webContents.executeJavaScript('window.clicks');

  const geometryPass = initial.attached && resized.attached && maximized.attached && fullscreen.attached &&
    resized.width !== initial.width && resized.height !== initial.height && maximized.width >= resized.width && fullscreen.width >= resized.width;
  const lifecyclePass = minimizedVisible === false && restoredVisible === true;
  const inputPass = clicks === 1 && main.isFocused();
  result.status = geometryPass && lifecyclePass && inputPass ? 'passed' : 'failed';
  result.bridge = created;
  result.verdict = {geometry: geometryPass, minimizeRestore: lifecyclePass, osdMouseAndFocus: inputPass};
  result.surface = {initial, resized, maximized, fullscreen, minimizedVisible, restoredVisible};
  result.input = {clicks, mainFocused: main.isFocused()};
  result.screenshot = fs.existsSync(screenshotPath) ? {fileName: path.basename(screenshotPath), size: fs.statSync(screenshotPath).size} : null;
}

app.whenReady().then(run).catch(error => {
  result.status = 'failed';
  result.error = {name: error.name, message: error.message};
}).finally(async () => {
  try { if (service) await service.destroy(); } catch (_) { }
  try { if (main && !main.isDestroyed()) main.destroy(); } catch (_) { }
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  app.exit(result.status === 'passed' ? 0 : 1);
});
