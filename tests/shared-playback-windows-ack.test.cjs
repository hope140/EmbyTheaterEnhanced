'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const driver = require('../tools/shared-playback-cache/windows-smoke.cjs');

const expectedUrl = 'file:///owned/ack-worker.html';

function fixture({onExecute} = {}) {
  const reports = [], context = {window: {prefixHarness: {report: value => reports.push(value)}}};
  vm.createContext(context);
  const frame = {
    url: expectedUrl, detached: false, isDestroyed: () => false, scripts: [],
    async executeJavaScript(script) {
      this.scripts.push(script);
      if (onExecute) {
        const result = await onExecute({script, context, frame: this, index: this.scripts.length - 1});
        if (result && result.handled) return result.value;
      }
      const value = await vm.runInContext(script, context);
      // Electron's mocked structured wire maps JavaScript undefined to null.
      return value === undefined ? null : value;
    },
  };
  const contents = {mainFrame: frame, isDestroyed: () => false};
  return {contents, frame, context, reports};
}

test('void command runs once, returns an explicit ACK, and keeps renderer/wire result types distinct', async () => {
  const {contents, frame, context, reports} = fixture();
  let effects = 0;
  context.window.effect = () => {effects++;};
  const result = await driver.executeAcknowledgedVoid(contents, expectedUrl,
    'window.effect()', 'test-command', 1, 500);

  assert.deepEqual(result, {wireResultType: 'null', completionAck: 1001, rendererResultType: 'undefined'});
  assert.equal(effects, 1);
  assert.equal(frame.scripts.length, 2);
  assert.equal(frame.scripts[0].includes('window.effect()'), true);
  assert.equal(frame.scripts[1], driver.voidCommandAckExpression(1));
  assert.deepEqual(reports.map(row => row.code), ['entered', 'returned', 'settled']);
  assert.equal(context.window.__ownedSmokeVoidSequence, 1);
  assert.equal(context.window.__ownedSmokeVoidType, 'undefined');
});

test('void wrapper rejects a repeated sequence, rejected action, sync throw, and non-void result', async () => {
  assert.match(driver.voidCommandExpression('window.effect()', 1), /__ownedSmokeVoidSequence \|\| 0/);
  for (const [script, message] of [
    ['window.effect()', 'worker-void-sequence'],
    ['Promise.reject(Error("action-rejected"))', 'action-rejected'],
    ['(() => { throw Error("action-threw"); })()', 'action-threw'],
    ['42', 'worker-command-not-void'],
  ]) {
    const {contents, context, reports} = fixture();
    context.window.__ownedSmokeVoidSequence = 1;
    if (message === 'worker-void-sequence') context.window.__ownedSmokeVoidSequence = 1;
    else delete context.window.__ownedSmokeVoidSequence;
    await assert.rejects(driver.executeAcknowledgedVoid(contents, expectedUrl, script, 'test-action', 1, 500),
      error => error.message.includes(message));
    assert.equal(context.window.__ownedSmokeVoidSequence || 0, message === 'worker-void-sequence' ? 1 : 0);
    assert.equal(reports.some(row => row.code === 'rejected'),
      ['action-rejected', 'worker-command-not-void'].includes(message));
  }
});

test('ACK query accepts only matching sequence and undefined result type', () => {
  const {context} = fixture();
  const expression = driver.voidCommandAckExpression(2);
  assert.equal(vm.runInContext(expression, context), -1);
  context.window.__ownedSmokeVoidSequence = 1;
  context.window.__ownedSmokeVoidType = 'undefined';
  assert.equal(vm.runInContext(expression, context), -1, 'prior command ACK is stale');
  context.window.__ownedSmokeVoidSequence = 2;
  context.window.__ownedSmokeVoidType = 'object';
  assert.equal(vm.runInContext(expression, context), -1, 'wrong result type cannot ACK');
  context.window.__ownedSmokeVoidType = 'undefined';
  assert.equal(vm.runInContext(expression, context), 1002);
});

test('API rejects a stale or missing ACK after the command effect runs', async () => {
  for (const stale of [true, false]) {
    let effects = 0;
    const {contents, context, frame} = fixture({onExecute: ({script, index}) => {
      if (index === 1) return {handled: true, value: stale ? 1001 : -1};
    }});
    context.window.__ownedSmokeVoidSequence = 1;
    context.window.__ownedSmokeVoidType = 'undefined';
    context.window.effect = () => {effects++;};
    await assert.rejects(driver.executeAcknowledgedVoid(contents, expectedUrl, 'window.effect()', 'ack-check', 2, 500),
      error => error.message === 'worker-command-ack-missing');
    assert.equal(effects, 1);
    assert.equal(frame.scripts.length, 2);
  }
});

test('frame replacement between command and ACK fails without dispatching on the replacement', async () => {
  let replacementCalls = 0;
  const {contents, frame, context} = fixture({onExecute: ({index}) => {
    if (index === 0) {
      contents.mainFrame = {url: expectedUrl, isDestroyed: () => false, detached: false,
        executeJavaScript() {replacementCalls++; return Promise.resolve(1001);}};
    }
  }});
  context.window.effect = () => {};
  await assert.rejects(driver.executeAcknowledgedVoid(contents, expectedUrl, 'window.effect()', 'swap-check', 1, 500),
    error => error.message === 'worker-frame-retired');
  assert.equal(frame.scripts.length, 1);
  assert.equal(replacementCalls, 0);
});

test('inactive late command completion cannot become a successful ACK', async () => {
  let finish, active = true;
  const {contents, frame, context} = fixture({onExecute: ({index}) => index === 0 ?
    new Promise(resolve => {finish = resolve;}) : undefined});
  context.window.effect = () => {};
  const pending = driver.executeAcknowledgedVoid(contents, expectedUrl, 'window.effect()', 'cancel-check', 1, 500,
    () => active);
  await new Promise(resolve => setImmediate(resolve));
  active = false;
  finish({handled: true, value: null});
  await assert.rejects(pending, error => error.message === 'worker-evaluation-retired');
  assert.equal(frame.scripts.length, 1, 'retirement prevents the ACK query');
});

test('command and ACK share one absolute action deadline', async t => {
  const originalNow = Date.now;
  let clock = 1000;
  Date.now = () => clock;
  t.after(() => {Date.now = originalNow;});
  const {contents, context, frame} = fixture({onExecute: ({index}) => {
    clock += index === 0 ? 6 : 5;
  }});
  context.window.effect = () => {};
  await assert.rejects(driver.executeAcknowledgedVoid(contents, expectedUrl, 'window.effect()', 'budget-check', 1, 10),
    error => error.message === 'budget-check-timeout');
  assert.equal(frame.scripts.length, 2, 'the ACK query ran within the remaining five milliseconds');
});
