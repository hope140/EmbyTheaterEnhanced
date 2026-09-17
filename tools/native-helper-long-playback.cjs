'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {app, BrowserWindow} = require('electron');
const {NativeHelperClient} = require('../src/electronapp/native-helper/controller');
const {decimalWindowHandle, EXPECTED_LIBMPV_VERSION} = require('../src/electronapp/native-helper/service');

const args = process.argv.slice(2).map(value => path.resolve(value));
if (args.length !== 4) throw new Error('Usage: electron native-helper-long-playback.cjs <helper> <libmpv> <media> <output>');
const [helperPath, libmpvPath, mediaPath, outputPath] = args;
const result = {schemaVersion: 1, status: 'running', targetPlaybackSeconds: 600};
let host;
let client;

function delay(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }
function workingSet(pid) {
  const command = `(Get-Process -Id ${Number(pid)} -ErrorAction Stop).WorkingSet64`;
  const value = childProcess.execFileSync('powershell.exe', ['-NoProfile', '-Command', command], {encoding: 'utf8', windowsHide: true, timeout: 10000}).trim();
  return Number(value);
}

async function run() {
  host = new BrowserWindow({width: 640, height: 360, frame: false, show: true, backgroundColor: '#000'});
  await host.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<style>html,body{margin:0;background:#000}</style>'));
  client = new NativeHelperClient({helperPath, libmpvPath, parentWindowHandle: decimalWindowHandle(host), expectedLibmpvVersion: EXPECTED_LIBMPV_VERSION});
  await client.start();
  const generation = client.beginGeneration('long-playback', ['core-idle', 'time-pos', 'pause', 'eof-reached']);
  client.setProperty('volume', 0);
  client.load(['loadfile', mediaPath]);
  await client.waitFor(() => client.timeline.some(event => event.generationId === generation && event.name === 'core-idle' && event.value === false && event.action === 'ACCEPT'), 15000, 'playing');
  const helperPid = client.child.pid;
  const samples = [];
  const deadline = Date.now() + 660000;
  while (Date.now() < deadline) {
    const position = Number(await client.getProperty('time-pos', 3000));
    samples.push({elapsedSeconds: Math.round((Date.now() - (deadline - 660000)) / 1000), positionSeconds: position, helperWorkingSetBytes: workingSet(helperPid), acceptedStaleEvents: client.timeline.filter(event => event.action === 'ACCEPT' && event.generationId !== event.currentAuthoritativeGeneration).length});
    if (position >= 600) break;
    await delay(30000);
  }
  const first = samples[0], last = samples[samples.length - 1];
  const peakWorkingSet = Math.max(...samples.map(sample => sample.helperWorkingSetBytes));
  const memoryGrowth = last.helperWorkingSetBytes - first.helperWorkingSetBytes;
  const passed = last.positionSeconds >= 600 && client.child.pid === helperPid && !client.transportTerminated &&
    samples.every(sample => sample.acceptedStaleEvents === 0) && memoryGrowth < 128 * 1024 * 1024;
  await client.stop();
  result.status = passed ? 'passed' : 'failed';
  result.helperPidStable = client.child.pid === helperPid;
  result.transportStable = !client.transportTerminated;
  result.finalPositionSeconds = last.positionSeconds;
  result.sampleCount = samples.length;
  result.peakWorkingSetBytes = peakWorkingSet;
  result.memoryGrowthBytes = memoryGrowth;
  result.acceptedStaleEvents = Math.max(...samples.map(sample => sample.acceptedStaleEvents));
  result.samples = samples;
}

app.whenReady().then(run).catch(error => {
  result.status = 'failed';
  result.error = {name: error.name, message: error.message};
}).finally(async () => {
  try { if (client) await client.kill(); } catch (_) { }
  try { if (host && !host.isDestroyed()) host.destroy(); } catch (_) { }
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  app.exit(result.status === 'passed' ? 0 : 1);
});
