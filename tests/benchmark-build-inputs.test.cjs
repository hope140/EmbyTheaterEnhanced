'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {parseArguments, fixtureEvidence, benchmarkEnvironment, checkProcess} = require('../tools/benchmark-build-inputs.cjs');
const coordinator = require('../tools/benchmark-build-inputs-windows.cjs');
const {createFactory} = require('./helpers/build-input-fixture.cjs');
function temporary(t) {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'build-benchmark-test-')));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));return root;
}
test('benchmark bounds preserve balanced A/B and reject ambiguous CLI input', () => {
    const output = path.join(os.tmpdir(), 'not-created');
    assert.equal(parseArguments(['fixture-prep', output]).trials, 4);
    assert.equal(parseArguments(['plan', output, '--trials', '8', '--warm-calls', '10']).warmCalls, 10);
    for (const args of [['plan', output, '--trials', '3'], ['plan', output, '--warm-calls', '0'],
        ['plan', output, '--warm-calls', '11'], ['plan', output, '--trials', '2', '--trials', '4'],
        ['host', output], ['plan', output, '--trials', '2x'], ['plan', output, '--unknown', '1']]) {
        assert.throws(() => parseArguments(args));
    }
    const args = ['--source-sha', 'a'.repeat(40), '--output', output];
    assert.equal(coordinator.options([...args]).sourceCommit, 'a'.repeat(40));
    assert.throws(() => coordinator.options([...args, '--source-sha', 'b'.repeat(40)]));
    assert.throws(() => coordinator.options(['--source-sha', 'main', '--output', output]));
    assert.deepEqual(benchmarkEnvironment({PATH: 'kept', GIT_DIR: 'other', git_work_tree: 'other',
        GIT_INDEX_FILE: 'other', GIT_CONFIG_COUNT: '1', GIT_NO_REPLACE_OBJECTS: '0'}),
    {PATH: 'kept', GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1'});
    assert.throws(() => checkProcess({status: 7}, 'failed'), error => error.exitCode === 7);
});
test('benchmark output must be new, outside checkout and on physical directories', t => {
    const base = temporary(t), source = path.join(base, 'source'), sibling = path.join(base, 'output');fs.mkdirSync(source);
    assert.equal(coordinator.outputPath(source, sibling), sibling);
    for (const output of [source, base, path.join(source, 'nested')]) assert.throws(() => coordinator.outputPath(source, output));
    fs.mkdirSync(sibling);assert.throws(() => coordinator.outputPath(source, sibling));
    const alias = path.join(base, 'alias');fs.symlinkSync(sibling, alias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => coordinator.outputPath(source, path.join(alias, 'nested')), /Physical|redirect/);
    fs.rmSync(sibling, {recursive: true});assert.throws(() => coordinator.outputPath(source, alias), /new/);
});
test('artifact whitelist keeps diagnostics but excludes source trees and object stores', t => {
    const base = temporary(t);
    for (const file of ['session.json', 'runs/host/raw.json', 'runs/host/0-batch/stdout.txt',
        'runs/host/0-batch/source-0/Emby.Theater.cs', 'inputs/official-host.git/config', 'other-token.txt']) {
        fs.mkdirSync(path.dirname(path.join(base, file)), {recursive: true});fs.writeFileSync(path.join(base, file), '{}');
    }
    const manifest = coordinator.stageArtifacts(base);
    assert.deepEqual(manifest.map(x => x.path), ['session.json', 'runs/host/raw.json', 'runs/host/0-batch/stdout.txt']);
    for (const row of manifest) assert.match(row.sha256, /^[a-f0-9]{64}$/);
    assert.equal(fs.existsSync(path.join(base, 'artifact/inputs')), false);
    assert.equal(fs.existsSync(path.join(base, 'artifact/runs/host/0-batch/source-0')), false);
    const redirected = temporary(t), real = path.join(redirected, 'real-host');fs.mkdirSync(real);
    fs.writeFileSync(path.join(real, 'raw.json'), '{}');fs.mkdirSync(path.join(redirected, 'runs'));
    fs.symlinkSync(real, path.join(redirected, 'runs/host'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => coordinator.stageArtifacts(redirected), /Physical|redirect/);
    const destinationAlias = temporary(t), outside = temporary(t);
    fs.symlinkSync(outside, path.join(destinationAlias, 'artifact'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => coordinator.stageArtifacts(destinationAlias));assert.deepEqual(fs.readdirSync(outside), []);
});
test('fixture preparation benchmark compares equal trees and validates every independent copy', t => {
    const fresh = createFactory('fresh'), seed = createFactory('seed');
    t.after(() => {fresh.dispose();seed.dispose();});
    const a = fresh.create(), b = seed.create(), c = seed.create();
    const expected = fixtureEvidence(a);
    assert.deepEqual(fixtureEvidence(b), expected);assert.deepEqual(fixtureEvidence(c), expected);
    fs.appendFileSync(path.join(b.repo, expected.files[0].path), 'dirty\n');
    assert.throws(() => fixtureEvidence(b), /differs from HEAD/);assert.deepEqual(fixtureEvidence(c), expected);
    fs.writeFileSync(path.join(c.runtime, 'canary'), 'runtime');
    assert.throws(() => fixtureEvidence(c));
    fs.rmSync(c.runtime, {recursive: true});
    const otherRuntime = path.join(c.base, 'other-runtime');fs.mkdirSync(otherRuntime);
    fs.symlinkSync(otherRuntime, c.runtime, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => fixtureEvidence(c));
    const cBase = c.base;seed.dispose();assert.equal(fs.existsSync(cBase), false);c.cleanup();
    assert.throws(() => seed.create(), /closed/);
    a.cleanup();
});
