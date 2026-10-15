'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const test = require('node:test');
const {CHANNELS, register} = require('../src/electronapp/enhanced/mpv-kernel-ipc');

function harness(options = {}) {
  const handlers = new Map();
  const removed = [];
  const calls = [];
  const ipcMain = {
    handle(channel, handler) { handlers.set(channel, handler); },
    removeHandler(channel) { removed.push(channel); handlers.delete(channel); }
  };
  const webContents = {isDestroyed: () => false};
  webContents.mainFrame = {url: pathToFileURL(path.join(__dirname, '..', 'src/electronapp/www/index.html')).href};
  const event = {sender: webContents, senderFrame: webContents.mainFrame};
  const store = options.store === undefined ? {
    async getStatus() { calls.push(['status']); return {status: 'ok', selectedCandidateId: null, selectionState: 'missing', candidates: [], lastActivation: null}; },
    async importPackageFile(file) { calls.push(['import', file]); return {candidate: {candidateId: 'a'.repeat(64), version: 'mpv v0.42.0', sizeBytes: 12}, selected: false}; },
    async selectCandidate(id) { calls.push(['select', id]); return {selectedCandidateId: id, pendingRestart: true}; },
    async close() { calls.push(['close']); }
  } : options.store;
  const dialog = options.dialog || {async showOpenDialog() { calls.push(['dialog']); return {canceled: false, filePaths: ['C:\\picked\\candidate.zip']}; }};
  const service = {kernelStatus: () => ({startupSelection: 'baseline', activeCandidateId: null, activationState: 'baseline-lazy'})};
  const unregister = register({ipcMain, getWebContents: () => webContents, getBrowserWindow: () => ({id: 1}), dialog, store, service,
    unavailableReason: options.unavailableReason});
  return {handlers, removed, calls, event, webContents, store, unregister};
}

test('status and import are main-owned, typed and omit selected file paths', async () => {
  const h = harness();
  const status = await h.handlers.get(CHANNELS.GET_STATUS)(h.event);
  assert.equal(status.status, 'ok');
  assert.equal(status.runtime.activationState, 'baseline-lazy');
  assert.equal(Object.hasOwn(status, 'path'), false);

  const invalid = await h.handlers.get(CHANNELS.IMPORT)(h.event, {path: 'C:\\arbitrary.zip'});
  assert.deepEqual(invalid, {status: 'error', reason: 'invalid-request'});
  assert.equal(h.calls.some(call => call[0] === 'dialog'), false);
  const imported = await h.handlers.get(CHANNELS.IMPORT)(h.event);
  assert.equal(imported.status, 'imported');
  assert.equal(imported.candidate.candidateId, 'a'.repeat(64));
  assert.equal(JSON.stringify(imported).includes('picked'), false);
  assert.deepEqual(h.calls.find(call => call[0] === 'import'), ['import', 'C:\\picked\\candidate.zip']);
  await h.unregister();
});

test('sender trust, selection schema and dialog cancellation are enforced', async () => {
  const h = harness({dialog: {async showOpenDialog() { h.calls.push(['dialog']); return {canceled: true, filePaths: []}; }}});
  const untrusted = await h.handlers.get(CHANNELS.SELECT)({sender: {}, senderFrame: {url: 'https://example.invalid'}} , {candidateId: null});
  assert.deepEqual(untrusted, {status: 'error', reason: 'untrusted_sender'});
  assert.deepEqual(await h.handlers.get(CHANNELS.SELECT)(h.event, {candidateId: null, path: 'C:\\x'}),
    {status: 'error', reason: 'invalid-request'});
  assert.deepEqual(await h.handlers.get(CHANNELS.SELECT)(h.event, {candidateId: 'A'.repeat(64)}),
    {status: 'error', reason: 'invalid-request'});
  assert.deepEqual(await h.handlers.get(CHANNELS.IMPORT)(h.event), {status: 'cancelled'});
  assert.equal(h.calls.some(call => call[0] === 'import'), false);
  const selected = await h.handlers.get(CHANNELS.SELECT)(h.event, {candidateId: null});
  assert.equal(selected.status, 'selected');
  assert.equal(selected.pendingRestart, true);
  await h.unregister();
});

test('missing verified helper identity keeps baseline available and candidate controls unavailable', async () => {
  let dialogs = 0;
  const h = harness({store: null, dialog: {async showOpenDialog() { dialogs++; return {canceled: false, filePaths: []}; }}});
  const status = await h.handlers.get(CHANNELS.GET_STATUS)(h.event);
  assert.deepEqual(status, {status: 'unavailable', reason: 'package-identity-unavailable', runtime: {
    startupSelection: 'baseline', activeCandidateId: null, activationState: 'baseline-lazy'
  }});
  assert.equal((await h.handlers.get(CHANNELS.IMPORT)(h.event)).status, 'unavailable');
  assert.equal((await h.handlers.get(CHANNELS.SELECT)(h.event, {candidateId: null})).status, 'unavailable');
  assert.equal(dialogs, 0);
  await h.unregister();
});

test('verified helper with unavailable profile store keeps a distinct reason and baseline runtime status', async () => {
  const h = harness({store: null, unavailableReason: 'store-unavailable'});
  const status = await h.handlers.get(CHANNELS.GET_STATUS)(h.event);
  assert.equal(status.status, 'unavailable');
  assert.equal(status.reason, 'store-unavailable');
  assert.equal(status.runtime.activationState, 'baseline-lazy');
  await h.unregister();
});

test('unregister removes narrow handlers and closes the store', async () => {
  const h = harness();
  await h.unregister();
  assert.deepEqual(h.removed.sort(), [CHANNELS.GET_STATUS, CHANNELS.IMPORT, CHANNELS.SELECT].sort());
  assert.equal(h.calls.some(call => call[0] === 'close'), true);
  assert.equal(h.handlers.size, 0);
});

test('unregister does not wait forever for a native dialog and late selection cannot enter the store', async () => {
  let resolveDialog;
  const calls = [];
  const store = {
    async getStatus() { return {status: 'ok', selectedCandidateId: null, selectionState: 'missing', candidates: [], lastActivation: null}; },
    async importPackageFile(file) { calls.push(['import', file]); return {candidate: {candidateId: 'a'.repeat(64)}}; },
    async selectCandidate(id) { calls.push(['select', id]); return {selectedCandidateId: id, pendingRestart: true}; },
    async close() { calls.push(['close']); }
  };
  const h = harness({store, dialog: {showOpenDialog() { return new Promise(resolve => { resolveDialog = resolve; }); }}});
  const pendingImport = h.handlers.get(CHANNELS.IMPORT)(h.event);
  await new Promise(resolve => setImmediate(resolve));
  const closed = await Promise.race([
    h.unregister(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('unregister-hung-on-dialog')), 100))
  ]);
  assert.equal(closed, undefined);
  assert.deepEqual(calls, [['close']]);
  resolveDialog({canceled: false, filePaths: ['C:\\late\\candidate.zip']});
  assert.deepEqual(await pendingImport, {status: 'error', reason: 'store-closed'});
  assert.deepEqual(calls, [['close']]);
});
