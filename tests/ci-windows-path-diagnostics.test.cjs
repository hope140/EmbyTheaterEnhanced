'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const diagnostic = require('../tools/ci-windows-path-diagnostics.cjs');

test('path diagnostic records raw and physical temporary paths without profile names', () => {
    const report = diagnostic.collect();
    assert.equal(report.credentialsCollected, false);
    assert.equal(report.physicalMkdtemp.resolvedEqualsNative, true);
    assert.equal(report.physicalChild.resolvedEqualsNative, true);
    assert.equal(report.rawMkdtemp.lstat.directory, true);
    assert.equal(report.rawMkdtemp.lstat.symbolicLink, false);
    assert.ok(report.ancestors.length > 0);
    assert.equal(diagnostic.displayPath('C:\\Users\\runneradmin\\Temp'), 'C:\\Users\\<USER>\\Temp');
    assert.equal(diagnostic.displayPath('C:\\Users\\RUNNER~1\\Temp'), 'C:\\Users\\<USER>\\Temp');
    assert.equal(diagnostic.displayPath('/home/tester/tmp'), '/home/<USER>/tmp');
});

test('diagnostic distinguishes a real junction from a physical directory', () => {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-ci-junction-')));
    try {
        const physical = path.join(root, 'physical');
        const alias = path.join(root, 'alias');
        fs.mkdirSync(physical);
        fs.symlinkSync(physical, alias, process.platform === 'win32' ? 'junction' : 'dir');
        assert.equal(diagnostic.inspectPath(alias).lstat.symbolicLink, true);
        assert.equal(diagnostic.inspectPath(alias).resolvedEqualsNative, false);
        assert.equal(diagnostic.inspectPath(physical).lstat.symbolicLink, false);
        assert.equal(diagnostic.inspectPath(physical).resolvedEqualsNative, true);
    } finally {
        fs.rmSync(root, {recursive: true, force: true});
    }
});
