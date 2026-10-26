'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const smoke = require('../tools/shared-playback-cache/windows-smoke.cjs');

const tick = () => new Promise(resolve => setImmediate(resolve));

test('budget observer returns the exact promise and reports only its settled shape and elapsed time', async () => {
  let resolveRead, now = 10;
  const pending = new Promise(resolve => {resolveRead = resolve;});
  const events = [];
  const returned = smoke.observeCacheBudgetRead(() => pending, event => events.push(event), () => now);
  assert.strictEqual(returned, pending);
  assert.deepEqual(events, [{operation: 'read-begin'}]);
  now = 47;
  resolveRead('1048576');
  assert.equal(await returned, '1048576');
  await tick();
  assert.deepEqual(events, [
    {operation: 'read-begin'},
    {operation: 'read-settled', outcome: 'resolved', shapeValid: true, elapsedMs: 37},
  ]);
  assert.doesNotMatch(JSON.stringify(events), /1048576/);
});

test('synchronous read errors are rethrown as the same object and safely observed', () => {
  const secret = 'private-budget-diagnostic-do-not-log';
  const error = Error(secret);
  const events = [];
  let now = 100;
  assert.throws(() => smoke.observeCacheBudgetRead(() => {
    now = 106;
    throw error;
  }, event => events.push(event), () => now), actual => actual === error);
  assert.deepEqual(events, [
    {operation: 'read-begin'},
    {operation: 'read-settled', outcome: 'threw', shapeValid: false, elapsedMs: 6},
  ]);
  assert.doesNotMatch(JSON.stringify(events), new RegExp(secret));
  const reportError = Error('observer-also-threw');
  assert.throws(() => smoke.observeCacheBudgetRead(() => {throw error;}, () => {throw reportError;}, () => 2),
    actual => actual === error, 'observer failure must not replace the synchronous read error');
});

test('async rejection preserves promise identity and rejection without unhandled observer rejection or private text', async t => {
  const secret = 'private-error-text-must-not-escape';
  const error = Object.assign(Error(secret), {state: 'TIMED_OUT'});
  let rejectRead, now = 3;
  const pending = new Promise((_, reject) => {rejectRead = reject;});
  const events = [];
  const unhandled = [];
  const onUnhandled = reason => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  t.after(() => process.off('unhandledRejection', onUnhandled));
  const returned = smoke.observeCacheBudgetRead(() => pending, event => events.push(event), () => now);
  assert.strictEqual(returned, pending);
  now = 12;
  rejectRead(error);
  await assert.rejects(returned, actual => actual === error);
  await tick();
  assert.deepEqual(events, [
    {operation: 'read-begin'},
    {operation: 'read-settled', outcome: 'rejected', shapeValid: false, elapsedMs: 9, requestState: 'TIMED_OUT'},
  ]);
  assert.deepEqual(unhandled, []);
  assert.doesNotMatch(JSON.stringify(events), new RegExp(secret));
});

test('throwing observers cannot alter resolved or rejected read outcomes', async () => {
  const report = () => {throw Error('observer-failed');};
  const resolved = Promise.resolve('786432');
  assert.strictEqual(smoke.observeCacheBudgetRead(() => resolved, report, () => 1), resolved);
  assert.equal(await resolved, '786432');
  await tick();

  const rejection = Error('read-failed');
  const rejected = Promise.reject(rejection);
  const returned = smoke.observeCacheBudgetRead(() => rejected, report, () => 2);
  assert.strictEqual(returned, rejected);
  await assert.rejects(returned, actual => actual === rejection);
  await tick();
});

test('shape validation accepts bounded Native integers and legacy decimal snapshots', async () => {
  for (const [value, expected] of [
    ['262144', true], ['3221225472', true], ['262143', false], ['3221225473', false],
    ['not-a-size-private', false], [3221225472, true], [null, false],
  ]) {
    const events = [];
    const pending = Promise.resolve(value);
    assert.strictEqual(smoke.observeCacheBudgetRead(() => pending, event => events.push(event), () => 5), pending);
    await pending;
    await tick();
    assert.equal(events[1].shapeValid, expected);
    assert.equal(Object.hasOwn(events[1], 'value'), false);
    assert.equal(Object.hasOwn(events[1], 'error'), false);
    assert.equal(Object.hasOwn(events[1], 'result'), false);
  }
});

test('ObservedClient budget instrumentation preserves the original three proxy methods when record throws', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../tools/shared-playback-cache/windows-electron.cjs'), 'utf8');
  const classStart = source.indexOf('    class ObservedClient extends productClient {');
  const methodsStart = source.indexOf('      setProperty(name, value) {', classStart);
  const methodsEnd = source.indexOf('      load(args) {', methodsStart);
  assert.ok(classStart >= 0 && methodsStart > classStart && methodsEnd > methodsStart,
    'source extraction must find ObservedClient and end immediately before load(args)');
  const methods = source.slice(methodsStart, methodsEnd);
  assert.match(methods, /setProperty\(name, value\)/);
  assert.match(methods, /submitCommand\(args\)/);
  assert.match(methods, /getProperty\(name, timeoutMs\)/);
  assert.doesNotMatch(methods, /load\(args\)/);

  class ControlledBase {
    constructor() {
      this.currentGenerationId = 9;
      this.calls = [];
      this.setResult = {set: 'sentinel'};
      this.commandResult = Promise.resolve({command: 'sentinel'});
      this.readResult = Promise.resolve('1048576');
      this.throwFor = null;
    }
    setProperty(...args) {this.calls.push(['setProperty', ...args]); if (this.throwFor) throw this.throwFor; return this.setResult;}
    submitCommand(...args) {this.calls.push(['submitCommand', ...args]); if (this.throwFor) throw this.throwFor; return this.commandResult;}
    getProperty(...args) {this.calls.push(['getProperty', ...args]); if (this.throwFor) throw this.throwFor; return this.readResult;}
  }
  const recordCalls = [], recordError = Error('record-failed');
  const record = (...args) => {recordCalls.push(args); throw recordError;};
  const makeObserved = new Function('Base', 'driver', 'contexts', 'record', 'receiptWritten',
    'return class ObservedClientProbe extends Base {' + methods + '\n};');
  const ObservedClientProbe = makeObserved(ControlledBase, smoke, new Map([[9, 'A']]), record, false);
  const client = new ObservedClientProbe();
  const cacheKey = 'user-data/emby-theater-enhanced/diagnostics/cache-bytes';
  const setArgs = [cacheKey, ''];
  const commandArgs = ['expand-properties', 'set', cacheKey, '${=demuxer-max-bytes}'];

  assert.strictEqual(client.setProperty(...setArgs), client.setResult);
  assert.strictEqual(client.submitCommand(commandArgs), client.commandResult);
  assert.strictEqual(client.getProperty(cacheKey, 123), client.readResult);
  assert.deepEqual(client.calls, [
    ['setProperty', ...setArgs], ['submitCommand', commandArgs], ['getProperty', cacheKey, 123],
  ]);
  await client.readResult;
  await tick();
  assert.equal(recordCalls.length, 4, 'clear, expand, read-begin and read-settled reached the throwing recorder');

  const baseError = Error('controlled-base-sync-failure');
  client.throwFor = baseError;
  assert.throws(() => client.setProperty(...setArgs), actual => actual === baseError);
  assert.throws(() => client.submitCommand(commandArgs), actual => actual === baseError);
  assert.throws(() => client.getProperty(cacheKey, 456), actual => actual === baseError);
  assert.deepEqual(client.calls.slice(-3), [
    ['setProperty', ...setArgs], ['submitCommand', commandArgs], ['getProperty', cacheKey, 456],
  ]);

  const directRecords = [], directClient = new (makeObserved(ControlledBase, smoke, new Map([[9, 'A']]),
    (type, data) => directRecords.push({type, ...data}), false))();
  directClient.readResult = Promise.resolve(3221225472);
  assert.strictEqual(directClient.getProperty('demuxer-max-bytes', 50), directClient.readResult);
  await directClient.readResult;
  await tick();
  assert.deepEqual(directClient.calls, [['getProperty', 'demuxer-max-bytes', 50]], 'direct Native budget uses one read and no legacy commands');
  assert.deepEqual(directRecords.map(row => [row.type, row.property, row.operation]), [
    ['cache-budget', 'native-node', 'read-begin'], ['cache-budget', 'native-node', 'read-settled'],
  ]);
  assert.equal(directRecords[1].shapeValid, true);
  assert.doesNotMatch(JSON.stringify(directRecords), /3221225472/);
});

function transportProbe(record, item = 'B') {
  const source = fs.readFileSync(path.join(__dirname, '../tools/shared-playback-cache/windows-electron.cjs'), 'utf8');
  const begin = source.indexOf('      sendEnvelope(message) {'), end = source.indexOf('      setProperty(name, value) {', begin);
  assert.ok(begin > 0 && end > begin);
  class Base {
    constructor() {this.helperInstanceId = 'owned-helper'; this.outboundQueue = []; this.outboundBytes = 0; this.pending = new Map(); this.calls = []; this.writeBlocked = false; this.returned = {owned: true};}
    sendEnvelope(message) {this.calls.push(['send', message]); if (this.fail) throw this.fail; return this.returned;}
    dispatch(message) {this.calls.push(['dispatch', message]); this.pending.delete(message.requestId); if (this.fail) throw this.fail; return this.returned;}
  }
  const make = new Function('productClient', 'contexts', 'record', 'return class extends productClient {' + source.slice(begin, end) + '};');
  const Observed = make(Base, new Map([[103, item]]), record);
  return new Observed();
}
test('actual transport observer binds one budget request and response without changing traffic or exposing payload', () => {
  const events = [], client = transportProbe((type, data) => events.push({type, ...data}));
  const message = {type: 'request', requestId: 7, generationId: 103, method: 'get-property', params: {name: 'demuxer-max-bytes', private: 'PRIVATE_REQUEST_VALUE'}};
  client.pending.set(7, {});
  assert.equal(client.sendEnvelope(message), client.returned);
  const wrong = {type: 'response', helperInstanceId: 'owned-helper', requestId: 7, generationId: 101, result: 'PRIVATE_RESPONSE_VALUE'};
  assert.equal(client.dispatch(wrong), client.returned);
  assert.equal(events.length, 2, 'a stale generation cannot be labeled the current budget response');
  assert.equal(client.dispatch({...wrong, generationId: 103, helperInstanceId: 'stale-helper'}), client.returned);
  assert.equal(events.length, 2, 'a foreign helper cannot be labeled the current budget response');
  client.pending.set(7, {});
  const response = {...wrong, generationId: 103};
  assert.equal(client.dispatch(response), client.returned);
  assert.deepEqual(events.map(x => x.operation), ['request-send-begin', 'request-send-return', 'response-enter', 'response-dispatched']);
  assert.deepEqual(events.slice(2).map(x => x.pending), [true, false]);
  assert.equal(client.calls[0][1], message); assert.equal(client.calls[3][1], response);
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE|demuxer-max-bytes/);
  assert.equal(client.budgetRequestIds.size, 0);
  assert.equal(client.dispatch({type: 'event', name: 'time-pos'}), client.returned, 'untracked messages still dispatch unchanged');
  const privateEvents = [], privateClient = transportProbe((type, data) => privateEvents.push(data), 'PRIVATE_ITEM');
  privateClient.sendEnvelope(message);
  assert.deepEqual(privateEvents.map(event => event.item), [null, null]);
  assert.doesNotMatch(JSON.stringify(privateEvents), /PRIVATE/);
});
test('throwing diagnostics cannot change actual transport return values or exceptions', () => {
  const client = transportProbe(() => {throw Error('observer-failed');});
  const message = {type: 'request', requestId: 9, generationId: 103, method: 'get-property', params: {name: 'demuxer-max-bytes'}};
  assert.equal(client.sendEnvelope(message), client.returned);
  assert.equal(client.dispatch({type: 'response', helperInstanceId: 'owned-helper', requestId: 9, generationId: 103}), client.returned);
  client.fail = Error('owned-transport-failure');
  assert.throws(() => client.sendEnvelope({...message, requestId: 10}), error => error === client.fail);
  assert.throws(() => client.dispatch({type: 'error', helperInstanceId: 'owned-helper', requestId: 10, generationId: 103}), error => error === client.fail);
});
test('actual IPC observer records batch acceptance, context and load boundaries without delaying or changing handler values', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../tools/shared-playback-cache/windows-electron.cjs'), 'utf8');
  const begin = source.indexOf('    const observedIpc ='), end = source.indexOf('    unregisterNative =', begin);
  const handlers = new Map(), events = [], contexts = new Map([[103, 'B']]);
  const sandbox = {ipcMain: {handle(channel, fn) {handlers.set(channel, fn);}}, boundary: {isTrusted: event => event.trusted},
    mainWindow: {webContents: {}}, contexts, record: (type, data) => events.push({type, ...data}), currentItem: null, lastGeneration: null};
  require('node:vm').runInNewContext(source.slice(begin, end) + '\napi = observedIpc;', sandbox);
  const result = {status: 'accepted'}; let finish;
  sandbox.api.handle('enhanced-native-helper-call', () => new Promise(resolve => {finish = () => resolve(result);}));
  const invoke = handlers.get('enhanced-native-helper-call');
  const pending = invoke({trusted: true}, {operation: 'set-properties', payload: {generationId: 103, entries: [{name: 'profile', value: 'PRIVATE_PROFILE'}]}});
  assert.deepEqual(events.map(x => x.operation), ['entered']); finish(); assert.equal(await pending, result);
  assert.deepEqual(events.map(x => [x.phase, x.operation]), [['settings-batch', 'entered'], ['settings-batch', 'returned']]);
  contexts.set(103, 'PRIVATE_ITEM');
  for (const [operation, extra] of [['range-context', {context: {itemId: 'B'}}], ['command', {data: ['loadfile', 'PRIVATE_URL']}]]) {
    const work = invoke({trusted: true}, {operation, payload: {generationId: 103, ...extra}}); finish(); assert.equal(await work, result);
  }
  assert.deepEqual(events.filter(x => x.type === 'selection-ipc').map(x => x.phase), ['settings-batch', 'settings-batch', 'range-context', 'range-context', 'load-selection', 'load-selection']);
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE/);
  const handlerError = Error('PRIVATE_HANDLER_ERROR');
  sandbox.api.handle('enhanced-native-helper-call', () => {throw handlerError;});
  await assert.rejects(handlers.get('enhanced-native-helper-call')({trusted: true}, {operation: 'range-context', payload: {generationId: 103}}), error => error === handlerError);
  assert.equal(events.at(-1).operation, 'rejected');
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE/);
});
