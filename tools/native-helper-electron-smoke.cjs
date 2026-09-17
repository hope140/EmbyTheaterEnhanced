'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {app, BrowserWindow, desktopCapturer, screen} = require('electron');
const {NativeHelperClient} = require('../src/electronapp/native-helper/controller');
const {decimalWindowHandle, EXPECTED_LIBMPV_VERSION} = require('../src/electronapp/native-helper/service');

function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function usage() { throw new Error('Usage: electron native-helper-electron-smoke.cjs <helper> <libmpv> <media> <output>'); }
function until(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function poll() {
      try { if (predicate()) return resolve(); } catch (error) { return reject(error); }
      if (Date.now() >= deadline) return reject(new Error('timeout:' + label));
      setTimeout(poll, 10);
    }
    poll();
  });
}

const args = process.argv.slice(2).map(value => path.resolve(value));
if (args.length !== 4) usage();
const [helperPath, libmpvPath, mediaPath, outputPath] = args;
const result = {schemaVersion: 1, status: 'running', electron: process.versions.electron, chromium: process.versions.chrome, node: process.versions.node};
let client;
let host;
let overlay;

async function run() {
  host = new BrowserWindow({width: 960, height: 540, frame: false, show: true, backgroundColor: '#000', title: 'ETE Native Helper Smoke'});
  overlay = new BrowserWindow({width: 960, height: 540, frame: false, show: true, transparent: true, backgroundColor: '#00000000', focusable: true, skipTaskbar: true,
    webPreferences: {nodeIntegration: false, contextIsolation: true, sandbox: true}});
  await host.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<title>ETE Native Helper Smoke</title><style>html,body{margin:0;background:#000}</style>'));
  await overlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<style>html,body{margin:0;background:transparent;color:white;font:24px sans-serif}.osd{position:fixed;left:24px;right:24px;bottom:24px;padding:14px;background:#0008;border:1px solid #fff8}</style><div class="osd">Emby Theater Enhanced · Native Helper</div>'));
  overlay.setIgnoreMouseEvents(false);
  overlay.setBounds(host.getBounds(), false);
  if (typeof overlay.moveTop === 'function') overlay.moveTop();

  const accepted = [];
  const startedAt = process.hrtime.bigint();
  client = new NativeHelperClient({
    helperPath,
    libmpvPath,
    parentWindowHandle: decimalWindowHandle(host),
    expectedLibmpvVersion: EXPECTED_LIBMPV_VERSION,
    onEvent: message => accepted.push({name: message.name, generationId: message.generationId, value: message.value})
  });
  await client.start();
  const generationId = client.beginGeneration('smoke', ['pause', 'time-pos', 'duration', 'core-idle', 'eof-reached']);
  client.setProperty('volume', 0);
  client.setProperty('pause', false);
  const load = client.load(['loadfile', mediaPath]);
  await load.promise;
  await client.waitForGenerationEvent(generationId, 'core-idle', 15000);
  await until(() => accepted.some(event => event.name === 'time-pos' && Number(event.value) > 0), 15000, 'time-pos');
  const playingAt = process.hrtime.bigint();
  const render = {
    currentVo: await client.getProperty('current-vo'),
    gpuApi: await client.getProperty('gpu-api'),
    gpuContext: await client.getProperty('gpu-context'),
    hwdec: await client.getProperty('hwdec'),
    hwdecCurrent: await client.getProperty('hwdec-current'),
    videoParams: await client.getProperty('video-params'),
    videoOutParams: await client.getProperty('video-out-params')
  };
  const surface = await client.request('surface-status', {}, {generationId, mediaScoped: false, timeoutMs: 2000});
  client.setProperty('pause', true);
  await until(() => accepted.some(event => event.name === 'pause' && event.value === true), 3000, 'pause');
  client.setProperty('pause', false);
  await until(() => accepted.some(event => event.name === 'pause' && event.value === false), 3000, 'unpause');
  client.submitCommand(['seek', '1', 'absolute', 'exact']);
  await new Promise(resolve => setTimeout(resolve, 500));

  if (typeof overlay.moveTop === 'function') overlay.moveTop();
  overlay.setAlwaysOnTop(true);
  overlay.setAlwaysOnTop(false);
  overlay.focus();
  await new Promise(resolve => setTimeout(resolve, 300));
  const display = screen.getDisplayMatching(host.getBounds());
  const captureWidth = Math.max(1, Math.round(display.bounds.width * display.scaleFactor));
  const captureHeight = Math.max(1, Math.round(display.bounds.height * display.scaleFactor));
  const sources = await desktopCapturer.getSources({types: ['screen'], thumbnailSize: {width: captureWidth, height: captureHeight}, fetchWindowIcons: false});
  const source = sources.find(entry => String(entry.display_id) === String(display.id)) || sources[0];
  const screenshotPath = path.join(path.dirname(outputPath), 'native-helper-smoke.png');
  if (source && !source.thumbnail.isEmpty()) {
    const bounds = host.getBounds();
    const factorX = source.thumbnail.getSize().width / display.bounds.width;
    const factorY = source.thumbnail.getSize().height / display.bounds.height;
    const crop = {
      x: Math.max(0, Math.round((bounds.x - display.bounds.x) * factorX)),
      y: Math.max(0, Math.round((bounds.y - display.bounds.y) * factorY)),
      width: Math.min(source.thumbnail.getSize().width, Math.round(bounds.width * factorX)),
      height: Math.min(source.thumbnail.getSize().height, Math.round(bounds.height * factorY))
    };
    fs.writeFileSync(screenshotPath, source.thumbnail.crop(crop).toPNG());
  }
  const nativeCapturePath = path.join(path.dirname(outputPath), 'native-helper-smoke.bmp');
  if (process.env.ETE_HELPER_TESTING === '1') {
    await client.request('capture-screen', {path: nativeCapturePath}, {generationId, mediaScoped: false, timeoutMs: 3000});
  }

  await client.stop();
  result.status = 'passed';
  result.helper = {sha256: hash(helperPath), handshake: client.handshake};
  result.libmpv = {sha256: hash(libmpvPath), version: EXPECTED_LIBMPV_VERSION};
  result.media = {sha256: hash(mediaPath), fileName: path.basename(mediaPath)};
  result.generationId = generationId;
  result.loadToPlayingMs = Number(playingAt - startedAt) / 1e6;
  result.acceptedEvents = accepted.length;
  result.acceptedStaleEvents = client.timeline.filter(event => event.action === 'ACCEPT' && event.generationId !== event.currentAuthoritativeGeneration).length;
  result.surface = surface;
  result.overlay = {visible: overlay.isVisible(), focused: overlay.isFocused(), bounds: overlay.getBounds(), title: await overlay.webContents.executeJavaScript('document.title')};
  result.render = render;
  result.screenshot = fs.existsSync(screenshotPath) ? {fileName: path.basename(screenshotPath), sha256: hash(screenshotPath)} : null;
  result.nativeCapture = fs.existsSync(nativeCapturePath) ? {fileName: path.basename(nativeCapturePath), sha256: hash(nativeCapturePath)} : null;
}

app.whenReady().then(run).catch(error => {
  result.status = 'failed';
  result.error = {name: error.name, message: error.message};
}).finally(async () => {
  try { if (client) await client.kill(); } catch (_) { }
  try { if (overlay && !overlay.isDestroyed()) overlay.destroy(); } catch (_) { }
  try { if (host && !host.isDestroyed()) host.destroy(); } catch (_) { }
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  app.exit(result.status === 'passed' ? 0 : 1);
});
