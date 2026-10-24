'use strict';

// Opt-in benchmark coordinator. No Actions dispatch, package build, cache or checkout mutation.
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {performance} = require('node:perf_hooks');
const {parseArguments, benchmarkEnvironment, checkProcess} = require('./benchmark-build-inputs.cjs');
const ROOT = path.resolve(__dirname, '..');
const BASE = '88578c91ab19d44eecddcfae096d37dc917ef1f4';
const HOST = '708fadc068cbf66ced6aece4a32f3e12bb2c4e13';
const HOST_URL = 'https://github.com/MediaBrowser/emby-theater-windows';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
function options(args) {
    const parsed = {}, names = new Set(['--source-sha', '--output', '--host-store', '--trials', '--warm-calls', '--powershell-version']);
    while (args.length) {
        const name = args.shift(), value = args.shift();
        assert.ok(names.has(name) && !Object.hasOwn(parsed, name) && value && !value.startsWith('--'), 'Invalid coordinator option.');
        parsed[name] = value;
    }
    assert.match(parsed['--source-sha'] || '', /^[a-f0-9]{40}$/, 'Exact lowercase source SHA required.');
    assert.ok(parsed['--output'] && path.isAbsolute(parsed['--output']), 'Absolute new output path required.');
    if (parsed['--host-store']) assert.ok(path.isAbsolute(parsed['--host-store']), 'Absolute Host store required.');
    const config = parseArguments(['plan', parsed['--output'], '--trials', parsed['--trials'] || '4', '--warm-calls', parsed['--warm-calls'] || '3']);
    return {...config, sourceCommit: parsed['--source-sha'], hostStore: parsed['--host-store'], powershell: parsed['--powershell-version'] || null};
}
function physicalDirectory(directory) {
    const resolved = path.resolve(directory);
    let cursor = resolved;
    for (;;) {
        const stat = fs.lstatSync(cursor);
        assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'Physical directory required.');
        const parent = path.dirname(cursor);
        if (parent === cursor) break;
        cursor = parent;
    }
    assert.equal(fs.realpathSync.native(resolved).toLowerCase(), resolved.toLowerCase(), 'Directory redirects forbidden.');
    return resolved;
}
function contains(parent, child) {
    const relative = path.relative(parent, child);
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
}
function outputPath(sourceRoot, output) {
    const resolved = path.resolve(output);
    assert.ok(!contains(sourceRoot, resolved) && !contains(resolved, sourceRoot), 'Output and checkout must be disjoint.');
    let exists;
    try {fs.lstatSync(resolved);exists = true;} catch (error) {if (error.code !== 'ENOENT') throw error;exists = false;}
    assert.equal(exists, false, 'Output directory must be new.');
    physicalDirectory(path.dirname(resolved));
    return resolved;
}
function git(args, env = benchmarkEnvironment()) {
    try {return cp.execFileSync('git', args, {encoding: 'utf8', env, maxBuffer: 16 * 1024 * 1024}).trim();}
    catch (error) {
        error.exitCode = Number.isInteger(error.status) && error.status > 0 && error.status <= 255 ? error.status : 1;throw error;
    }
}
function cleanSource(expected) {
    assert.equal(git(['-C', ROOT, 'rev-parse', 'HEAD']), expected, 'Source SHA mismatch.');
    assert.equal(git(['-C', ROOT, 'status', '--porcelain', '--untracked-files=all']), '', 'Committed clean source required.');
    git(['-C', ROOT, 'cat-file', '-e', BASE + '^{commit}']);
}
function stageArtifacts(output) {
    const destination = path.join(output, 'artifact');
    fs.mkdirSync(destination, {recursive: true});
    const files = ['session.json'];
    for (const suite of ['plan', 'host', 'fixture-prep']) {
        for (const file of ['stdout.txt', 'stderr.txt', 'process.json']) files.push('drivers/' + suite + '/' + file);
        for (const file of ['raw.json', 'report.json']) files.push('runs/' + suite + '/' + file);
        for (let trial = 0; trial < 8; trial++) {
            for (const variant of suite === 'fixture-prep' ? ['fresh', 'seed'] : ['legacy', 'batch']) {
                for (const file of ['stdout.txt', 'stderr.txt', 'process.json']) files.push('runs/' + suite + '/' + trial + '-' + variant + '/' + file);
            }
        }
    }
    const manifest = [];
    for (const relative of files) {
        const source = path.join(output, relative);
        if (!fs.existsSync(source)) continue;
        physicalDirectory(path.dirname(source));
        assert.ok(fs.lstatSync(source).isFile() && !fs.lstatSync(source).isSymbolicLink(), 'Artifact redirects forbidden.');
        const bytes = fs.readFileSync(source), target = path.join(destination, relative);
        fs.mkdirSync(path.dirname(target), {recursive: true});fs.writeFileSync(target, bytes, {flag: 'wx'});
        manifest.push({path: relative, size: bytes.length, sha256: sha(bytes)});
    }
    json(path.join(destination, 'manifest.json'), {schemaVersion: 1, files: manifest});
    return manifest;
}
function main(args = process.argv.slice(2)) {
    const config = options([...args]);
    assert.equal(process.platform, 'win32', 'Run this coordinator on Windows.');
    assert.equal(process.version, 'v24.18.1', 'Pinned Node 24.18.1 required.');
    if (config.powershell) assert.match(config.powershell, /^7\./, 'PowerShell 7 required.');
    physicalDirectory(ROOT);cleanSource(config.sourceCommit);
    const output = outputPath(ROOT, config.output);
    let store = config.hostStore ? physicalDirectory(config.hostStore) : path.join(output, 'inputs/official-host.git');
    if (config.hostStore) assert.ok(!contains(output, store) && !contains(store, output), 'Host store and output must be disjoint.');
    fs.mkdirSync(output);
    const session = {schemaVersion: 1, sourceCommit: config.sourceCommit, baselineAlgorithmCommit: BASE,
        startedUtc: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch,
        osRelease: os.release(), osVersion: os.version(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length,
        git: git(['--version']), powershell: config.powershell,
        imageOS: process.env.ImageOS?.slice(0, 100), imageVersion: process.env.ImageVersion?.slice(0, 100),
        trialsPerArm: config.trials, warmCallsPerProcess: config.warmCalls, operationsPerArm: config.trials * (config.warmCalls + 1),
        unitTestsExecuted: 0, order: 'AB/BA alternating; suites serial on this machine',
        cacheScope: 'fresh process first call / warm in same process; OS cache not flushed',
        hostCommit: HOST, hostStoreMode: config.hostStore ? 'provided-read-only' : 'private-fetch-before-measurement', suites: []};
    let failure, stage = 'host-fetch';
    try {
        const acquireStart = performance.now();
        if (!config.hostStore) {
            fs.mkdirSync(path.dirname(store));
            git(['init', '--bare', '--quiet', store]);
            git(['-C', store, '-c', 'protocol.file.allow=never', 'fetch', '--no-tags', '--depth=1', HOST_URL, HOST]);
        }
        session.hostFetchMs = config.hostStore ? 0 : performance.now() - acquireStart;
        stage = 'host-store-validation';
        const validationStart = performance.now(), env = benchmarkEnvironment();
        assert.equal(git(['-C', store, 'rev-parse', '--is-bare-repository'], env), 'true', 'Bare Host store required.');
        git(['-C', store, 'cat-file', '-e', HOST + '^{commit}'], env);
        assert.equal(fs.existsSync(path.join(store, 'objects/info/alternates')), false, 'Shared alternate object stores forbidden.');
        session.hostStoreValidationMs = performance.now() - validationStart;
        session.hostPreparationMs = performance.now() - acquireStart;
        for (const suite of ['plan', 'host', 'fixture-prep']) {
            stage = suite;
            const folder = path.join(output, 'drivers', suite);fs.mkdirSync(folder, {recursive: true});
            fs.mkdirSync(path.join(output, 'runs'), {recursive: true});
            const command = [path.join(ROOT, 'tools/benchmark-build-inputs.cjs'), suite, path.join(output, 'runs', suite)];
            if (suite === 'host') command.push(store);
            command.push('--trials', String(config.trials), '--warm-calls', String(config.warmCalls));
            const start = performance.now();
            const result = cp.spawnSync(process.execPath, command, {cwd: ROOT, env, encoding: 'utf8',
                maxBuffer: 16 * 1024 * 1024});
            const record = {suite, status: result.status, signal: result.signal, error: result.error?.message, processWallMs: performance.now() - start};
            fs.writeFileSync(path.join(folder, 'stdout.txt'), result.stdout || '');
            fs.writeFileSync(path.join(folder, 'stderr.txt'), result.stderr || '');json(path.join(folder, 'process.json'), record);
            session.suites.push(record);json(path.join(output, 'session.json'), session);
            checkProcess(result, suite + ' benchmark failed; inspect staged stderr.');
            const report = JSON.parse(fs.readFileSync(path.join(output, 'runs', suite, 'report.json')));
            assert.equal(report.sourceCommit, config.sourceCommit);assert.equal(report.workload.operationsPerArm, session.operationsPerArm);
            if (!session.inputIdentity) session.inputIdentity = report.inputIdentity;
            else assert.deepEqual(report.inputIdentity, session.inputIdentity, 'Suite input identities differ.');
            console.log(suite + ': completed, ' + session.operationsPerArm + ' operations per arm');
        }
        stage = 'final-source-check';cleanSource(config.sourceCommit);
        session.conclusion = 'passed';
    } catch (error) {
        failure = error;session.conclusion = 'failed';
        session.failure = {stage, message: error.message, status: error.status, signal: error.signal, code: error.code};
    }
    finally {
        session.completedUtc = new Date().toISOString();json(path.join(output, 'session.json'), session);
        try {stageArtifacts(output);} catch (error) {
            session.conclusion = 'failed';session.artifactFailure = {message: error.message, code: error.code};
            json(path.join(output, 'session.json'), session);
            const stagedSession = path.join(output, 'artifact/session.json');
            if (fs.existsSync(stagedSession) && !fs.lstatSync(stagedSession).isSymbolicLink()) {
                json(stagedSession, session);fs.rmSync(path.join(output, 'artifact/manifest.json'), {force: true});
            }
            if (!failure) failure = error;else console.error('Artifact staging failed: ' + error.message);
        }
    }
    if (failure) throw failure;
}
module.exports = {options, contains, outputPath, physicalDirectory, stageArtifacts};
if (require.main === module) {
    try {main();} catch (error) {console.error(error.stack);process.exitCode = error.exitCode || 1;}
}
