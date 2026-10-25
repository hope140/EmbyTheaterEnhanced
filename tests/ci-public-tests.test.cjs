'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const runner = require('../tools/ci-public-tests.cjs');
const runnerSource = fs.readFileSync(require.resolve('../tools/ci-public-tests.cjs'), 'utf8');
const portHelperSource = fs.readFileSync(require.resolve('./helpers/range-fixture-root.cjs'));
function copyRunner(root) {
    fs.mkdirSync(path.join(root, 'tests/helpers'), {recursive: true});
    fs.writeFileSync(path.join(root, 'tools/ci-public-tests.cjs'), runnerSource);
    fs.writeFileSync(path.join(root, 'tests/helpers/range-fixture-root.cjs'), portHelperSource);
}

test('public test set discovers every test file and excludes only the six material-required files', () => {
    const discovered = runner.discoverTests();
    const selected = runner.selectTests(discovered);
    assert.equal(discovered.length, selected.length + 6);
    assert.deepEqual(discovered.filter(file => !selected.includes(file)), runner.MATERIAL_REQUIRED.slice().sort());
    assert.ok(selected.includes('tests/ci-public-tests.test.cjs'));
    assert.ok(selected.includes('tests/ci-secret-scan.test.cjs'));
});

for (const expectedStatus of [0, 1]) {
    test('public runner streams both child outputs before completion and returns status ' + expectedStatus, {timeout: 15000}, async t => {
        const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-ci-stream-')));
        t.after(() => fs.rmSync(root, {recursive: true, force: true}));
        fs.mkdirSync(path.join(root, 'tools'));
        fs.mkdirSync(path.join(root, 'tests'));
        copyRunner(root);
        for (const file of runner.MATERIAL_REQUIRED) fs.writeFileSync(path.join(root, file), '');
        fs.writeFileSync(path.join(root, 'tests', 'stream.test.cjs'), `
const fs = require('node:fs');
process.stdout.write('CHILD_STDOUT_READY\\n');
process.stderr.write('CHILD_STDERR_READY\\n');
const deadline = Date.now() + 8000;
const timer = setInterval(() => {
    if (fs.existsSync('release-child')) {
        clearInterval(timer);
        process.stdout.write('CHILD_HANDSHAKE_COMPLETE\\n');
        process.exitCode = ${expectedStatus};
    } else if (Date.now() > deadline) {
        clearInterval(timer);
        throw new Error('child output was buffered until completion');
    }
}, 20);
`);
        const env = {...process.env};
        delete env.NODE_TEST_CONTEXT;
        const child = childProcess.spawn(process.execPath, ['tools/ci-public-tests.cjs'], {cwd: root, env, stdio: ['ignore', 'pipe', 'pipe']});
        let stdout = '';
        let stderr = '';
        let released = false;
        function releaseWhenBothVisible() {
            if (!released && (stdout + stderr).includes('CHILD_STDOUT_READY') && (stdout + stderr).includes('CHILD_STDERR_READY')) {
                released = true;
                fs.writeFileSync(path.join(root, 'release-child'), '');
            }
        }
        child.stdout.on('data', data => { stdout += data; releaseWhenBothVisible(); });
        child.stderr.on('data', data => { stderr += data; releaseWhenBothVisible(); });
        const status = await new Promise((resolve, reject) => {
            child.once('error', reject);
            child.once('close', resolve);
        });
        assert.equal(released, true, stdout + stderr);
        assert.match(stdout + stderr, /CHILD_HANDSHAKE_COMPLETE/);
        assert.equal(status, expectedStatus, stdout + stderr);
    });
}

test('public runner preserves child status, missing status and spawn-error propagation', () => {
    for (const result of [{status: 7}, {status: null}, {error: new Error('fixture spawn failure')}]) {
        const module = {exports: {}};
        let stderr = '';
        const process = {execPath: 'fixture-node', env: {}, platform: 'linux', stdout: {write() {}}, stderr: {write(text) { stderr += text; }}};
        const requireFixture = name => name === 'node:child_process' ? {spawnSync() { return result; }}
            : name === 'node:fs' ? {readdirSync() { return runner.MATERIAL_REQUIRED.map(file => path.basename(file)); }} : require(name);
        requireFixture.main = module;
        vm.runInNewContext(runnerSource, {require: requireFixture, module, process, __dirname: path.join(os.tmpdir(), 'tools')});
        assert.equal(process.exitCode, result.status === 7 ? 7 : 1);
        assert.equal(stderr, result.error ? 'Public test runner failed: fixture spawn failure\n' : '');
    }
});

test('public runner passes the single parent preflight environment to all test children and fails before spawn on preflight error', () => {
    for (const rejected of [false, true]) {
        const module = {exports: {}}, order = [];
        const original = {OWNED_TEST: 'preserved'}, inherited = {...original, ETE_TEST_WINDOWS_PORT_SNAPSHOT: 'owned-snapshot'};
        let passed, stderr = '';
        const process = {execPath: 'fixture-node', env: original, platform: 'win32', stdout: {write() {}}, stderr: {write(value) {stderr += value;}}};
        const requireFixture = name => {
            if (name === '../tests/helpers/range-fixture-root.cjs') return {testEnvironment(env, platform) {
                order.push('preflight'); assert.equal(env, original); assert.equal(platform, 'win32');
                if (rejected) throw Error('owned-preflight-failure');
                return inherited;
            }};
            if (name === 'node:child_process') return {spawnSync(_executable, args, options) {
                order.push('spawn'); passed = options.env; assert.ok(args.includes('--test-concurrency=1'));
                return {status: 0};
            }};
            if (name === 'node:fs') return {readdirSync() {return runner.MATERIAL_REQUIRED.map(file => path.basename(file));}};
            return require(name);
        };
        requireFixture.main = module;
        vm.runInNewContext(runnerSource, {require: requireFixture, module, process, __dirname: path.join(os.tmpdir(), 'tools')});
        assert.deepEqual(order, rejected ? ['preflight'] : ['preflight', 'spawn']);
        assert.equal(passed, rejected ? undefined : inherited);
        assert.equal(process.exitCode, rejected ? 1 : 0);
        assert.equal(stderr, rejected ? 'Public test runner failed: owned-preflight-failure\n' : '');
        assert.deepEqual(original, {OWNED_TEST: 'preserved'});
    }
});


test('TAP emits a failed test stack while the owned child still holds an event-loop resource', {timeout: 15000}, async t => {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-ci-failure-stack-')));
    fs.mkdirSync(path.join(root, 'tools')); fs.mkdirSync(path.join(root, 'tests'));
    copyRunner(root);
    for (const file of runner.MATERIAL_REQUIRED) fs.writeFileSync(path.join(root, file), '');
    fs.writeFileSync(path.join(root, 'tests', 'failure.test.cjs'), `
const fs = require('node:fs'), test = require('node:test'), assert = require('node:assert/strict');
const deadline = Date.now() + 7000;
const timer = setInterval(() => {if (fs.existsSync('release-child') || Date.now() > deadline) clearInterval(timer);}, 20);
test('owned immediate failure', () => assert.equal(1, 2, 'owned-first-failure-marker'));
`);
    const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
    const child = childProcess.spawn(process.execPath, ['tools/ci-public-tests.cjs'], {cwd: root, env, stdio: ['ignore', 'pipe', 'pipe']});
    let text = '', released = false, closed = false;
    t.after(() => {fs.writeFileSync(path.join(root, 'release-child'), ''); if (closed) fs.rmSync(root, {recursive: true, force: true});});
    const see = data => {
        text += data;
        if (!released && /owned-first-failure-marker/.test(text) && /ERR_ASSERTION/.test(text) && /stack:/.test(text)) {
            released = true; fs.writeFileSync(path.join(root, 'release-child'), '');
        }
    };
    child.stdout.on('data', see); child.stderr.on('data', see);
    const code = await new Promise((resolve, reject) => {child.once('error', reject); child.once('close', resolve);}); closed = true;
    assert.equal(code, 1); assert.equal(released, true, 'failure stack must be visible before the child can complete');
});
