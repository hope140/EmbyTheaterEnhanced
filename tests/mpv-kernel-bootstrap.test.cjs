'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {prepare} = require('../src/electronapp/enhanced/mpv-kernel-bootstrap');

const verified = {helperVersion: '1.0.0', helperFileSha256: 'a'.repeat(64)};

test('missing, bad-provenance, and read failures keep baseline startup available', async () => {
  for (const readBundledVersions of [
    async () => null,
    async () => { throw new Error('private read failure'); },
    async () => ({helperVersion: '1.0.0', helperFileSha256: 'bad'})
  ]) {
    let createCalls = 0;
    const state = await prepare({readBundledVersions, createStore() { createCalls++; }});
    assert.equal(state.store, null);
    assert.equal(state.startupSelection.kind, 'baseline');
    assert.equal(state.startupSelection.reasonCode, 'package-identity-unavailable');
    assert.equal(state.identityState, 'unavailable');
    assert.equal(createCalls, 0);
  }
});

test('valid helper identity freezes the pending selection using verified package bytes', async () => {
  let received;
  const store = {freezeStartupSelection: async () => ({kind: 'candidate', candidateId: 'b'.repeat(64),
    libmpvPath: 'C:\\fixture\\candidate.dll', expectedLibmpvVersion: 'mpv v0.42.0-candidate'})};
  const state = await prepare({readBundledVersions: async () => verified, profileRoot: 'C:\\profile-fixture',
    createStore(options) { received = options; return store; }});
  assert.deepEqual(received, {profileRoot: 'C:\\profile-fixture', expectedHelperIdentity: {sha256: verified.helperFileSha256, version: verified.helperVersion}});
  assert.equal(state.store, store);
  assert.equal(state.startupSelection.kind, 'candidate');
  assert.equal(state.identityState, 'verified');
});

test('store creation or profile read failures disable candidate activation without throwing', async () => {
  const creationFailure = await prepare({readBundledVersions: async () => verified,
    createStore() { throw new Error('invalid profile'); }});
  assert.equal(creationFailure.store, null);
  assert.deepEqual(creationFailure.startupSelection, {kind: 'baseline', selectionState: 'invalid', reasonCode: 'store-unavailable'});

  const profileFailure = await prepare({readBundledVersions: async () => verified,
    createStore() { return {freezeStartupSelection: async () => { throw new Error('private profile I/O'); }}; }});
  assert.ok(profileFailure.store);
  assert.deepEqual(profileFailure.startupSelection, {kind: 'baseline', selectionState: 'invalid', reasonCode: 'selection-unavailable'});
});

test('shutdown during bundled identity read prevents late store creation', async () => {
  let finishRead;
  let shuttingDown = false;
  let created = 0;
  const pending = prepare({
    readBundledVersions: () => new Promise(resolve => { finishRead = resolve; }),
    shouldCancel: () => shuttingDown,
    createStore() { created++; return {freezeStartupSelection: async () => ({kind: 'candidate'})}; }
  });
  shuttingDown = true;
  finishRead(verified);
  const result = await pending;
  assert.equal(created, 0);
  assert.equal(result.store, null);
  assert.equal(result.startupSelection.reasonCode, 'startup-cancelled');
});

test('shutdown after store construction closes it before startup selection freeze', async () => {
  let closed = 0;
  let frozen = 0;
  let shuttingDown = false;
  const result = await prepare({
    readBundledVersions: async () => verified,
    shouldCancel: () => shuttingDown,
    createStore: () => ({
      freezeStartupSelection: async () => { frozen++; return {kind: 'candidate'}; },
      close: async () => { closed++; }
    }),
    onStoreCreated: () => { shuttingDown = true; }
  });
  assert.equal(closed, 1);
  assert.equal(frozen, 0);
  assert.equal(result.store, null);
  assert.equal(result.startupSelection.reasonCode, 'startup-cancelled');
});
