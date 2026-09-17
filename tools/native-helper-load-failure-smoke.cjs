'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {app, BrowserWindow} = require('electron');
const {createService} = require('../src/electronapp/native-helper/service');

const args = process.argv.slice(2).map(value => path.resolve(value));
if (args.length !== 3) throw new Error('Usage: electron native-helper-load-failure-smoke.cjs <runtime-root> <valid-media> <output>');
const [runtimeRoot, mediaPath, outputPath] = args;
const result = {schemaVersion: 1, status: 'running'};
let main;
let service;

function delay(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }
async function until(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { if (await predicate()) return; await delay(25); }
  throw new Error('timeout:' + label);
}

async function run() {
  main = new BrowserWindow({width: 640, height: 360, frame: false, transparent: true, show: true});
  await main.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<style>html,body{margin:0;background:transparent}</style>'));
  const events = [];
  const originalSend = main.webContents.send.bind(main.webContents);
  main.webContents.send = function (channel, payload) { events.push({channel, payload}); return originalSend(channel, payload); };
  service = createService({electron: require('electron'), getMainWindow: () => main, getWebContents: () => main.webContents, runtimeRoot, mode: 'native-helper'});
  const created = await service.call('create');
  const endpointId = created.endpointId;
  const a = await service.call('begin-generation', {label: 'missing'}, endpointId);
  await service.call('command', {data: ['loadfile', path.join(path.dirname(mediaPath), 'definitely-missing.mp4')], generationId: a.generationId}, endpointId);
  await until(() => events.some(entry => entry.payload && entry.payload.type === 'bridge_error' && entry.payload.reason === 'load-failed'), 5000, 'load-failure');
  const afterFailure = service.status();
  const b = await service.call('begin-generation', {label: 'recovery'}, endpointId);
  await service.call('command', {data: ['loadfile', mediaPath], generationId: b.generationId}, endpointId);
  await until(async () => (await service.call('get-property', {name: 'core-idle', generationId: b.generationId}, endpointId)).value === false, 15000, 'recovery-playing');
  const afterRecovery = service.status();
  await service.call('destroy', {}, endpointId);
  const afterDestroy = service.status();
  const passed = afterFailure.state === 'ready' && afterFailure.recreateCount === 0 && afterRecovery.state === 'ready' &&
    afterRecovery.recreateCount === 0 && afterDestroy.state === 'stopped';
  result.status = passed ? 'passed' : 'failed';
  result.afterFailure = afterFailure;
  result.afterRecovery = afterRecovery;
  result.afterDestroy = afterDestroy;
  result.loadFailureEventCount = events.filter(entry => entry.payload && entry.payload.type === 'bridge_error' && entry.payload.reason === 'load-failed').length;
}

app.whenReady().then(run).catch(error => {
  result.status = 'failed'; result.error = {name: error.name, message: error.message};
}).finally(async () => {
  try { if (service) await service.destroy(); } catch (_) { }
  try { if (main && !main.isDestroyed()) main.destroy(); } catch (_) { }
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  app.exit(result.status === 'passed' ? 0 : 1);
});
