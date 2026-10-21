'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path').win32;
const hostPath = require('node:path');
const {createRequire} = require('node:module');
const test = require('node:test');
const vm = require('node:vm');
const {portablePowerShell, powerShell7, windowsIntegrationSkip, windowsMountFileSystem} = require('./helpers/test-platform.cjs');

test('portable probes retain Windows PowerShell and explicit PowerShell 7 executables on Windows', () => {
    assert.equal(portablePowerShell('win32'), 'powershell.exe');
    assert.equal(powerShell7('win32'), 'pwsh.exe');
    for (const platform of ['linux', 'darwin']) {
        assert.equal(portablePowerShell(platform), 'pwsh');
        assert.equal(powerShell7(platform), 'pwsh');
    }
});

test('Windows integration guards run on Windows and explain every non-Windows skip', () => {
    const reason = 'Requires Windows PowerShell 5.1 integration.';
    assert.equal(windowsIntegrationSkip(reason, 'win32'), false);
    for (const platform of ['linux', 'darwin']) assert.equal(windowsIntegrationSkip(reason, platform), reason);
});

test('all five integration registrations retain Windows coverage and skip only on other platforms', () => {
    const integrations = [
        ['cd2-cold-warm-observer.test.cjs', 'CD2 cold/warm observer black-box contract'],
        ['diagnostics-collector.test.cjs', 'sanitized diagnostics collector black-box contract'],
        ['report-playback-issue.test.cjs', 'playback issue snapshot black-box contract'],
        ['report-playback-issue-encoding.test.cjs', 'reporter script encoding stays valid in Windows PowerShell 5.1 and PowerShell 7'],
        ['v029-diagnostics-privacy.test.cjs', 'actual issue snapshot and collector ZIP contain only sanitized synthetic secrets and media paths']
    ];
    const helperPath = hostPath.join(__dirname, 'helpers', 'test-platform.cjs');
    for (const platform of ['win32', 'linux']) {
        const helperModule = {exports: {}};
        vm.runInNewContext(fs.readFileSync(helperPath, 'utf8'), {
            module: helperModule, require, process: {platform}
        }, {filename: helperPath});
        for (const [file, name] of integrations) {
            const filename = hostPath.join(__dirname, file);
            const registered = new Map();
            const localRequire = createRequire(filename);
            vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
                __dirname, Buffer, process: {platform, env: {}},
                require(id) {
                    if (id === 'node:test') return (label, options) => registered.set(label, options);
                    if (id === './helpers/test-platform.cjs') return helperModule.exports;
                    return localRequire(id);
                }
            }, {filename});
            const options = registered.get(name);
            assert.ok(options && typeof options === 'object', file + ' must declare its platform guard');
            if (platform === 'win32') assert.equal(options.skip, false, file + ' must execute on Windows');
            else assert.match(options.skip, /^Requires (?:real )?Windows/, file + ' must explain its skip');
        }
    }
});

test('Windows mount fixtures keep the real Windows filesystem', () => {
    assert.equal(windowsMountFileSystem('win32'), fs);
});

test('synthetic Windows mount fixtures distinguish exact existing paths and isolate cleanup', () => {
    const mountFs = windowsMountFileSystem('linux');
    const first = mountFs.mkdtempSync();
    const second = mountFs.mkdtempSync();
    const existing = path.join(first, 'Movie.mkv');
    const other = path.join(second, 'Movie.mkv');
    assert.equal(path.isAbsolute(first), true);
    assert.notEqual(first, second);
    assert.equal(mountFs.existsSync(existing), false);
    mountFs.writeFileSync(existing, 'fixture');
    mountFs.writeFileSync(other, 'fixture');
    assert.equal(mountFs.existsSync(existing), true);
    assert.equal(mountFs.existsSync(path.join(first, 'Missing.mkv')), false);
    assert.equal(mountFs.existsSync('/tmp/Movie.mkv'), false);
    mountFs.rmSync(first, {recursive: true, force: true});
    assert.equal(mountFs.existsSync(existing), false);
    assert.equal(mountFs.existsSync(other), true);
});
