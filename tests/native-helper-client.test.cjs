'use strict';

const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const test = require('node:test');
const clientModule = require('../src/electronapp/native-helper/client');

class FakeIpc extends EventEmitter {
  constructor() { super(); this.calls = []; this.notifications = []; }
  invoke(channel, request) {
    this.calls.push({channel, request});
    if (request.operation === 'create') return Promise.resolve({status: 'ok', mode: 'native-helper', endpointId: 'endpoint-1', protocolVersion: 1, helperVersion: '1', libmpvVersion: 'mpv'});
    if (request.operation === 'get-property') return Promise.resolve({status: 'ok', value: {structured: true}});
    return Promise.resolve({status: request.operation === 'command' ? 'accepted' : 'ok'});
  }
  send(channel, request) { this.notifications.push({channel, request}); }
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
