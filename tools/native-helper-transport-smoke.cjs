'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {app, BrowserWindow} = require('electron');
const {NativeHelperClient, encodeFrame} = require('../src/electronapp/native-helper/controller');
const {decimalWindowHandle, EXPECTED_LIBMPV_VERSION} = require('../src/electronapp/native-helper/service');

const args = process.argv.slice(2).map(value => path.resolve(value));
if (args.length !== 4) throw new Error('Usage: electron native-helper-transport-smoke.cjs <helper> <libmpv> <media> <output>');
const [helperPath, libmpvPath, mediaPath, outputPath] = args;
const result = {schemaVersion: 1, status: 'running', electron: process.versions.electron};
let host;
let active;

async function createClient() {
  const client = new NativeHelperClient({helperPath, libmpvPath, parentWindowHandle: decimalWindowHandle(host), expectedLibmpvVersion: EXPECTED_LIBMPV_VERSION});
  await client.start();
  active = client;
  return client;
}

async function expectExitAfterRaw(raw, label) {
  const client = await createClient();
  client.sendRaw(raw);
  const exit = await Promise.race([
    client.exitPromise,
    new Promise((resolve, reject) => setTimeout(() => reject(new Error('timeout:' + label)), 5000))
  ]);
  active = null;
  return {label, exited: true, code: exit.code, protocolFailure: client.protocolFailure, pending: client.pending.size};
}

async function run() {
  host = new BrowserWindow({width: 640, height: 360, frame: false, show: true, backgroundColor: '#000'});
  await host.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<style>html,body{margin:0;background:#000}</style>'));
  const checks = {};

  let client = await createClient();
  const generation = client.beginGeneration('pressure', ['time-pos', 'core-idle']);
  client.load(['loadfile', mediaPath]);
  await client.waitFor(() => client.timeline.some(event => event.generationId === generation && event.name === 'core-idle' && event.value === false && event.action === 'ACCEPT'), 10000, 'playing');
  const stderr = await client.request('stderr-storm', {bytes: 1024 * 1024}, {generationId: generation, mediaScoped: false, timeoutMs: 10000});
  client.pauseRead();
  const storm = client.request('transport-storm', {count: 20000}, {generationId: generation, mediaScoped: false, timeoutMs: 15000});
  await new Promise(resolve => setTimeout(resolve, 300));
  client.resumeRead();
  const stormResult = await storm;
  const queue = await client.request('queue-stats', {}, {generationId: generation, mediaScoped: false, timeoutMs: 5000});
  const noop = encodeFrame({protocolVersion: 1, type: 'command', helperInstanceId: client.helperInstanceId, generationId: generation, method: 'command-noop', params: {}});
  client.sendRaw(noop.subarray(0, 2));
  client.sendRaw(noop.subarray(2, 11));
  client.sendRaw(noop.subarray(11));
  await client.request('queue-stats', {}, {generationId: generation, mediaScoped: false, timeoutMs: 5000});
  checks.pressure = {
    stderrBytes: stderr.stderrBytes,
    stderrObservedBytes: client.stderrObservedBytes,
    stderrRetainedBytes: client.stderrRetainedBytes,
    stormSubmitted: stormResult.submitted,
    queue,
    partialFrameAccepted: true
  };
  await client.kill();

  client = await createClient();
  const malformedGeneration = client.beginGeneration('malformed-output', ['core-idle']);
  const malformed = client.request('emit-malformed-response', {}, {generationId: malformedGeneration, timeoutMs: 5000});
  await Promise.allSettled([malformed]);
  await client.exitPromise;
  checks.malformedHelperOutput = {protocolFailure: client.protocolFailure, pending: client.pending.size, acceptedAfterFailure: client.timeline.filter(event => event.action === 'ACCEPT').length};
  active = null;

  const zero = Buffer.alloc(4);
  const oversized = Buffer.alloc(4); oversized.writeUInt32LE(65537, 0);
  const invalidUtf8 = Buffer.from([2, 0, 0, 0, 0xc3, 0x28]);
  const malformedJsonPayload = Buffer.from('{', 'utf8');
  const malformedJson = Buffer.concat([Buffer.from([malformedJsonPayload.length, 0, 0, 0]), malformedJsonPayload]);
  const unsupported = encodeFrame({protocolVersion: 2, type: 'command', helperInstanceId: 'wrong', generationId: 1, method: 'command-noop', params: {}});
  checks.failClosedInputs = [];
  for (const [label, raw] of [['zero', zero], ['oversized', oversized], ['invalid-utf8', invalidUtf8], ['malformed-json', malformedJson], ['unsupported-version', unsupported]]) {
    checks.failClosedInputs.push(await expectExitAfterRaw(raw, label));
  }

  client = await createClient();
  const closeGeneration = client.beginGeneration('pipe-close', ['time-pos']);
  client.load(['loadfile', mediaPath]);
  client.pauseRead();
  const closePending = client.request('transport-storm', {count: 20000}, {generationId: closeGeneration, mediaScoped: false, timeoutMs: 10000});
  await new Promise(resolve => setTimeout(resolve, 100));
  client.closeReadSide();
  const closeSettled = await Promise.allSettled([closePending]);
  await client.exitPromise;
  checks.pipeCloseDuringQueuedWrite = {settled: closeSettled[0].status, pending: client.pending.size, exactlyOnce: client.requestHistory.every(entry => entry.terminalTransitions === 1)};
  active = null;

  const pressurePass = checks.pressure.stderrBytes === 1024 * 1024 && checks.pressure.stderrObservedBytes === 1024 * 1024 &&
    checks.pressure.stderrRetainedBytes <= 64 * 1024 && checks.pressure.stormSubmitted === 20000 &&
    checks.pressure.queue.peakFrames <= checks.pressure.queue.maxPendingFrames && checks.pressure.queue.peakBytes <= checks.pressure.queue.maxPendingBytes;
  const malformedPass = !!checks.malformedHelperOutput.protocolFailure && checks.malformedHelperOutput.pending === 0 && checks.malformedHelperOutput.acceptedAfterFailure === 0;
  const inputPass = checks.failClosedInputs.every(entry => entry.exited && entry.pending === 0);
  const closePass = checks.pipeCloseDuringQueuedWrite.settled === 'rejected' && checks.pipeCloseDuringQueuedWrite.pending === 0 && checks.pipeCloseDuringQueuedWrite.exactlyOnce;
  result.status = pressurePass && malformedPass && inputPass && closePass ? 'passed' : 'failed';
  result.verdict = {boundedPressureAndStderr: pressurePass, malformedHelperOutput: malformedPass, failClosedInputs: inputPass, pipeCloseDuringQueuedWrite: closePass};
  result.checks = checks;
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
