'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const {EventEmitter} = require('node:events');

const repo = path.resolve(__dirname, '..');
const sourceFile = path.join(__dirname, 'preload-authorized-transport.test.cjs');
const {temporaryRoot: realTemporaryRoot, guardPort} = require('./helpers/range-fixture-root.cjs');
const {createAuthority, isTransport} = require('../src/electronapp/enhanced/preload-source-authority');
const {createCache} = require('../src/electronapp/enhanced/playback-range-cache');
const {createReader} = require('../src/electronapp/enhanced/playback-range-http');

function fixtureFunction(source) {
  const start = source.indexOf('async function fixture(');
  const end = source.indexOf('async function range(', start);
  assert.ok(start >= 0 && end > start, 'fixture source function boundaries must exist');
  return source.slice(start, end);
}

function ownedFixture(source, {failListenAt = 0, cacheCloseFailure = false} = {}) {
  const state = {roots: [], servers: [], caches: [], hooks: [],
    guardReady: false, listenAttempts: [], syntheticErrors: 0, realCacheCloseCalls: 0,
    cacheCreateCalls: 0, cacheFailureCode: null, serverListeningAtCacheAttempt: null};
  const temporaryRoot = (...args) => {
    const root = realTemporaryRoot(...args);
    state.roots.push(root);
    return root;
  };
  const wrappedHttp = {...http, createServer(...args) {
    const server = http.createServer(...args);
    state.servers.push(server);
    const listen = server.listen.bind(server);
    server.listen = function(port, ...rest) {
      const attempt = state.listenAttempts.length + 1;
      const requestedPort = typeof port === 'number' ? port : port?.port;
      if (requestedPort === 0 && !state.guardReady) {
        const selectedPort = attempt === 1 ? guardPort(state.roots.at(-1)) : 0;
        state.listenAttempts.push({attempt, requestedPort, selectedPort, cacheGuardReady: false});
        if (attempt === failListenAt) {
          state.syntheticErrors++;
          const error = Object.assign(Error('synthetic address collision'), {code: 'EADDRINUSE', syscall: 'listen'});
          queueMicrotask(() => server.emit('error', error));
          return server;
        }
        return listen(selectedPort, ...rest);
      }
      state.listenAttempts.push({attempt, requestedPort, selectedPort: requestedPort, cacheGuardReady: state.guardReady});
      if (requestedPort === 0 && attempt === failListenAt) {
        state.syntheticErrors++;
        const error = Object.assign(Error('synthetic address collision'), {code: 'EADDRINUSE', syscall: 'listen'});
        queueMicrotask(() => server.emit('error', error));
        return server;
      }
      return listen(port, ...rest);
    };
    return server;
  }};
  const trackedCreateCache = async options => {
    state.cacheCreateCalls++;
    state.serverListeningAtCacheAttempt = state.servers.map(server => server.listening);
    let cache;
    try {cache = await createCache(options);}
    catch (error) {state.cacheFailureCode = error.code || null; throw error;}
    state.caches.push(cache);
    state.guardReady = true;
    const close = cache.close.bind(cache);
    cache.close = async () => {
      state.realCacheCloseCalls++;
      await close();
      if (cacheCloseFailure) throw Error('synthetic cache close failure');
    };
    return cache;
  };
  const context = vm.createContext({
    http: wrappedHttp, fs: fsp, EventEmitter, temporaryRoot, createAuthority, isTransport,
    createCache: trackedCreateCache, createReader, deferred() {
      let resolve; const promise = new Promise(done => {resolve = done;}); return {promise, resolve};
    }, Buffer, AbortController, assert,
  });
  state.fixture = vm.runInContext('(' + fixtureFunction(source) + ')', context);
  state.testContext = {after(hook) {state.hooks.push(hook);}};
  state.cleanupHooks = async () => {
    const errors = [];
    for (const hook of state.hooks) try {await hook();} catch (error) {errors.push(error);}
    return errors;
  };
  state.closeOwnedResources = async () => {
    for (const cache of state.caches) {
      try {await cache.close();} catch (_) {}
    }
    await Promise.all(state.servers.map(server => new Promise(resolve => {
      try {
        server.close(error => {if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') state.serverCleanupError = error; resolve();});
        server.closeAllConnections?.();
      } catch (error) {if (error.code !== 'ERR_SERVER_NOT_RUNNING') state.serverCleanupError = error; resolve();}
    })));
    for (const server of state.servers) server.closeAllConnections?.();
    for (const root of state.roots) await fsp.rm(root, {recursive: true, force: true});
  };
  return state;
}

async function assertGuardReleased(root) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({host: '127.0.0.1', port: guardPort(root), exclusive: true}, resolve);
  });
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function assertFixtureClean(state) {
  assert.ok(state.servers.every(server => !server.listening), 'every fixture-owned HTTP listener must be closed');
  for (const root of state.roots) {
    assert.equal(fs.existsSync(root), false, 'fixture-owned temporary root must be removed');
    await assertGuardReleased(root);
  }
}

test('current fixture acquires the real cache guard before either loopback listener', async () => {
  const source = fs.readFileSync(sourceFile, 'utf8');
  const state = ownedFixture(source);
  try {
    const f = await state.fixture(state.testContext);
    assert.equal(state.hooks.length, 1, 'cleanup hook is registered before asynchronous setup');
    assert.equal(state.guardReady, true);
    assert.equal(state.cacheCreateCalls, 1);
    assert.deepEqual(state.serverListeningAtCacheAttempt, []);
    assert.equal(state.listenAttempts.length, 2);
    assert.ok(state.listenAttempts.every(row => row.requestedPort === 0 && row.cacheGuardReady));
    assert.ok(state.servers.every(server => server.address().port !== guardPort(f.root)));
    const errors = await state.cleanupHooks();
    assert.deepEqual(errors, []);
    await assertFixtureClean(state);
  } finally {
    await state.closeOwnedResources();
  }
});

test('known previous fixture reaches the real guard collision after both sibling HTTP servers bind', async () => {
  const oldSource = execFileSync('git', ['show', 'f41267223419f285379c278211cdd94f487711b1:tests/preload-authorized-transport.test.cjs'],
    {cwd: repo, encoding: 'utf8', timeout: 10000});
  const state = ownedFixture(oldSource);
  let root;
  try {
    await assert.rejects(state.fixture(state.testContext), error => error.code === 'EADDRINUSE');
    root = state.roots[0];
    assert.equal(state.guardReady, false, 'old fixture must fail before acquiring the real cache guard');
    assert.equal(state.hooks.length, 0, 'old cleanup hook is registered after both listeners');
    assert.equal(state.listenAttempts.length, 2, 'no bind retry or alternate port is allowed');
    assert.deepEqual(state.listenAttempts.map(row => row.selectedPort), [guardPort(root), 0]);
    assert.equal(state.cacheCreateCalls, 1, 'the historical code reaches the actual cache creation');
    assert.equal(state.cacheFailureCode, 'EADDRINUSE', 'the actual product guard bind reports the collision');
    assert.deepEqual(state.serverListeningAtCacheAttempt, [true, true], 'both HTTP servers are live when the guard is acquired');
    assert.ok(state.servers.every(server => server.listening));
    assert.equal(fs.existsSync(root), true, 'the historical setup leaked its owned root before external cleanup');
  } finally {
    const errors = await state.cleanupHooks();
    assert.deepEqual(errors, []);
    await state.closeOwnedResources();
  }
  await assertFixtureClean(state);
});

for (const failedListen of [1, 2]) test('current fixture cleans up after synthetic EADDRINUSE on listener ' + failedListen, async () => {
  const source = fs.readFileSync(sourceFile, 'utf8');
  const state = ownedFixture(source, {failListenAt: failedListen});
  try {
    await assert.rejects(state.fixture(state.testContext), error => error.code === 'EADDRINUSE');
    assert.equal(state.hooks.length, 1, 'cleanup hook must be registered before listeners start');
    assert.equal(state.guardReady, true, 'the actual cache guard is acquired before listener setup');
    assert.equal(state.syntheticErrors, 1);
    assert.equal(state.listenAttempts.length, failedListen, 'listen denial must not trigger a retry');
    const errors = await state.cleanupHooks();
    assert.deepEqual(errors, []);
    await assertFixtureClean(state);
  } finally {
    await state.closeOwnedResources();
  }
});

test('cache close failure is reported after listener cleanup still runs', async () => {
  const source = fs.readFileSync(sourceFile, 'utf8');
  const state = ownedFixture(source, {failListenAt: 2, cacheCloseFailure: true});
  try {
    await assert.rejects(state.fixture(state.testContext), error => error.code === 'EADDRINUSE');
    const errors = await state.cleanupHooks();
    assert.equal(errors.length, 1);
    assert.equal(errors[0].name, 'AggregateError');
    assert.equal(errors[0].message, 'authorized-transport-fixture-cleanup-failed');
    assert.equal(state.realCacheCloseCalls, 1, 'the real cache close completes before the injected error');
    assert.ok(state.servers.every(server => !server.listening));
    await assertFixtureClean(state);
  } finally {
    await state.closeOwnedResources();
  }
});
