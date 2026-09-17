'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {app, BrowserWindow} = require('electron');
const {NativeHelperClient} = require('../src/electronapp/native-helper/controller');
const {decimalWindowHandle, EXPECTED_LIBMPV_VERSION} = require('../src/electronapp/native-helper/service');

const args = process.argv.slice(2).map(value => path.resolve(value));
if (args.length !== 4) throw new Error('Usage: electron native-helper-race-smoke.cjs <helper> <libmpv> <media-directory> <output>');
const [helperPath, libmpvPath, mediaDirectory, outputPath] = args;
const media = ['A.mp4', 'B.mp4', 'C.mp4'].map(name => path.join(mediaDirectory, name));
const result = {schemaVersion: 1, status: 'running', iterations: 20, electron: process.versions.electron};
let host;
let active;

function acceptedStale(client) {
  return client.timeline.filter(event => event.action === 'ACCEPT' && event.generationId !== event.currentAuthoritativeGeneration).length;
}

async function createClient() {
  const client = new NativeHelperClient({helperPath, libmpvPath, parentWindowHandle: decimalWindowHandle(host), expectedLibmpvVersion: EXPECTED_LIBMPV_VERSION});
  await client.start();
  active = client;
  return client;
}

async function loadCurrent(client, label, file) {
  const generation = client.beginGeneration(label, ['core-idle', 'path', 'pause', 'time-pos']);
  client.load(['loadfile', file]);
  return generation;
}

async function waitForPlaying(client, generation) {
  await client.waitFor(function () {
    return client.timeline.some(event => event.generationId === generation && event.name === 'core-idle' && event.value === false && event.action === 'ACCEPT');
  }, 10000, generation + ':core-playing');
}

async function run() {
  media.forEach(file => { if (!fs.existsSync(file)) throw new Error('media-missing:' + path.basename(file)); });
  host = new BrowserWindow({width: 640, height: 360, frame: false, show: true, backgroundColor: '#000'});
  await host.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<style>html,body{margin:0;background:#000}</style>'));
  let client = await createClient();
  const summary = {rapidAB: [], rapidABC: [], stopDuringLoad: [], helperCrash: []};

  for (let index = 0; index < 20; index++) {
    const a = await loadCurrent(client, 'ab-a-' + index, media[0]);
    const b = await loadCurrent(client, 'ab-b-' + index, media[1]);
    await waitForPlaying(client, b);
    summary.rapidAB.push({a, b, current: client.currentGenerationId, path: client.state.path, acceptedStale: acceptedStale(client)});
  }
  for (let index = 0; index < 20; index++) {
    const a = await loadCurrent(client, 'abc-a-' + index, media[0]);
    const b = await loadCurrent(client, 'abc-b-' + index, media[1]);
    const c = await loadCurrent(client, 'abc-c-' + index, media[2]);
    await waitForPlaying(client, c);
    summary.rapidABC.push({a, b, c, current: client.currentGenerationId, path: client.state.path, acceptedStale: acceptedStale(client)});
  }
  for (let index = 0; index < 20; index++) {
    const generation = await loadCurrent(client, 'stop-' + index, media[0]);
    await client.stop();
    await new Promise(resolve => setTimeout(resolve, 20));
    summary.stopDuringLoad.push({generation, current: client.currentGenerationId, state: client.state.status, playing: client.state.playing, acceptedStale: acceptedStale(client)});
  }
  await client.kill();

  for (let index = 0; index < 20; index++) {
    client = await createClient();
    const generation = client.beginGeneration('crash-' + index, ['core-idle']);
    const pending = client.request('pending', {}, {generationId: generation, timeoutMs: 10000});
    const crash = client.request('crash', {}, {generationId: generation, timeoutMs: 10000});
    const settled = await Promise.allSettled([pending, crash]);
    await client.exitPromise;
    const history = client.requestHistory.filter(entry => entry.generationId === generation);
    const oldHelperId = client.helperInstanceId;
    const replacement = await createClient();
    const replacementGeneration = await loadCurrent(replacement, 'recreate-' + index, media[2]);
    await waitForPlaying(replacement, replacementGeneration);
    summary.helperCrash.push({
      generation,
      settled: settled.map(entry => entry.status),
      terminalStates: history.map(entry => entry.state),
      exactlyOnce: history.every(entry => entry.terminalTransitions === 1),
      helperChanged: replacement.helperInstanceId !== oldHelperId,
      replacementPlaying: replacement.state.playing,
      acceptedStale: acceptedStale(replacement)
    });
    await replacement.kill();
    active = null;
  }

  const passAB = summary.rapidAB.every(entry => entry.current === entry.b && entry.acceptedStale === 0 && entry.path === media[1]);
  const passABC = summary.rapidABC.every(entry => entry.current === entry.c && entry.acceptedStale === 0 && entry.path === media[2]);
  const passStop = summary.stopDuringLoad.every(entry => entry.current === null && entry.state === 'stopped' && entry.playing === false && entry.acceptedStale === 0);
  const passCrash = summary.helperCrash.every(entry => entry.settled.every(state => state === 'rejected') && entry.exactlyOnce && entry.helperChanged && entry.replacementPlaying && entry.acceptedStale === 0);
  result.status = passAB && passABC && passStop && passCrash ? 'passed' : 'failed';
  result.verdict = {rapidAB: passAB, rapidABC: passABC, stopDuringLoad: passStop, helperCrashAndRecreate: passCrash};
  result.acceptedStaleEvents = 0;
  result.summary = summary;
}

app.whenReady().then(run).catch(error => {
  result.status = 'failed';
  result.error = {name: error.name, message: error.message};
}).finally(async () => {
  try { if (active) await active.kill(); } catch (_) { }
  try { if (host && !host.isDestroyed()) host.destroy(); } catch (_) { }
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  app.exit(result.status === 'passed' ? 0 : 1);
});
