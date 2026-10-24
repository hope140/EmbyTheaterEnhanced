'use strict';

// Local, offline A/B. Never dispatches Actions or modifies a source checkout.
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const {performance} = require('node:perf_hooks');
const BASE = '88578c91ab19d44eecddcfae096d37dc917ef1f4';
const root = path.resolve(__dirname, '..');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function git(args) { return cp.execFileSync('git', ['-C', root, ...args], {encoding: 'utf8'}).trim(); }
function legacy(file) {
    const filename = path.join(root, file), m = new Module(filename + '.baseline', module);
    m.filename = filename;m.paths = Module._nodeModulePaths(path.dirname(filename));
    m._compile(cp.execFileSync('git', ['-C', root, 'show', BASE + ':' + file], {encoding: 'utf8'}), filename);
    return m.exports;
}
function stats(values) {
    const a = [...values].sort((x, y) => x - y), mean = a.reduce((x, y) => x + y, 0) / a.length;
    const variance = a.reduce((n, x) => n + (x - mean) ** 2, 0) / a.length;
    return {n: a.length, medianMs: a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2,
        minMs: a[0], maxMs: a.at(-1), meanMs: mean, varianceMs2: variance, stddevMs: Math.sqrt(variance)};
}
function totals(tap) {
    const fields = [...tap.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo|duration_ms) ([\d.]+)$/gm)];
    const result = Object.fromEntries(fields.map(m => [m[1], Number(m[2])]));
    assert.equal(fields.length, 7, 'one complete test summary required');
    assert.equal(result.tests, 28);assert.equal(result.pass, 28);
    for (const key of ['fail', 'cancelled', 'skipped', 'todo']) assert.equal(result[key], 0);
    return result;
}
function worker(suite, variant, output, store) {
    const tool = suite === 'plan' ? 'tools/ci-build-input-plan.cjs' : 'tools/ci-source-built-host-plan.cjs';
    const implementation = variant === 'legacy' ? legacy(tool) : require(path.join(root, tool));
    const rows = [], originalSpawn = cp.spawnSync, originalExec = cp.execFileSync;
    let calls = 0;
    cp.spawnSync = (command, args, options) => {if (command === 'git') calls++;return originalSpawn(command, args, options);};
    cp.execFileSync = (command, args, options) => {if (command === 'git') calls++;return originalExec(command, args, options);};
    try {
        for (let i = 0; i < 4; i++) {
            calls = 0;
            const out = path.join(output, 'source-' + i), start = performance.now();
            const result = suite === 'plan' ? implementation.createPlan(root) : implementation.restoreSource(root, store, out);
            const elapsedMs = performance.now() - start, gitProcesses = calls;
            // Validate every result outside the clock, identically for A and B.
            let digest;
            if (suite === 'plan') digest = sha(JSON.stringify(result));
            else {
                const manifest = JSON.parse(fs.readFileSync(path.join(root, 'native/windows-host/upstream-source-manifest.json')));
                assert.equal(result.commit, manifest.commit);assert.equal(result.files, 55);
                for (const file of manifest.files) {
                    const b = fs.readFileSync(path.join(out, file.path));
                    assert.equal(b.length, file.size);assert.equal(sha(b), file.sha256);
                }
                digest = sha(JSON.stringify(result));
            }
            rows.push({state: i === 0 ? 'first-in-process' : 'warm-in-process', elapsedMs, gitProcesses, digest});
        }
    } finally {cp.spawnSync = originalSpawn;cp.execFileSync = originalExec;}
    return rows;
}
function main() {
    const [suite, outputArg, store] = process.argv.slice(2);
    if (suite === '--worker') {
        const [kind, variant, output, objectStore] = process.argv.slice(3);
        console.log(JSON.stringify(worker(kind, variant, output, objectStore)));return;
    }
    if (!['plan', 'host', 'fixtures'].includes(suite) || !outputArg || suite === 'host' && !store) {
        throw new Error('Usage: node tools/benchmark-build-inputs.cjs <plan|host|fixtures> <new-output-directory> [existing-Host-object-store]');
    }
    cp.execFileSync('git', ['-C', root, 'diff', '--quiet', 'HEAD']);
    assert.equal(git(['status', '--porcelain']), '', 'use a fully committed, clean source checkout');
    const output = path.resolve(outputArg);fs.mkdirSync(output, {recursive: false});
    const variants = suite === 'fixtures' ? ['fresh', 'seed'] : ['legacy', 'batch'];
    const report = {schemaVersion: 1, suite, sourceCommit: git(['rev-parse', 'HEAD']), baselineAlgorithmCommit: BASE,
        node: process.version, platform: process.platform, arch: process.arch,
        cacheScope: 'first measured call in a fresh process vs later calls; OS page cache is not flushed',
        trials: []};
    report.inputIdentity = {
        tree: git(['rev-parse', 'HEAD^{tree}']),
        hostSourceIdentitySha256: require('./source-built-host-input.cjs').sourceIdentity(root).sha256,
        hostManifestSha256: sha(fs.readFileSync(path.join(root, 'native/windows-host/upstream-source-manifest.json'))),
        authorities: Object.fromEntries(require('./ci-build-input-plan.cjs').AUTHORITIES.map(file =>
            [file, {objectId: git(['rev-parse', 'HEAD:' + file]), worktreeSha256: sha(fs.readFileSync(path.join(root, file)))}]))
    };
    const env = {...process.env};delete env.NODE_TEST_CONTEXT;
    for (let trial = 0; trial < 3; trial++) {
        for (const variant of trial % 2 ? [...variants].reverse() : variants) {
            const stem = trial + '-' + variant, folder = path.join(output, stem);fs.mkdirSync(folder);
            let result, row;
            if (suite === 'fixtures') {
                const start = performance.now();
                result = cp.spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--test-concurrency=1', 'tests/build-input-contract.test.cjs'], {
                    cwd: root, env: {...env, ETE_BUILD_INPUT_FIXTURE_MODE: variant}, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024
                });
                const wallMs = performance.now() - start;
                fs.writeFileSync(path.join(folder, 'tests.tap'), result.stdout || '');
                assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout);
                const summary = totals(result.stdout);
                const preparations = [...result.stdout.matchAll(/CI_FIXTURE_PREP (\{[^\n]+\})/g)].map(m => JSON.parse(m[1]));
                assert.ok(preparations.length > 28);
                row = {trial, variant, wallMs, summary, preparations};
            } else {
                result = cp.spawnSync(process.execPath, [__filename, '--worker', suite, variant, folder, ...(store ? [path.resolve(store)] : [])], {
                    cwd: root, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024
                });
                assert.equal(result.status, 0, result.stderr || result.error?.message);
                row = {trial, variant, samples: JSON.parse(result.stdout)};
            }
            fs.writeFileSync(path.join(folder, 'stderr.txt'), result.stderr || '');
            report.trials.push(row);fs.writeFileSync(path.join(output, 'raw.json'), JSON.stringify(report, null, 2) + '\n');
            console.log(JSON.stringify({suite, trial, variant, completed: true, wallMs: row.wallMs}));
        }
    }
    report.statistics = {};
    if (suite === 'fixtures') {
        assert.equal(new Set(report.trials.map(t => t.preparations.length)).size, 1);
        for (const variant of variants) {
            const trials = report.trials.filter(t => t.variant === variant);
            report.statistics[variant] = {wholeTest: stats(trials.map(t => t.summary.duration_ms))};
            for (const state of ['first-in-process', 'warm-in-process']) {
                report.statistics[variant][state] = stats(trials.flatMap(t => t.preparations.filter(p => p.state === state).map(p => p.elapsedMs)));
            }
        }
    } else {
        assert.equal(new Set(report.trials.flatMap(t => t.samples.map(s => s.digest))).size, 1, 'A/B output mismatch');
        for (const variant of variants) {
            report.statistics[variant] = {};
            for (const state of ['first-in-process', 'warm-in-process']) {
                const samples = report.trials.filter(t => t.variant === variant).flatMap(t => t.samples.filter(s => s.state === state));
                report.statistics[variant][state] = {...stats(samples.map(s => s.elapsedMs)),
                    gitProcesses: [...new Set(samples.map(s => s.gitProcesses))]};
            }
        }
    }
    assert.equal(git(['rev-parse', 'HEAD']), report.sourceCommit, 'source HEAD changed during A/B');
    assert.equal(git(['status', '--porcelain']), '', 'source checkout changed during A/B');
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report.statistics, null, 2));
}
if (require.main === module) {
    try {main();} catch (error) {console.error(error.stack);process.exitCode = 1;}
}
