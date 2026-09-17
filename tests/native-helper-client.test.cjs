'use strict';

const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const test = require('node:test');
const clientModule = require('../src/electronapp/native-helper/client');

class FakeIpc extends EventEmitter {
  constructor(handler) { super(); this.calls = []; this.notifications = []; this.handler = handler || null; this.nextGenerationId = 40; }
  invoke(channel, request) {
    this.calls.push({channel, request});
    if (this.handler) {
      const handled = this.handler(channel, request, this);
      if (handled !== undefined) return Promise.resolve(handled);
    }
    if (request.operation === 'create') return Promise.resolve({status: 'ok', mode: 'native-helper', endpointId: 'endpoint-1', protocolVersion: 1, helperVersion: '1', libmpvVersion: 'mpv'});
    if (request.operation === 'begin-generation') return Promise.resolve({status: 'ok', generationId: ++this.nextGenerationId});
    if (request.operation === 'get-property') return Promise.resolve({status: 'ok', value: {structured: true}});
    return Promise.resolve({status: request.operation === 'command' ? 'accepted' : 'ok'});
  }
  send(channel, request) { this.notifications.push({channel, request}); }
}

const CACHE_PROPERTY = 'user-data/emby-theater-enhanced/diagnostics/cache-bytes';

function operationCalls(ipc, operation) {
  return ipc.calls.filter(call => call.request.operation === operation);
}

test('renderer endpoint maps the legacy logical API without exposing raw transport', async function () {
  const ipc = new FakeIpc();
  const created = await clientModule.create({ipc});
  const endpoint = created.endpoint;
  const messages = [];
  endpoint.addEventListener('message', event => messages.push(event.data));
  await endpoint.observeProperties(['core-idle']);
  await endpoint.beginGeneration('play-1');
  await endpoint.setProperties({pause: false, volume: 75});
  await endpoint.sendCommand(['loadfile', 'fixture.mp4']);
  assert.deepEqual(await endpoint.getProperty('video-out-params'), {structured: true});
  endpoint.postMessage({type: 'get_property_async', data: 'video-out-params'});
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(messages.some(message => message.type === 'property_change' && message.data.name === 'video-out-params'));
  ipc.emit(clientModule.EVENT_CHANNEL, {}, {type: 'property_change', data: {name: 'core-idle', value: false}});
  assert.ok(messages.some(message => message.data && message.data.name === 'core-idle'));
  endpoint.style.opacity = 1;
  assert.equal(ipc.notifications.at(-1).request.operation, 'set-visible');
  await endpoint.destroy();
});

test('explicit pepper mode returns no native endpoint', async function () {
  const ipc = new FakeIpc();
  ipc.invoke = function () { return Promise.resolve({status: 'ok', mode: 'pepper'}); };
  const created = await clientModule.create({ipc});
  assert.equal(created.mode, 'pepper');
  assert.equal(created.endpoint, null);
});

test('optional legacy property lookup failure is unavailable, not a fatal bridge error', async function () {
  const ipc = new FakeIpc();
  const originalInvoke = ipc.invoke.bind(ipc);
  ipc.invoke = function (channel, request) {
    if (request.operation === 'get-property') return Promise.resolve({status: 'error', reason: 'property-unavailable'});
    return originalInvoke(channel, request);
  };
  const created = await clientModule.create({ipc});
  const messages = [];
  created.endpoint.addEventListener('message', event => messages.push(event.data));
  created.endpoint.postMessage({type: 'get_property_async', data: 'unsupported-property'});
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(messages.some(message => message.type === 'property_change' && message.data.name === 'unsupported-property' && message.data.value === null));
  assert.equal(messages.some(message => message.type === 'bridge_error'), false);
  await created.endpoint.destroy();
});

test('optional diagnostic cache is unavailable before generation without transport mutation', async function () {
  const ipc = new FakeIpc();
  const created = await clientModule.create({ipc});
  const messages = [];
  created.endpoint.addEventListener('message', event => messages.push(event.data));

  assert.deepEqual(await created.endpoint.getOptionalDiagnosticCacheBytes(), {
    status: 'unavailable',
    reason: 'generation-unavailable'
  });
  assert.equal(operationCalls(ipc, 'set-properties').length, 0);
  assert.equal(operationCalls(ipc, 'command').length, 0);
  assert.equal(operationCalls(ipc, 'get-property').length, 0);
  assert.equal(messages.some(message => message.type === 'bridge_error'), false);
  await created.endpoint.destroy();
});

test('optional diagnostic cache uses one generation for exact set, expand and read operations', async function () {
  const ipc = new FakeIpc((channel, request) => {
    if (request.operation === 'get-property' && request.payload.name === CACHE_PROPERTY) {
      return {status: 'ok', value: '3221225472'};
    }
    return undefined;
  });
  const created = await clientModule.create({ipc});
  const generation = await created.endpoint.beginGeneration('diagnostic-play');
  const result = await created.endpoint.getOptionalDiagnosticCacheBytes();

  assert.deepEqual(result, {status: 'ok', value: '3221225472'});
  const setCall = operationCalls(ipc, 'set-properties').at(-1).request;
  const commandCall = operationCalls(ipc, 'command').at(-1).request;
  const getCall = operationCalls(ipc, 'get-property').at(-1).request;
  assert.deepEqual(setCall.payload, {
    entries: [{name: CACHE_PROPERTY, value: ''}],
    generationId: generation.generationId
  });
  assert.deepEqual(commandCall.payload, {
    data: ['expand-properties', 'set', CACHE_PROPERTY, '${=demuxer-max-bytes}'],
    generationId: generation.generationId
  });
  assert.deepEqual(getCall.payload, {name: CACHE_PROPERTY, generationId: generation.generationId});
  await created.endpoint.destroy();
});

test('generation-required and stale-generation optional failures are unavailable without bridge_error', async function () {
  for (const reason of ['generation-required', 'stale-generation']) {
    const ipc = new FakeIpc((channel, request) => {
      if (request.operation === 'set-properties' || request.operation === 'command') {
        return {status: 'error', reason};
      }
      return undefined;
    });
    const created = await clientModule.create({ipc});
    await created.endpoint.beginGeneration('diagnostic-play');
    const messages = [];
    created.endpoint.addEventListener('message', event => messages.push(event.data));

    assert.deepEqual(await created.endpoint.getOptionalDiagnosticCacheBytes(), {
      status: 'unavailable',
      reason: 'generation-unavailable'
    });
    assert.equal(messages.some(message => message.type === 'bridge_error'), false);
    await created.endpoint.destroy();
  }
});

test('retiring during optional diagnostic cache call makes the result unavailable and stops the chain', async function () {
  let releaseSetProperties;
  const setPropertiesPending = new Promise(resolve => { releaseSetProperties = resolve; });
  const ipc = new FakeIpc((channel, request) => {
    if (request.operation === 'set-properties') return setPropertiesPending;
    return undefined;
  });
  const created = await clientModule.create({ipc});
  await created.endpoint.beginGeneration('diagnostic-play');
  const messages = [];
  created.endpoint.addEventListener('message', event => messages.push(event.data));
  const pending = created.endpoint.getOptionalDiagnosticCacheBytes();
  await new Promise(resolve => setImmediate(resolve));
  created.endpoint.retireGeneration('superseded');
  releaseSetProperties({status: 'ok'});

  assert.deepEqual(await pending, {status: 'unavailable', reason: 'generation-unavailable'});
  assert.equal(operationCalls(ipc, 'command').length, 0);
  assert.equal(operationCalls(ipc, 'get-property').length, 0);
  assert.equal(messages.some(message => message.type === 'bridge_error'), false);
  await created.endpoint.destroy();
});

test('non-generation transport failure rejects optional diagnostic cache without bridge_error', async function () {
  const ipc = new FakeIpc((channel, request) => {
    if (request.operation === 'set-properties') return {status: 'error', reason: 'transport-unavailable'};
    return undefined;
  });
  const created = await clientModule.create({ipc});
  await created.endpoint.beginGeneration('diagnostic-play');
  const messages = [];
  created.endpoint.addEventListener('message', event => messages.push(event.data));

  await assert.rejects(created.endpoint.getOptionalDiagnosticCacheBytes(), /transport-unavailable/);
  assert.equal(messages.some(message => message.type === 'bridge_error'), false);
  await created.endpoint.destroy();
});
