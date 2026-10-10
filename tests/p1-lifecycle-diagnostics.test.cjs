'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {NativeHelperClient, PROTOCOL_VERSION, validateIncoming} = require('../src/electronapp/native-helper/controller');
const diagnosticsIpc = require('../src/electronapp/enhanced/diagnostics-ipc');

function makeController(onDiagnostic) {
  const client = Object.create(NativeHelperClient.prototype);
  client.helperInstanceId = 'helper-current';
  client.currentGenerationId = null;
  client.currentLabel = null;
  client.generationCounter = 1000;
  client.timeline = [];
  client.state = {status: 'idle', path: null, playing: false, fileLoaded: false};
  client.pending = new Map();
  client.requestHistory = [];
  client.transportTerminated = false;
  client.exited = false;
  client.protocolFailure = null;
  client.closeOrdering = [];
  client.onDiagnostic = onDiagnostic;
  client.onEvent = message => client.delivered.push(message);
  client.onTerminal = () => {};
  client.delivered = [];
  client.commands = [];
  client.command = (method, params, generationId) => client.commands.push({method, params, generationId});
  return client;
}

function event(client, generationId, name, value, helperInstanceId) {
  const message = {
    protocolVersion: PROTOCOL_VERSION,
    type: 'event',
    scope: 'generation',
    helperInstanceId: helperInstanceId || client.helperInstanceId,
    generationId,
    name,
    value,
    rawEventId: generationId * 10,
    rawEventName: name,
    mediaIdentity: null
  };
  validateIncoming(message);
  return message;
}

for (const observerFailure of ['throw', 'reject']) {
  test(`native diagnostics observer ${observerFailure}s without changing generation event delivery`, async function () {
    const observations = [];
    const client = makeController(record => {
      observations.push(record);
      if (observerFailure === 'throw') throw new Error('observer-failure');
      return Promise.reject(new Error('observer-rejection'));
    });

    const generationA = client.beginGeneration('play-1-1');
    client.dispatch(event(client, generationA, 'start-file', {reason: 'A'}));
    client.dispatch(event(client, generationA, 'file-loaded', {path: 'A'}));

    const generationB = client.beginGeneration('play-2-2');
    client.dispatch(event(client, generationA, 'end-file', {reason: 0}));
    client.dispatch(event(client, generationB, 'start-file', {reason: 'B'}));
    client.dispatch(event(client, generationB, 'file-loaded', {path: 'B'}));
    client.dispatch(event(client, generationB, 'start-file', {reason: 'stale-helper'}, 'helper-old'));
    client.onTransportTerminal('stdout-end');
    client.dispatch(event(client, generationB, 'end-file', {reason: 0}));
    await Promise.resolve();

    assert.deepEqual(client.delivered.map(message => [message.generationId, message.name]), [
      [generationA, 'start-file'], [generationA, 'file-loaded'],
      [generationB, 'start-file'], [generationB, 'file-loaded']
    ]);
    assert.deepEqual(client.timeline.filter(item => ['ACCEPT', 'DROP_STALE_GENERATION', 'DROP_STALE_HELPER', 'DROP_TRANSPORT_TERMINAL'].includes(item.action))
      .map(item => [item.name, item.action]), [
      ['start-file', 'ACCEPT'], ['file-loaded', 'ACCEPT'],
      ['end-file', 'DROP_STALE_GENERATION'], ['start-file', 'ACCEPT'], ['file-loaded', 'ACCEPT'],
      ['start-file', 'DROP_STALE_HELPER'], ['end-file', 'DROP_TRANSPORT_TERMINAL']
    ]);
    assert.deepEqual(observations.filter(record => record.disposition === 'BEGIN_GENERATION').map(record => record.generationId),
      [generationA, generationB]);
    assert.ok(observations.some(record => record.disposition === 'RETIRE_GENERATION' && record.generationId === generationA));
    assert.ok(observations.some(record => record.disposition === 'DROP_STALE_GENERATION' && record.generationId === generationA));
    assert.ok(observations.some(record => record.disposition === 'DROP_STALE_HELPER' && record.generationId === generationB));
    assert.ok(observations.some(record => record.disposition === 'DROP_TRANSPORT_TERMINAL' && record.generationId === generationB));
    assert.equal(client.currentGenerationId, generationB, 'transport termination leaves the last authoritative generation snapshot intact');
    assert.equal(client.state.fileLoaded, true);
  });
}

test('unattributed native file events are observed without borrowing current generation', () => {
  const {createNativeDiagnostics} = require('../src/electronapp/enhanced/native-diagnostics');
  const output = [];
  const observe = createNativeDiagnostics(record => output.push(record));
  const client = makeController(record => observe({...record, helperRun: 1}));
  const current = client.beginGeneration('play-1-1');
  const message = {protocolVersion: PROTOCOL_VERSION, helperInstanceId: client.helperInstanceId,
    type: 'event', scope: 'helper', name: 'unattributed-native-event', rawEventName: 'end-file'};
  validateIncoming(message);
  client.dispatch(message);
  assert.equal(client.delivered.length, 0);
  assert.equal(output.at(-1).details.disposition, 'DROP_UNATTRIBUTED');
  assert.equal(output.at(-1).details.generationId, null);
  assert.equal(output.at(-1).details.currentGenerationId, current);
  assert.equal(output.at(-1).details.requestId, 'UNAVAILABLE');
});

class FakeIpcMain {
  constructor() { this.listeners = new Map(); this.handlers = new Map(); }
  on(channel, listener) { this.listeners.set(channel, listener); }
  removeListener(channel) { this.listeners.delete(channel); }
  handle(channel, handler) { this.handlers.set(channel, handler); }
  removeHandler(channel) { this.handlers.delete(channel); }
  emit(channel, event, record) { this.listeners.get(channel)?.(event, record); }
}

test('renderer diagnostic IPC rejects other WebContents and child frames, and projects accepted records', function () {
  const ipcMain = new FakeIpcMain();
  const currentWebContents = {mainFrame: {id: 'main-frame', url: require('./helpers/trusted-renderer.cjs').appUrl}};
  const otherWebContents = {mainFrame: {id: 'other-main'}};
  const output = [];
  const root = path.join(__dirname, '..', 'src', 'electronapp');
  const unregister = diagnosticsIpc.register({
    ipcMain,
    getWebContents: () => currentWebContents,
    appRoot: root,
    logger: record => output.push(record)
  });
  const channel = diagnosticsIpc.CHANNELS.LOG;
  const input = {
    category: 'renderer',
    event: 'global-error',
    details: {
      errorType: 'ReferenceError',
      messageKind: 'reference-not-defined',
      location: {script: 'main.js', line: 17, column: 9},
      frames: [{script: 'main.js', line: 20, column: 3}],
      token: 'must-not-be-copied',
      path: 'C:\\private\\must-not-be-copied'
    }
  };

  ipcMain.emit(channel, {sender: otherWebContents, senderFrame: otherWebContents.mainFrame}, input);
  ipcMain.emit(channel, {sender: currentWebContents, senderFrame: {id: 'child-frame'}}, input);
  assert.equal(output.length, 0);

  ipcMain.emit(channel, {sender: currentWebContents, senderFrame: currentWebContents.mainFrame}, input);
  assert.deepEqual(output, [{
    category: 'renderer',
    event: 'global-error',
    details: {
      errorType: 'ReferenceError',
      messageKind: 'reference-not-defined',
      location: {script: 'main.js', line: 17, column: 9},
      frames: [{script: 'main.js', line: 20, column: 3}]
    }
  }]);
  assert.doesNotMatch(JSON.stringify(output), /must-not-be-copied|private/);
  unregister();
  assert.equal(ipcMain.listeners.has(channel), false);
});
