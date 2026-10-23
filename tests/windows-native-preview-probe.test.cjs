'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process'), path = require('node:path');
const {PLAN, validateRuntime} = require('../tools/windows-native-preview-probe.cjs');
test('probe describes synthetic-only boundaries without loading Electron or native dependencies', () => {
    const output = execFileSync(process.execPath, [path.resolve(__dirname, '../tools/windows-native-preview-probe.cjs'), '--describe'], {encoding:'utf8'});
    assert.deepEqual(JSON.parse(output), PLAN); assert.equal(PLAN.syntheticOnly, true);
    assert.equal(PLAN.maximumSamples, 30); assert.equal(PLAN.durationMs, 30000);
});
test('probe requires pinned Windows x64 Electron rather than silently installing dependencies', () => {
    for (const [platform, arch, electron] of [['linux','x64','44.4.2'], ['win32','arm64','44.4.2'], ['win32','x64','44.4.1']]) {
        assert.throws(() => validateRuntime(platform, arch, {electron}), /Pinned Windows Electron/);
    }
    assert.doesNotThrow(() => validateRuntime('win32','x64',{electron:'44.4.2'}));
});
