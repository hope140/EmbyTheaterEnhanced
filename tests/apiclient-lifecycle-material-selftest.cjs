'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const defaultSourcePath = path.join(root, 'vendor/web-snapshot/user-patches/apiclient.js');
const sourcePath = process.env.ETE_APICLIENT_SOURCE || defaultSourcePath;
const source = fs.readFileSync(sourcePath, 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'vendor/web-snapshot-manifest.json'), 'utf8'));
const pinned = manifest.userPatches.find(entry => entry.path === 'user-patches/apiclient.js');
assert.ok(pinned, 'manifest-pinned ApiClient material entry is required');
const sourceSha256 = crypto.createHash('sha256').update(source).digest('hex').toUpperCase();
assert.equal(sourceSha256, pinned.sha256.toUpperCase(), 'ApiClient source must match the runtime manifest SHA-256');

let testedSource = source;
if (process.env.ETE_APICLIENT_UNPATCHED !== '1') {
  const {patchApiClient} = require('../tools/patch-apiclient-lifecycle.cjs');
  assert.equal(typeof patchApiClient, 'function', 'patcher must export patchApiClient(source)');
  testedSource = patchApiClient(source);
  assert.equal(typeof testedSource, 'string', 'patchApiClient must return the complete AMD source');
}

const OPEN = 1;
const CONNECTING = 0;
const CLOSING = 2;
const CLOSED = 3;

function createHarness() {
  const timers = [];
  const sockets = [];
  const events = [];
  let nextTimerId = 1;
  let failNextSocketConstruction = false;

  class FakeWebSocket {
    constructor(url) {
      if (failNextSocketConstruction) {
        failNextSocketConstruction = false;
        throw new Error('synthetic WebSocket construction failure');
      }
      this.url = url;
      this.readyState = CONNECTING;
      this.closeCalls = 0;
      this.sent = [];
      sockets.push(this);
    }
    close() {
      this.closeCalls++;
      if (this.readyState !== CLOSED) this.readyState = CLOSING;
    }
    send(message) {
      this.sent.push(message);
    }
  }
  FakeWebSocket.OPEN = OPEN;
  FakeWebSocket.CONNECTING = CONNECTING;
  FakeWebSocket.CLOSING = CLOSING;
  FakeWebSocket.CLOSED = CLOSED;

  const exported = {};
  const eventApi = {default: {trigger(target, name, args) { events.push({target, name, args}); }}};
  const sandbox = {
    console: {log() {}, warn() {}, error() {}},
    WebSocket: FakeWebSocket,
    setTimeout(callback, delay) {
      const timer = {id: nextTimerId++, callback, delay, cleared: false, fired: false};
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (timer) timer.cleared = true;
    },
    define(dependencies, factory) {
      assert.equal(Array.from(dependencies).join(','), 'exports,./events.js');
      factory(exported, eventApi);
    },
    babelHelpers: {
      classCallCheck(instance, constructor) {
        if (!(instance instanceof constructor)) throw new TypeError('Class constructor called without new');
      },
      createClass(constructor, properties) {
        for (const descriptor of properties) Object.defineProperty(constructor.prototype, descriptor.key, {
          ...descriptor,
          enumerable: false,
          configurable: true,
          writable: true
        });
        return constructor;
      },
      getPrototypeOf: Object.getPrototypeOf
    }
  };
  vm.runInNewContext(testedSource, sandbox, {filename: 'manifest-pinned-apiclient.js'});
  const ApiClient = exported.default;
  assert.equal(typeof ApiClient, 'function', 'complete AMD material must export ApiClient');

  const client = Object.create(ApiClient.prototype);
  client._serverInfo = {AccessToken: 'synthetic-token', UserId: 'synthetic-user'};
  client._serverAddress = 'http://server.test';
  client._deviceId = 'synthetic-device';
  client._deviceName = 'Synthetic Device';
  client._wakeOnLan = {isSupported: () => false};
  client.connected = true;
  client.messageListeners = [];
  client.ajax = request => {
    if (!request || request.type !== 'POST' || request.url !== 'http://server.test/emby/Sessions/Logout') {
      throw new Error('Unexpected fake REST request');
    }
    return new Promise((resolve, reject) => {
      client.pendingLogouts.push({resolve, reject, request});
    });
  };
  client.pendingLogouts = [];

  return {
    client, sockets, timers, events, FakeWebSocket, fireTimer, fireDelay, rawClose, activeTimers,
    failNextSocketConstruction() { failNextSocketConstruction = true; }
  };

  function fireTimer(timer, includeCleared = true) {
    assert.ok(timer, 'timer must exist before it can be fired');
    if (timer.fired || (!includeCleared && timer.cleared)) return;
    timer.fired = true;
    timer.callback();
  }
  function fireDelay(delay, index = 0, includeCleared = true) {
    const matches = timers.filter(timer => timer.delay === delay && !timer.fired);
    assert.ok(matches[index], `expected timer with ${delay}ms delay at index ${index}`);
    fireTimer(matches[index], includeCleared);
    return matches[index];
  }
  function rawClose(socket, code = 1006, callback = socket.onclose) {
    assert.equal(typeof callback, 'function', 'socket close callback must be captured before the raw close');
    socket.readyState = CLOSED;
    callback({code});
  }
  function activeTimers(delay) {
    return timers.filter(timer => !timer.cleared && !timer.fired && (delay === undefined || timer.delay === delay));
  }
}

function openCurrent(harness) {
  const {client, sockets} = harness;
  client.openWebSocket();
  const socket = sockets.at(-1);
  socket.readyState = OPEN;
  socket.onopen();
  return socket;
}

function countEvents(harness, name) {
  return harness.events.filter(event => event.name === name).length;
}

test('all source bytes outside the four approved lifecycle methods remain unchanged', () => {
  function withoutApprovedMethods(text) {
    let remaining = text.replace(/\r\n/g, '\n');
    for (const name of ['logout', 'ensureWebSocket', 'openWebSocket', 'closeWebSocket']) {
      const marker = '            key: "' + name + '",\n';
      assert.equal(remaining.split(marker).length, 2);
      const begin = remaining.indexOf(marker) + marker.length;
      const end = remaining.indexOf('\n            },\n          },', begin);
      assert.ok(end > begin);
      remaining = remaining.slice(0, begin) + '[approved lifecycle method]' + remaining.slice(end + '\n            },'.length);
    }
    return remaining;
  }
  assert.equal(withoutApprovedMethods(testedSource), withoutApprovedMethods(source),
    'authentication, HTTP, message/report methods and all other module bytes stay frozen');
  assert.equal((testedSource.match(/\r\n/g) || []).length, (testedSource.match(/\n/g) || []).length,
    'the authoritative payload CRLF convention is retained');
});

test('ensure is idempotent for OPEN and CONNECTING sockets', () => {
  const h = createHarness();
  h.client.ensureWebSocket();
  assert.equal(h.sockets.length, 1);
  h.client.ensureWebSocket();
  assert.equal(h.sockets.length, 1, 'CONNECTING socket is reused');
  h.sockets[0].readyState = OPEN;
  h.client.ensureWebSocket();
  assert.equal(h.sockets.length, 1, 'OPEN socket is reused');
});

test('intentional close is idempotent for OPEN, CONNECTING, CLOSING, and CLOSED', () => {
  for (const state of [OPEN, CONNECTING, CLOSING, CLOSED]) {
    const h = createHarness();
    h.client.openWebSocket();
    const socket = h.sockets[0];
    const closeCallback = socket.onclose;
    socket.readyState = state;
    h.client.closeWebSocket();
    h.client.closeWebSocket();
    assert.equal(socket.closeCalls, state === OPEN || state === CONNECTING ? 1 : 0, `close() calls for state ${state}`);
    assert.equal(h.client.isWebSocketOpenOrConnecting(), false, `intentional close retires active socket for state ${state}`);
    h.rawClose(socket, 1000, closeCallback);
    h.timers.filter(timer => timer.delay === 0).forEach(timer => h.fireTimer(timer));
    h.activeTimers().forEach(timer => assert.fail(`intentional close retained ${timer.delay}ms timer`));
    assert.equal(countEvents(h, 'websocketclose'), 1, `one close notification for state ${state}`);
  }
});

test('unexpected close keeps exponential retry delays, cap, and open reset', () => {
  const h = createHarness();
  let socket = openCurrent(h);
  const expected = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
  for (const delay of expected) {
    const priorSocketCount = h.sockets.length;
    h.rawClose(socket);
    assert.equal(h.activeTimers().filter(timer => timer.delay === 0).length, 1, 'one deferred close notification is owned');
    assert.equal(h.activeTimers().filter(timer => timer.delay === delay).length, 1, `one ${delay}ms retry is owned`);
    h.fireDelay(0);
    h.fireDelay(delay);
    assert.equal(h.sockets.length, priorSocketCount + 1, 'retry timer must create one replacement');
    socket = h.sockets.at(-1);
  }
  socket.readyState = OPEN;
  socket.onopen();
  h.rawClose(socket);
  assert.equal(h.activeTimers().filter(timer => timer.delay === 1000).length, 1, 'post-open retry starts again at 1000ms');
});

test('logout pending on successful REST cannot recreate; original done contract is preserved', async () => {
  const h = createHarness();
  const socket = openCurrent(h);
  const oldClose = socket.onclose;
  const initialCount = h.sockets.length;
  const logout = h.client.logout();
  h.rawClose(socket, 1000, oldClose);
  for (const timer of [...h.timers]) h.fireTimer(timer);
  assert.equal(h.sockets.length, initialCount, 'logout pending forbids replacement sockets');
  h.client.pendingLogouts[0].resolve({ok: true});
  const result = await logout;
  assert.equal(result, undefined, 'logout keeps original resolve value');
  assert.equal(h.client.accessToken(), null, 'original done clears auth');
  assert.equal(h.client.getCurrentUserId(), null, 'original done clears user id');
  assert.equal(h.client.connected, true, 'connected retains its original meaning');
  for (const timer of [...h.timers]) h.fireTimer(timer);
  assert.equal(h.sockets.length, initialCount, 'retired callbacks cannot revive after logout resolves');
});

test('logout pending on failed REST also clears auth and cannot recreate', async () => {
  const h = createHarness();
  const socket = openCurrent(h);
  const oldClose = socket.onclose;
  const logout = h.client.logout();
  h.rawClose(socket, 1000, oldClose);
  for (const timer of [...h.timers]) h.fireTimer(timer);
  assert.equal(h.sockets.length, 1, 'failed logout must not recreate while REST is pending');
  h.client.pendingLogouts[0].reject(new Error('synthetic REST failure'));
  const result = await logout;
  assert.equal(result, undefined, 'logout keeps the existing rejection-handler resolve behavior');
  assert.equal(h.client.accessToken(), null);
  assert.equal(h.client.getCurrentUserId(), null);
  assert.equal(h.client.connected, true);
  for (const timer of [...h.timers]) h.fireTimer(timer);
  assert.equal(h.sockets.length, 1);
});

test('logout without an auth token keeps the original completion contract', async () => {
  const h = createHarness();
  const socket = openCurrent(h);
  const oldClose = socket.onclose;
  h.client.setAuthenticationInfo(null, null);
  const logout = h.client.logout();
  h.rawClose(socket, 1000, oldClose);
  const result = await logout;
  for (const timer of [...h.timers]) h.fireTimer(timer);
  assert.equal(result, undefined);
  assert.equal(h.client.accessToken(), null);
  assert.equal(h.client.getCurrentUserId(), null);
  assert.equal(h.client.connected, true);
  assert.equal(h.client.pendingLogouts.length, 0, 'no-token logout does not issue REST');
  assert.equal(h.sockets.length, 1, 'retired no-token socket cannot reopen');
  assert.equal(countEvents(h, 'websocketclose'), 1, 'explicit close notifies once');
});

test('synchronous logout REST failure preserves original thrown behavior and allows later reuse', () => {
  const h = createHarness();
  const oldToken = h.client.accessToken();
  const oldUserId = h.client.getCurrentUserId();
  h.client.ajax = () => { throw new Error('synthetic synchronous REST failure'); };
  assert.throws(() => h.client.logout(), /synthetic synchronous REST failure/);
  assert.equal(h.client.accessToken(), oldToken, 'synchronous throw does not run original done handler');
  assert.equal(h.client.getCurrentUserId(), oldUserId);
  assert.equal(h.client.connected, true);
  h.client.ensureWebSocket();
  assert.equal(h.sockets.length, 1, 'logout counter is released after synchronous throw');
});

test('WebSocket constructor failure leaves the ApiClient reusable', () => {
  const h = createHarness();
  h.failNextSocketConstruction();
  assert.doesNotThrow(() => h.client.ensureWebSocket(), 'ensure retains its existing constructor-error catch');
  assert.equal(h.sockets.length, 0);
  h.client.ensureWebSocket();
  assert.equal(h.sockets.length, 1, 'later ensure can create a socket after constructor failure');
});

test('duplicate logout calls cannot admit a socket between or after their REST completions', async () => {
  const h = createHarness();
  const socket = openCurrent(h);
  const oldClose = socket.onclose;
  const first = h.client.logout();
  const second = h.client.logout();
  h.rawClose(socket, 1000, oldClose);
  for (const timer of [...h.timers]) h.fireTimer(timer);
  assert.equal(h.sockets.length, 1);
  h.client.pendingLogouts[0].resolve({});
  await first;
  h.client.ensureWebSocket();
  assert.equal(h.sockets.length, 1, 'first done cannot reopen while a duplicate logout is pending');
  h.client.pendingLogouts[1].reject(new Error('synthetic REST failure'));
  await second;
  for (const timer of [...h.timers]) h.fireTimer(timer);
  assert.equal(h.sockets.length, 1);
});

test('same ApiClient instance can reconnect after duplicate logout completion and reauthentication', async () => {
  const h = createHarness();
  const socket = openCurrent(h);
  const oldClose = socket.onclose;
  const firstLogout = h.client.logout();
  const secondLogout = h.client.logout();
  h.rawClose(socket, 1000, oldClose);
  h.client.pendingLogouts[0].resolve({});
  await firstLogout;
  h.client.ensureWebSocket();
  assert.equal(h.sockets.length, 1, 'one completed logout cannot open while another is pending');
  h.client.pendingLogouts[1].reject(new Error('synthetic REST failure'));
  await secondLogout;
  h.client.setAuthenticationInfo('new-synthetic-token', 'new-synthetic-user');
  h.client.connected = true;
  h.client.ensureWebSocket();
  assert.equal(h.sockets.length, 2, 'new login can reuse the original ApiClient instance');
  assert.equal(h.client.accessToken(), 'new-synthetic-token');
  assert.equal(h.client.getCurrentUserId(), 'new-synthetic-user');
});

for (const callbackName of ['open', 'message', 'error', 'close']) {
  test(`retired socket ${callbackName} callback cannot affect the current owner`, () => {
    const h = createHarness();
    const stale = openCurrent(h);
    const staleCallback = stale[`on${callbackName}`];
    h.client.messageListeners = [{name: 'Session', options: {Fields: ['NowPlayingItem']}}];
    h.client.openWebSocket();
    const current = h.sockets.at(-1);
    current.readyState = OPEN;
    current.onopen();
    const currentSent = current.sent.slice();
    const beforeEvents = h.events.length;
    const beforeTimers = h.activeTimers().length;
    if (callbackName === 'message') {
      staleCallback({data: JSON.stringify({MessageType: 'SyntheticStale', MessageId: `stale-${callbackName}`})});
    } else if (callbackName === 'close') {
      h.rawClose(stale, 1006, staleCallback);
    } else {
      staleCallback();
    }
    assert.equal(h.events.length, beforeEvents, `retired ${callbackName} callback is silent`);
    assert.deepEqual(current.sent, currentSent, `retired ${callbackName} callback cannot replay or send`);
    assert.equal(h.activeTimers().length, beforeTimers, `retired ${callbackName} callback cannot schedule timers`);
    assert.equal(h.client.isWebSocketOpen(), true, `retired ${callbackName} callback cannot displace current connection`);
  });
}

test('retired reconnect and deferred-close callbacks cannot affect a newer owner', () => {
  const h = createHarness();
  const retired = openCurrent(h);
  h.rawClose(retired);
  const staleTimers = h.timers.slice();
  h.client.openWebSocket();
  const current = h.sockets.at(-1);
  current.readyState = OPEN;
  current.onopen();
  const count = h.sockets.length;
  const sent = current.sent.slice();
  for (const timer of staleTimers) h.fireTimer(timer);
  assert.equal(h.sockets.length, count, 'retired retry timer cannot create another socket');
  assert.equal(h.client.isWebSocketOpen(), true, 'retired timers leave current connection open');
  assert.deepEqual(current.sent, sent, 'retired deferred timer cannot affect message replay');
  assert.equal(countEvents(h, 'websocketclose'), 0, 'retired deferred notification is suppressed');
});

test('current message delivery and listener replay each happen once', () => {
  const h = createHarness();
  h.client.messageListeners.push({name: 'Session', options: {Fields: ['NowPlayingItem']}});
  h.client.openWebSocket();
  const current = h.sockets.at(-1);
  current.readyState = OPEN;
  current.onopen();
  const payload = {MessageType: 'SyntheticCurrent', MessageId: 'current-1'};
  current.onmessage({data: JSON.stringify(payload)});
  assert.equal(countEvents(h, 'websocketopen'), 1);
  assert.equal(countEvents(h, 'message'), 1);
  assert.equal(JSON.stringify(h.events.find(event => event.name === 'message').args[0]), JSON.stringify(payload),
    'current message data is delivered unchanged');
  assert.equal(current.sent.length, 1, 'one registered message listener replays once');
  assert.equal(JSON.parse(current.sent[0]).MessageType, 'SessionStart');
});
