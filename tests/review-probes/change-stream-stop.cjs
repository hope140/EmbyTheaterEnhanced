'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
function fixtureExports(file, names) {
  const full = path.join(root, 'tests', file);
  const input = fs.readFileSync(full, 'utf8');
  const cutoff = input.indexOf('\ntest(');
  assert.ok(cutoff > 0);
  const m = new Module(full, module);
  m.filename = full;
  m.paths = Module._nodeModulePaths(path.dirname(full));
  m._compile(input.slice(0, cutoff) + '\nmodule.exports = {' + names.join(',') + '};', full);
  return m.exports;
}
const pm = fixtureExports('playbackmanager-request-session.test.cjs',
  ['makeFixture', 'makeItem', 'startQueueItem', 'waitFor', 'settle', 'reportsFor']);
const native = fixtureExports('native-helper-lifecycle.test.cjs', ['loadPlayer', 'makeNativeEndpoint']);
async function probe() {
  const fixture = pm.makeFixture();
  const endpoints = [];
  const logical = native.loadPlayer({create() {
    const endpoint = native.makeNativeEndpoint();
    endpoints.push(endpoint);
    return Promise.resolve({mode: 'native-helper', endpoint});
  }}).player;
  fixture.player.play = function (stream) {
    fixture.calls.play.push(stream);
    return logical.play(stream);
  };
  fixture.player.stop = async function (...args) {
    fixture.calls.stop.push(args);
    await logical.stop(args[0]);
    fixture.events.trigger(fixture.player, 'stopped');
  };
  fixture.player.canSetAudioStreamIndex = () => false;
  await pm.startQueueItem(fixture, [pm.makeItem('A', {fullscreen: false})], 'session-A');
  const change = fixture.manager.setAudioStreamIndex(1, fixture.player);
  await pm.waitFor(() => fixture.calls.metadata.length === 2, 'change PlaybackInfo not pending');
  const loadCount = () => endpoints.flatMap(e => e.operations).filter(o => o.type === 'load').length;
  const beforeStop = {loads: loadCount(), managerSequence: fixture.manager._etePlayRequestSequence};
  await fixture.manager.stop();
  await pm.settle();
  const afterStop = {loads: loadCount(), currentItem: fixture.manager.currentItem(), managerSequence: fixture.manager._etePlayRequestSequence};
  fixture.resolveMetadata(1, 'session-A-change');
  await change;
  await pm.settle();
  const afterLateResponse = {loads: loadCount(), streamItem: fixture.player.streamInfo && fixture.player.streamInfo.item.Id,
    streamSession: fixture.player.streamInfo && fixture.player.streamInfo.playSessionId,
    streamRequest: fixture.calls.play.at(-1)._etePlayRequestId,
    managerSequence: fixture.manager._etePlayRequestSequence,
    reports: fixture.calls.reports.map(r => ({method: r.method, item: r.info.ItemId, session: r.info.PlaySessionId}))};
  console.log(JSON.stringify({beforeStop, afterStop, afterLateResponse, nativeOperations: endpoints.map(e => e.operations)}, null, 2));
  assert.equal(afterLateResponse.loads, afterStop.loads, 'late changeStream PlaybackInfo must not load after terminal Stop');
}
const timeout = setTimeout(() => {console.error('Probe deadline exceeded'); process.exit(2);}, 5000);
probe().catch(error => {console.error(error); process.exitCode = 1;}).finally(() => clearTimeout(timeout));
