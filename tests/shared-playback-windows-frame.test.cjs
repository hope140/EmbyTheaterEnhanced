'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const smoke = require('../tools/shared-playback-cache/windows-smoke.cjs');

const url = 'file:///owned/windows-worker.html';

function fixture(overrides = {}) {
  const frame = {
    url,
    isDestroyed: () => false,
    executeJavaScript(script) { this.scripts.push(script); return Promise.resolve({ok: true}); },
    scripts: [],
    ...overrides.frame,
  };
  const contents = {
    mainFrame: frame,
    isDestroyed: () => false,
    executeJavaScript() { throw Error('contents API must not be used'); },
    ...overrides.contents,
  };
  return {contents, frame};
}

test('executes the exact script on the trusted main frame and returns its async result', async () => {
  const {contents, frame} = fixture({frame: {executeJavaScript(script) {
    this.scripts.push(script);
    return Promise.resolve(Promise.resolve({value: 42}));
  }}});
  const script = 'Promise.resolve({value: 42})';
  assert.deepEqual(await smoke.executeStableFrame(contents, url, script), {value: 42});
  assert.deepEqual(frame.scripts, [script]);
});

test('rejects a foreign, destroyed, or detached frame before evaluation', async () => {
  for (const {contents, frame} of [
    fixture({frame: {url: 'file:///foreign.html'}}),
    fixture({contents: {isDestroyed: () => true}}),
    fixture({frame: {isDestroyed: () => true}}),
    fixture({frame: {detached: true}}),
  ]) {
    await assert.rejects(smoke.executeStableFrame(contents, url, '1'), error => error.message === 'worker-frame-untrusted');
    assert.deepEqual(frame.scripts, []);
  }
});

test('rejects frame replacement, navigation, or destruction while evaluation is pending', async () => {
  for (const change of [
    ({contents}) => { contents.mainFrame = {...contents.mainFrame}; },
    ({frame}) => { frame.url = 'file:///navigated.html'; },
    ({frame}) => { frame.isDestroyed = () => true; },
    ({frame}) => { frame.detached = true; },
    ({contents}) => { contents.isDestroyed = () => true; },
  ]) {
    let finish;
    const {contents, frame} = fixture({frame: {executeJavaScript(script) {
      this.scripts.push(script);
      return new Promise(resolve => { finish = resolve; });
    }}});
    const pending = smoke.executeStableFrame(contents, url, 'pending()');
    change({contents, frame});
    finish('late');
    await assert.rejects(pending, error => error.message === 'worker-frame-retired');
  }
});

test('preserves actual frame evaluation rejection without falling back', async () => {
  const {contents, frame} = fixture({frame: {executeJavaScript(script) {
    this.scripts.push(script);
    return Promise.reject(Error('actual-frame-evaluation-failed'));
  }}});
  await assert.rejects(smoke.executeStableFrame(contents, url, 'fail()'), /actual-frame-evaluation-failed/);
  assert.deepEqual(frame.scripts, ['fail()']);
});

test('a hung stable frame evaluation is bounded by the existing within timeout', async () => {
  const {contents, frame} = fixture({frame: {executeJavaScript(script) {
    this.scripts.push(script);
    return new Promise(() => {});
  }}});
  await assert.rejects(smoke.within(() => smoke.executeStableFrame(contents, url, 'hang()'), 5, 'hung-frame-deadline'),
    error => error.message === 'hung-frame-deadline');
  assert.deepEqual(frame.scripts, ['hang()']);
});
