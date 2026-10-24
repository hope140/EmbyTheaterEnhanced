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
function benchmarkEnvironment(source = process.env) {
    const env = Object.fromEntries(Object.entries(source).filter(([name]) => !/^GIT_/i.test(name)));
    return {...env, GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1'};
}
function checkProcess(result, message) {
    if (result.status !== 0) {
        const error = new Error(message || result.stderr || result.error?.message || 'Benchmark child failed.');
        error.exitCode = Number.isInteger(result.status) && result.status > 0 && result.status <= 255 ? result.status : 1;
        throw error;
    }
}
function git(args) { return cp.execFileSync('git', ['-C', root, ...args], {encoding: 'utf8', env: benchmarkEnvironment()}).trim(); }
function legacy(file) {
    const filename = path.join(root, file), m = new Module(filename + '.baseline', module);
    m.filename = filename;m.paths = Module._nodeModulePaths(path.dirname(filename));
    m._compile(cp.execFileSync('git', ['-C', root, 'show', BASE + ':' + file], {encoding: 'utf8', env: benchmarkEnvironment()}), filename);
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
function parseArguments(args) {
    const [suite, output, ...rest] = args;
    if (!['plan', 'host', 'fixtures', 'fixture-prep'].includes(suite) || !output) throw new Error('A benchmark suite and new output directory are required.');
    const store = suite === 'host' ? rest.shift() : undefined;
    if (suite === 'host' && (!store || store.startsWith('--'))) throw new Error('Host benchmark requires an existing fixed object store.');
    const config = {suite, output, store, trials: 4, warmCalls: 3};
    const seen = new Set();
    while (rest.length) {
        const name = rest.shift(), value = rest.shift();
        if (!['--trials', '--warm-calls'].includes(name) || seen.has(name) || !/^\d+$/.test(value || '')) throw new Error('Invalid benchmark option.');
        seen.add(name);config[name === '--trials' ? 'trials' : 'warmCalls'] = Number(value);
    }
    if (!Number.isInteger(config.trials) || config.trials < 2 || config.trials > 8 || config.trials % 2 ||
        !Number.isInteger(config.warmCalls) || config.warmCalls < 1 || config.warmCalls > 10) {
        throw new Error('Use 2–8 even trials and 1–10 warm calls.');
    }
    return config;
}
function fixtureEvidence(fixture) {
    const report = require('./build-input-contract.cjs').inspect(fixture.repo, fixture.sourceCommit);
    assert.ok(fs.lstatSync(fixture.runtime).isDirectory() && !fs.lstatSync(fixture.runtime).isSymbolicLink());
    assert.equal(fs.realpathSync.native(fixture.runtime), fixture.runtime);
    assert.deepEqual(fs.readdirSync(fixture.runtime), []);
    assert.equal(fs.existsSync(path.join(fixture.repo, '.git/objects/info/alternates')), false);
    const names = report.files.map(file => file.path);
    function gitFiles(directory) {
        for (const name of fs.readdirSync(directory)) {
            const file = path.join(directory, name), stat = fs.lstatSync(file);
            assert.equal(stat.isSymbolicLink(), false);
            if (stat.isDirectory()) gitFiles(file);
            else {assert.ok(stat.isFile());names.push(path.relative(fixture.repo, file));}
        }
    }
    gitFiles(path.join(fixture.repo, '.git'));
    for (const name of names) {
        const file = path.join(fixture.repo, name), stat = fs.lstatSync(file);
        assert.equal(stat.isSymbolicLink(), false);assert.equal(stat.nlink, 1);
        assert.equal(fs.realpathSync.native(file), file);
    }
    const tree = cp.execFileSync('git', ['-C', fixture.repo, 'rev-parse', 'HEAD^{tree}'], {encoding: 'utf8'}).trim();
    return {tree, files: report.files.map(file => ({...file, worktreeSha256: sha(fs.readFileSync(path.join(fixture.repo, file.path)))})),
        configBaseSha256: sha(fixture.configBase)};
}
function worker(suite, variant, output, store, warmCalls = 3) {
    assert.ok(['plan', 'host', 'fixture-prep'].includes(suite));
    assert.ok((suite === 'fixture-prep' ? ['fresh', 'seed'] : ['legacy', 'batch']).includes(variant));
    assert.ok(Number.isInteger(warmCalls) && warmCalls >= 1 && warmCalls <= 10);
    const tool = suite === 'plan' ? 'tools/ci-build-input-plan.cjs' : 'tools/ci-source-built-host-plan.cjs';
    const factory = suite === 'fixture-prep' ? require('../tests/helpers/build-input-fixture.cjs').createFactory(variant) : undefined;
    const implementation = factory ? undefined : variant === 'legacy' ? legacy(tool) : require(path.join(root, tool));
    const rows = [], originalSpawn = cp.spawnSync, originalExec = cp.execFileSync;
    let calls = 0;
    cp.spawnSync = (command, args, options) => {if (command === 'git') calls++;return originalSpawn(command, args, options);};
    cp.execFileSync = (command, args, options) => {if (command === 'git') calls++;return originalExec(command, args, options);};
    try {
        for (let i = 0; i <= warmCalls; i++) {
            calls = 0;
            const out = path.join(output, 'source-' + i), startedUtc = new Date().toISOString(), start = performance.now();
            const result = factory ? factory.create() : suite === 'plan' ? implementation.createPlan(root) : implementation.restoreSource(root, store, out);
            const elapsedMs = performance.now() - start, gitProcesses = calls, verifyStart = performance.now();
            // Identical verification for every output, outside the operation clock.
            let evidence;
            try {
                if (factory) evidence = fixtureEvidence(result);
                else if (suite === 'plan') evidence = result;
                else {
                    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'native/windows-host/upstream-source-manifest.json')));
                    assert.equal(result.commit, manifest.commit);assert.equal(result.files, 55);
                    for (const file of manifest.files) {
                        const bytes = fs.readFileSync(path.join(out, file.path));
                        assert.equal(bytes.length, file.size);assert.equal(sha(bytes), file.sha256);
                    }
                    evidence = result;
                }
                rows.push({sample: i, startedUtc, state: i === 0 ? 'first-in-process' : 'warm-in-process', elapsedMs, gitProcesses,
                    verificationMs: performance.now() - verifyStart, digest: sha(JSON.stringify(evidence)),
                    ...(factory ? {fixtureTree: evidence.tree, validatedInputFiles: evidence.files.length} : {})});
            } finally {if (factory) result.cleanup();}
        }
    } finally {
        cp.spawnSync = originalSpawn;cp.execFileSync = originalExec;
        if (factory) factory.dispose();
    }
    return rows;
}

function main() {
    // Also protect implementation-owned Git children in direct internal worker mode.
    for (const name of Object.keys(process.env)) if (/^GIT_/i.test(name)) delete process.env[name];
    process.env.GIT_NO_LAZY_FETCH = '1';process.env.GIT_NO_REPLACE_OBJECTS = '1';
    const [suite, outputArg, store] = process.argv.slice(2);
    if (suite === '--worker') {
        const [kind, variant, output, objectStore, warm] = process.argv.slice(3);
        console.log(JSON.stringify(worker(kind, variant, output, objectStore === '-' ? undefined : objectStore, Number(warm))));return;
    }
    const config = parseArguments(process.argv.slice(2));
    const {trials, warmCalls} = config;
    cp.execFileSync('git', ['-C', root, 'diff', '--quiet', 'HEAD'], {env: benchmarkEnvironment()});
    assert.equal(git(['status', '--porcelain']), '', 'use a fully committed, clean source checkout');
    const output = path.resolve(outputArg);fs.mkdirSync(output, {recursive: false});
    const variants = suite.startsWith('fixture') ? ['fresh', 'seed'] : ['legacy', 'batch'];
    const report = {schemaVersion: 2, suite, configuration: {trials, warmCalls, callsPerProcess: suite === 'fixtures' ? 1 : warmCalls + 1},
        scope: suite === 'fixture-prep' ? 'preparation-only; no unit tests run' : suite === 'fixtures' ? 'complete 28-test fixture suite' : 'fixed input operation',
        sourceCommit: git(['rev-parse', 'HEAD']), baselineAlgorithmCommit: suite.startsWith('fixture') ? null : BASE,
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
    report.inputIdentity.fixtureSources = Object.fromEntries(['tests/helpers/build-input-fixture.cjs',
        'tests/helpers/runtime-template-fixture.cjs', 'tests/build-input-contract.test.cjs'].map(file =>
        [file, {objectId: git(['rev-parse', 'HEAD:' + file]), worktreeSha256: sha(fs.readFileSync(path.join(root, file)))}]));
    const env = benchmarkEnvironment();delete env.NODE_TEST_CONTEXT;
    for (let trial = 0; trial < trials; trial++) {
        for (const variant of trial % 2 ? [...variants].reverse() : variants) {
            const stem = trial + '-' + variant, folder = path.join(output, stem);fs.mkdirSync(folder);
            let result, row;
            const processStart = performance.now();
            if (suite === 'fixtures') {
                const start = performance.now();
                result = cp.spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--test-concurrency=1', 'tests/build-input-contract.test.cjs'], {
                    cwd: root, env: {...env, ETE_BUILD_INPUT_FIXTURE_MODE: variant}, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024
                });
                const wallMs = performance.now() - start;
                fs.writeFileSync(path.join(folder, 'tests.tap'), result.stdout || '');
                fs.writeFileSync(path.join(folder, 'stderr.txt'), result.stderr || '');
                fs.writeFileSync(path.join(folder, 'process.json'), JSON.stringify({status: result.status, signal: result.signal,
                    error: result.error?.message, processWallMs: wallMs}, null, 2) + '\n');
                checkProcess(result, result.stderr || result.error?.message || result.stdout);
                const summary = totals(result.stdout);
                const preparations = [...result.stdout.matchAll(/CI_FIXTURE_PREP (\{[^\n]+\})/g)].map(m => JSON.parse(m[1]));
                assert.ok(preparations.length > 28);
                row = {trial, variant, wallMs, summary, preparations};
            } else {
                result = cp.spawnSync(process.execPath, [__filename, '--worker', suite, variant, folder, store ? path.resolve(store) : '-', String(warmCalls)], {
                    cwd: root, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024
                });
                const processWallMs = performance.now() - processStart;
                fs.writeFileSync(path.join(folder, 'stdout.txt'), result.stdout || '');
                fs.writeFileSync(path.join(folder, 'stderr.txt'), result.stderr || '');
                fs.writeFileSync(path.join(folder, 'process.json'), JSON.stringify({status: result.status, signal: result.signal,
                    error: result.error?.message, processWallMs}, null, 2) + '\n');
                checkProcess(result);
                row = {trial, variant, processWallMs, samples: JSON.parse(result.stdout)};
                assert.equal(row.samples.length, warmCalls + 1);
            }
            fs.writeFileSync(path.join(folder, 'stderr.txt'), result.stderr || '');
            report.trials.push(row);fs.writeFileSync(path.join(output, 'raw.json'), JSON.stringify(report, null, 2) + '\n');
            console.log(JSON.stringify({suite, trial, variant, completed: true, wallMs: row.wallMs}));
        }
    }
    report.workload = suite === 'fixtures' ? {unitTestsPerProcess: 28, processesPerArm: trials}
        : {unitTestsPerProcess: 0, operationsPerArm: trials * (warmCalls + 1),
            ...(suite === 'fixture-prep' ? {contractValidationsPerArm: trials * (warmCalls + 1)} : {})};
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
            report.statistics[variant] = {processWall: stats(report.trials.filter(t => t.variant === variant).map(t => t.processWallMs))};
            for (const state of ['first-in-process', 'warm-in-process']) {
                const samples = report.trials.filter(t => t.variant === variant).flatMap(t => t.samples.filter(s => s.state === state));
                report.statistics[variant][state] = {...stats(samples.map(s => s.elapsedMs)),
                    verification: stats(samples.map(s => s.verificationMs)),
                    gitProcesses: [...new Set(samples.map(s => s.gitProcesses))]};
            }
        }
    }
    assert.equal(git(['rev-parse', 'HEAD']), report.sourceCommit, 'source HEAD changed during A/B');
    assert.equal(git(['status', '--porcelain']), '', 'source checkout changed during A/B');
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report.statistics, null, 2));
}
module.exports = {parseArguments, stats, totals, fixtureEvidence, benchmarkEnvironment, checkProcess};
if (require.main === module) {
    try {main();} catch (error) {console.error(error.stack);process.exitCode = error.exitCode || 1;}
}
