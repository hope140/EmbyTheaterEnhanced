'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const main = fs.readFileSync(path.join(__dirname, '../src/electronapp/main.js'), 'utf8');

test('shared trial prepare precedes bootstrap and its failure is not caught as ordinary startup', () => {
    const trial = main.indexOf("var sharedCacheTrial = require('./enhanced/shared-playback-cache/trial').prepare(");
    const bootstrap = main.indexOf('var appBootstrapState = appBootstrap.bootstrap(');
    assert(trial > 0 && bootstrap > trial);
    assert(!main.slice(trial, bootstrap).includes('catch'));
});

function runWindowsSelection(args, sharedCacheTrial, pageCacheTest = null) {
    const start = main.indexOf('function parseCommandLine()');
    const end = main.indexOf("var strmConfigStoreModule = require('./enhanced/strm-config-store');", start);
    assert(start > 0 && end > start);
    const paths = [];
    vm.runInNewContext(main.slice(start, end), {sharedCacheTrial, pageCacheTest,
        process: {argv: ['electron.exe', 'electronapp', ...args]},
        require: name => name === 'is-windows' ? () => true : name === 'detect-rpi' ? () => false : require(name),
        app: {setPath: (name, value) => paths.push([name, value])}});
    return paths;
}
for (const args of [
    ['--ete-shared-cache-trial=OWNED'],
    ['ORIGINAL_HOST_PROFILE', '--ete-shared-cache-trial=OWNED'],
    ['--ete-shared-cache-trial=OWNED', 'ORIGINAL_HOST_PROFILE'],
]) test('actual Windows legacy parser cannot overwrite isolated userData: ' + args.join(' '), () => {
    assert.deepEqual(runWindowsSelection(args, {userDataPath: 'OWNED_ISOLATED_USERDATA'}), [['userData', 'OWNED_ISOLATED_USERDATA']]);
});
test('actual Windows legacy positional profile and page trial keep their old behavior without shared mode', () => {
    assert.deepEqual(runWindowsSelection(['ORIGINAL_HOST_PROFILE'], null), [['userData', 'ORIGINAL_HOST_PROFILE']]);
    assert.deepEqual(runWindowsSelection(['ORIGINAL_HOST_PROFILE'], null, {userDataPath: 'OWNED_PAGE_USERDATA'}), [['userData', 'OWNED_PAGE_USERDATA']]);
});

function runtimeConfig(sharedCacheTrial, enabled) {
    const start = main.indexOf('function getRangeCacheRuntimeConfig()');
    const end = main.indexOf('unregisterRangeSettingsIpc =', start);
    const sandbox = {sharedCacheTrial, path, app: {getPath: () => '/owned-trial/userdata'},
        rangeSettingsStore: {get: () => ({enabled, progressPercent: 70, preloadMB: 300}),
            runtimeConfig: () => ({kind: 'next-prefix', marker: 'ordinary-path'})}};
    vm.runInNewContext(main.slice(start, end) + '\nresult = getRangeCacheRuntimeConfig();', sandbox);
    return JSON.parse(JSON.stringify(sandbox.result));
}
test('actual main config uses both the explicit isolated trial and existing enabled setting', () => {
    assert.equal(runtimeConfig({root: 'OWNED'}, false), null);
    const selected = runtimeConfig({root: 'OWNED'}, true);
    assert.equal(selected.kind, 'shared-byte-trial');
    assert.equal(selected.progressPercent, 70); assert.equal(selected.preloadMB, 300);
    assert.equal(selected.root, path.join('/owned-trial/userdata', 'shared-playback-byte-cache-v2'));
    assert.deepEqual(runtimeConfig(null, true), {kind: 'next-prefix', marker: 'ordinary-path'});
});

const service = fs.readFileSync(path.join(__dirname, '../src/electronapp/native-helper/service.js'), 'utf8');
function exactBudgetReader(value, mutate) {
    const calls = [], helper = {currentGenerationId: 7,
        setProperty: (...args) => calls.push(['set', ...args]),
        submitCommand: args => calls.push(['command', ...args]),
        async getProperty(...args) {calls.push(['get', ...args]); if (mutate) mutate(helper); return value;}};
    const start = service.indexOf('async function readSharedCurrentBytes(');
    const end = service.indexOf('function createRangeSession(', start);
    const sandbox = {client: helper, destroyed: false};
    vm.runInNewContext(service.slice(start, end) + '\nreader = readSharedCurrentBytes;', sandbox);
    return {calls, read: () => sandbox.reader(helper, 7)};
}
for (const bytes of [256 * 1024, 300 * 1024 * 1024, 3072 * 1024 * 1024]) test('actual service reads precise Native NODE budget in one request: ' + bytes, async () => {
    const f = exactBudgetReader(bytes); assert.equal(await f.read(), bytes);
    assert.equal(f.calls.length, 1, 'no clear/expand commands may precede the Native property request');
    assert.deepEqual(Array.from(f.calls[0]), ['get', 'demuxer-max-bytes', 50]);
});
for (const value of [-1073741824, 0, 262143, 3221225473, 262144.5, NaN, Infinity, null, true,
    '3221225472', '3GiB', '0', String(3072 * 1024 * 1024 + 1)]) test('actual service rejects unavailable or non-Native-integer cache budget: ' + value, async () => {
    await assert.rejects(exactBudgetReader(value).read(), /budget-unavailable/);
});
test('actual service rejects a late exact budget reply from a retired generation', async () => {
    await assert.rejects(exactBudgetReader(314572800, helper => {helper.currentGenerationId = 8;}).read(), /budget-unavailable/);
});
