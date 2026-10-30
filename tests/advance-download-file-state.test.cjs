'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('node:path');
const {createInspector} = require('../src/electronapp/enhanced/advance-download/file-state');
test('slow filesystem checks are bounded/coalesced and closing prevents queued checks from starting', async () => {
    const pending = [], calls = [];
    const inspector = createInspector({budget: 1, ttl: 0, fs: {
        realpath(value) {calls.push(value); return new Promise(resolve => pending.push(() => resolve(value)));},
        async lstat(value) {const directory = path.basename(value) !== 'movie.mkv'; return {dev: 1n, ino: directory ? 1n : 2n,
            size: 10n, mtimeNs: 5n, isDirectory: () => directory, isFile: () => !directory, isSymbolicLink: () => false};}
    }});
    const tasks = Array.from({length: 12}, (_, i) => ({id: String(i), state: 'complete', directory: path.resolve('synthetic-disk-' + i),
        file: {name: 'movie.mkv', rootId: {dev: '1', ino: '1'}, fileId: {dev: '1', ino: '2'}, size: 10, mtimeNs: '5'}}));
    const states = await inspector.snapshot(tasks); assert.equal(calls.length, 4); assert.ok([...states.values()].every(value => value === 'checking'));
    await inspector.snapshot(tasks); assert.equal(calls.length, 4, 'another poll does not duplicate pending filesystem requests');
    inspector.close(); pending.forEach(resolve => resolve()); await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 4, 'retired inspector cannot start its queued filesystem probes');
});
