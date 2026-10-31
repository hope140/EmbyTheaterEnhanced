'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {matrixPlan, matrixArmOrder, pendingLimitForReservation, playbackMetrics, parseCli} =
  require('../tools/shared-playback-cache/memory.cjs');

test('matrix enumerates bounded reservations and derives pending-write budgets', () => {
  const MiB = 1024 * 1024;
  assert.deepEqual(matrixPlan(), [1, 4, 8, 16, 32].map(n => ({
    mediaBufferBytes: n * MiB,
    pendingWriteBytes: Math.min(n * MiB / 2, 2 * MiB),
    replicates: 3,
  })));
  assert.throws(() => pendingLimitForReservation(0), TypeError);
});

test('matrix arm order alternates without changing either arm', () => {
  assert.deepEqual(matrixArmOrder(0), ['forward-only', 'cache-enabled']);
  assert.deepEqual(matrixArmOrder(1), ['cache-enabled', 'forward-only']);
  assert.deepEqual(matrixArmOrder(2), matrixArmOrder(0));
  assert.throws(() => matrixArmOrder(-1), TypeError);
});

test('playback throughput uses actual returned bytes and GET duration', () => {
  assert.deepEqual(playbackMetrics(2_000_000, 1000), {
    bytes: 2_000_000, actualBytes: 2_000_000, durationMs: 1000, megabytesPerSecond: 2,
  });
  assert.equal(playbackMetrics(0, 0).megabytesPerSecond, null);
  assert.throws(() => playbackMetrics(-1, 10), TypeError);
});

test('matrix mode requires an explicit network profile while default run keeps its old CLI', () => {
  assert.deepEqual(parseCli(['--run', '--out', '/tmp/memory-one']), {
    command: '--run', outputRoot: '/tmp/memory-one', network: null,
  });
  assert.deepEqual(parseCli(['--matrix', '--network', 'paced', '--out', '/tmp/memory-matrix']), {
    command: '--matrix', outputRoot: '/tmp/memory-matrix', network: 'paced',
  });
  assert.equal(parseCli(['--matrix', '--out', '/tmp/memory-matrix']), null);
  assert.equal(parseCli(['--run', '--out', '/tmp/memory-one', '--network', 'paced']), null);
});
