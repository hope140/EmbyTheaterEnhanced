'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {app, BrowserWindow} = require('electron');
const {NativeHelperClient, encodeFrame} = require('../src/electronapp/native-helper/controller');
const {decimalWindowHandle, EXPECTED_LIBMPV_VERSION} = require('../src/electronapp/native-helper/service');

const args = process.argv.slice(2).map(value => path.resolve(value));
if (args.length !== 3) throw new Error('Usage: electron native-helper-operation-failure-smoke.cjs <testing-helper> <libmpv> <output>');
const [helperPath, libmpvPath, outputPath] = args;
const result = {schemaVersion: 1, status: 'running', electron: process.versions.electron, visibleWindows: 0};
let host;
let active;

async function createClient() {
  const client = new NativeHelperClient({
    helperPath,
    libmpvPath,
    parentWindowHandle: decimalWindowHandle(host),
    expectedLibmpvVersion: EXPECTED_LIBMPV_VERSION
  });
  await client.start();
  active = client;
  return client;
}

async function run() {
  host = new BrowserWindow({width: 640, height: 360, frame: false, show: false, focusable: false, alwaysOnTop: false, backgroundColor: '#000'});
  await host.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<style>html,body{margin:0;background:#000}</style>'));

  let client = await createClient();
  const generation = client.beginGeneration('operation-failure-regression', []);
  const before = client.snapshot();
  await client.request('reject-next-operation', {operation: 'set-property'}, {generationId: generation, mediaScoped: false, timeoutMs: 2000});
  client.setProperty('sub-back-color', '0/0/0/1');
  await client.waitFor(() => client.operationErrors.length === 1, 2000, 'set-property-operation-error');
  await client.request('reject-next-operation', {operation: 'command'}, {generationId: generation, mediaScoped: false, timeoutMs: 2000});
  client.submitCommand(['cycle', 'pause']);
  await client.waitFor(() => client.operationErrors.length === 2, 2000, 'command-operation-error');
  const subsequent = await client.getProperty('mpv-version', 2000);
  const after = client.snapshot();
  result.nonfatalSetProperty = {
    setPropertyError: after.operationErrors[0],
    commandError: after.operationErrors[1],
    samePid: before.helperPid === after.helperPid,
    sameHelperInstanceId: before.helperInstanceId === after.helperInstanceId,
    sameGenerationId: generation === after.currentGenerationId,
    transportOpen: client.child.stdin.writable && !client.transportTerminated,
    protocolReady: !client.protocolFailure && !client.exited,
    subsequentOperationSucceeded: typeof subsequent === 'string' && subsequent.length > 0,
    stdoutEndObserved: after.closeOrdering.some(entry => entry.name === 'stdout-end')
  };
  await client.kill();
  active = null;

  client = await createClient();
  const malformed = encodeFrame({protocolVersion: 2, type: 'command', helperInstanceId: client.helperInstanceId, generationId: 1, method: 'command', params: {args: ['cycle', 'pause']}});
  client.sendRaw(malformed);
  const exit = await Promise.race([
    client.exitPromise,
    new Promise((resolve, reject) => setTimeout(() => reject(new Error('timeout:protocol-fatal')), 5000))
  ]);
  result.protocolFatal = {
    exitCode: exit.code,
    exited: true,
    protocolErrorObserved: client.timeline.some(entry => entry.name === 'protocol-error' && entry.reason === 'unsupported-protocol-version'),
    closeOrdering: client.closeOrdering
  };
  active = null;

  const positive = result.nonfatalSetProperty;
  const positivePass = positive.setPropertyError && positive.setPropertyError.operation === 'set-property' &&
    positive.setPropertyError.property === 'sub-back-color' && positive.setPropertyError.fatal === false &&
    positive.commandError && positive.commandError.operation === 'command' && positive.commandError.property === null && positive.commandError.fatal === false &&
    positive.samePid && positive.sameHelperInstanceId && positive.sameGenerationId && positive.transportOpen &&
    positive.protocolReady && positive.subsequentOperationSucceeded && !positive.stdoutEndObserved;
  const negativePass = result.protocolFatal.exited && result.protocolFatal.exitCode === 20 && result.protocolFatal.protocolErrorObserved;
  result.verdict = {nonfatalOperationFailure: !!positivePass, protocolFatalFailClosed: !!negativePass};
  result.status = positivePass && negativePass ? 'passed' : 'failed';
}

app.whenReady().then(run).catch(error => {
  result.status = 'failed'; result.error = {name: error.name, message: error.message};
}).finally(async () => {
  try { if (active) await active.kill(); } catch (_) { }
  try { if (host && !host.isDestroyed()) host.destroy(); } catch (_) { }
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  app.exit(result.status === 'passed' ? 0 : 1);
});
