'use strict';
// Explicit derived trial only. The original candidate's manifest is never rewritten.
const fs = require(process.versions.electron ? 'original-fs' : 'node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const LOCK = Object.freeze(require('./playback-range-loader-lock.json'));
const BASE_TOOLS = 'c9cd9bacf81445c9c10befd121951b1c63c86faa';
const support = () => require('./playback-range-windows-smoke.cjs');
const inventory = root => require('./verify-installer-runtime.cjs').inventory(root);
function git(root, args) {return execFileSync('git', args, {cwd: root, encoding: 'utf8', windowsHide: true}).trim();}
function physical(root) {if (!path.isAbsolute(root) || fs.realpathSync(root) !== root || !fs.lstatSync(root).isDirectory()) throw Error('trial-physical-root-required');}
function ownedControls(repo, commit) {
    physical(repo);
    if (!/^[a-f0-9]{40}$/.test(commit || '') || git(repo, ['rev-parse', 'HEAD']) !== commit || git(repo, ['status', '--porcelain', '--untracked-files=no'])) throw Error('trial-controls-drift');
}
function baseVerifier(root) {
    physical(root);
    if (git(root, ['rev-parse', 'HEAD']) !== BASE_TOOLS || git(root, ['status', '--porcelain', '--untracked-files=no'])) throw Error('trial-base-tools-drift');
    return require(path.join(root, 'tools/playback-range-windows-smoke.cjs'));
}
function additionFor(base, lock = LOCK) {
    const source = base.get(lock.sourcePath);
    if (!source || source.sha256 !== lock.sha256 || source.size <= 0 || base.has(lock.targetPath)) throw Error('trial-loader-source-or-target-invalid');
    return {sourcePath: lock.sourcePath, targetPath: lock.targetPath, sha256: lock.sha256, size: source.size, relation: lock.relation};
}
function compareInventories(base, derived, addition) {
    if (base.has(addition.targetPath) || derived.size !== base.size + 1) throw Error('trial-derived-file-set');
    for (const [name, row] of base) {
        const actual = derived.get(name);
        if (!actual || actual.sha256 !== row.sha256 || actual.size !== row.size) throw Error('trial-base-member-changed');
    }
    const source = base.get(addition.sourcePath), target = derived.get(addition.targetPath);
    if (!source || source.sha256 !== addition.sha256 || source.size !== addition.size || !target || target.sha256 !== addition.sha256 || target.size !== addition.size || addition.relation !== LOCK.relation) throw Error('trial-loader-copy-mismatch');
}
function verifyRuntime(repo, runtime, zip, descriptor) {
    if (!descriptor || Object.keys(descriptor).sort().join(',') !== 'baseToolsRoot,baselineRuntime,controlsCommit,sidecar') throw Error('trial-descriptor-invalid');
    ownedControls(repo, descriptor.controlsCommit); physical(runtime); physical(descriptor.baselineRuntime);
    if (runtime === descriptor.baselineRuntime || fs.realpathSync(descriptor.sidecar) !== descriptor.sidecar || path.dirname(descriptor.sidecar) !== path.dirname(runtime)) throw Error('trial-sidecar-root-invalid');
    const baseline = baseVerifier(descriptor.baseToolsRoot).verifyRuntime(descriptor.baseToolsRoot, descriptor.baselineRuntime, zip);
    const electron = JSON.parse(execFileSync('git', ['show', support().CANDIDATE.commit + ':vendor/electron-runtime-manifest.json'], {cwd: descriptor.baseToolsRoot, encoding: 'utf8', windowsHide: true}));
    if (electron.version !== LOCK.version || electron.archive.sha256 !== LOCK.archiveSha256) throw Error('trial-loader-archive-lock');
    const base = inventory(descriptor.baselineRuntime), actual = inventory(runtime), addition = additionFor(base);
    compareInventories(base, actual, addition);
    const expected = {schema: 1, kind: 'derived-loader-trial-NOT-original-package', baseIdentity: baseline, controlsCommit: descriptor.controlsCommit,
        lock: LOCK, addition, baseProof: support().physicalPayloadProof(base), derivedProof: support().physicalPayloadProof(actual)};
    const sidecar = JSON.parse(fs.readFileSync(descriptor.sidecar));
    assert.deepEqual(sidecar, expected, 'strict base/lock/copy/complete-derived proof');
    return {...baseline, runtimeKind: expected.kind, baseIdentity: baseline, derivation: {controlsCommit: descriptor.controlsCommit, lock: LOCK, addition}, physicalPayload: expected.derivedProof};
}
function derive(repo, baselineRuntime, baseToolsRoot, zip, root, controlsCommit) {
    ownedControls(repo, controlsCommit);
    const baseIdentity = baseVerifier(baseToolsRoot).verifyRuntime(baseToolsRoot, baselineRuntime, zip), base = inventory(baselineRuntime), addition = additionFor(base);
    if (fs.existsSync(root) || !path.isAbsolute(root)) throw Error('trial-fresh-root-required');
    fs.mkdirSync(root); root = fs.realpathSync(root); const runtime = path.join(root, 'runtime'), sidecar = path.join(root, 'loader-derivation.json');
    fs.cpSync(baselineRuntime, runtime, {recursive: true, errorOnExist: true, force: false, dereference: false});
    fs.copyFileSync(path.join(baselineRuntime, addition.sourcePath), path.join(runtime, addition.targetPath), fs.constants.COPYFILE_EXCL);
    const actual = inventory(runtime); compareInventories(base, actual, addition);
    support().writeNew(sidecar, {schema: 1, kind: 'derived-loader-trial-NOT-original-package', baseIdentity, controlsCommit, lock: LOCK, addition,
        baseProof: support().physicalPayloadProof(base), derivedProof: support().physicalPayloadProof(actual)});
    const descriptor = {baseToolsRoot, baselineRuntime, controlsCommit, sidecar};
    const identity = verifyRuntime(repo, runtime, zip, descriptor); return {runtime, descriptor, identity};
}
async function startup(file) {
    const plan = support().readPlan(file); const expected = support().verifyPlanRuntime(plan, path.resolve(__dirname, '..'));
    assert.deepEqual(plan.identity, expected);
    try {const exit = await support().executePhase(plan, file, 'startup'); return {ready: true, exit, receipt: JSON.parse(fs.readFileSync(path.join(plan.out, 'startup.json')))};}
    catch (error) {
        const receiptFile = path.join(plan.out, 'startup.json');
        if (!error.phaseExit || error.phaseExit.code !== 1 || error.phaseExit.timedOut || !fs.existsSync(receiptFile)) throw error;
        const receipt = JSON.parse(fs.readFileSync(receiptFile));
        if (receipt.pid !== error.phaseExit.pid || receipt.helpers?.some(helper => !helper.exited || !helper.diagnostics?.streamsClosed)) throw Error('trial-startup-exit-unconfirmed');
        return {ready: false, exit: error.phaseExit, receipt};
    }
}
function assertComparisonData(baseline, derived, identity) {
    const diagnostics = require('./playback-range-helper-diagnostics.cjs');
    if (!diagnostics.isLoaderFailure(baseline.receipt) || baseline.ready !== false || baseline.exit?.code !== 1 || baseline.exit.timedOut || baseline.exit.streamsClosed !== true || baseline.exit.pid !== baseline.receipt.pid ||
        derived.ready !== true || derived.exit?.code !== 0 || derived.exit.timedOut || derived.exit.streamsClosed !== true || derived.exit.pid !== derived.receipt?.pid || derived.receipt.status !== 'passed' || derived.receipt.phase !== 'startup' ||
        derived.receipt.checks?.helperReady !== true || derived.receipt.checks?.ownedHelperExit !== true || derived.receipt.helpers?.length !== 1 ||
        derived.receipt.helpers.some(h => !h.exited || !h.handshake || !diagnostics.normalExit(h.diagnostics))) throw Error('trial-A-B-startup-proof-required');
    assert.deepEqual(baseline.receipt.identity, identity.baseIdentity); assert.deepEqual(derived.receipt.identity, identity);
}
function assertComparison(plan) {
    const root = path.dirname(path.dirname(plan.loaderTrial.sidecar));
    assertComparisonData(JSON.parse(fs.readFileSync(path.join(root, 'baseline-result.json'))), JSON.parse(fs.readFileSync(path.join(root, 'derived-result.json'))), plan.identity);
}
async function run(controlPlanFile) {
    if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('trial-Windows-required');
    const ci = require('./ci-playback-range-smoke.cjs'), plan = ci.readPlan(controlPlanFile), repo = path.resolve(__dirname, '..');
    if (plan.mode !== 'loader-trial') throw Error('trial-explicit-mode-required');
    const inputs = ci.expandedInputs(plan), root = path.join(plan.root, 'loader-trial');
    if (fs.existsSync(root)) throw Error('trial-fresh-root-required'); fs.mkdirSync(root);
    const baselinePlan = support().prepare({repo, runtime: inputs.runtime, zip: plan.paths.artifact, out: path.join(root, 'baseline')});
    const baseline = await startup(path.join(baselinePlan.out, 'plan.json'));
    support().writeNew(path.join(root, 'baseline-result.json'), baseline);
    if (!require('./playback-range-helper-diagnostics.cjs').isLoaderFailure(baseline.receipt)) {
        support().writeNew(path.join(root, 'result.json'), {status: 'not-established', kind: 'derived-loader-trial-NOT-original-package', reason: baseline.ready ? 'baseline-startup-failure-not-reproduced' : 'baseline-failure-not-DLL-load', originalPackageModified: false, derivedCreated: false});
        throw Error('trial-baseline-DLL-load-failure-not-established');
    }
    const derived = derive(repo, inputs.runtime, plan.toolsRoot, plan.paths.artifact, path.join(root, 'derived-image'), plan.workflowCommit);
    const derivedPlan = support().prepare({repo, runtime: derived.runtime, zip: plan.paths.artifact, out: path.join(root, 'derived'), loaderTrial: derived.descriptor});
    const file = path.join(derivedPlan.out, 'plan.json'), after = await startup(file);
    support().writeNew(path.join(root, 'derived-result.json'), after);
    let accepted = false;
    try {assertComparisonData(baseline, after, derived.identity); accepted = true;} finally {
    support().writeNew(path.join(root, 'comparison.json'), {schema: 1, baselineReady: baseline.ready, derivedReady: after.ready, accepted, addition: derived.identity.derivation.addition,
        baseIdentity: derived.identity.baseIdentity, derivedIdentity: derived.identity, claim: accepted ? 'DLL-load failure resolved in this controlled one-file comparison' : 'loader hypothesis not established'});
    }
    if (!after.ready) throw Error('trial-derived-helper-not-ready');
    assertComparisonData(baseline, after, derived.identity);
    // This plan's actual startup proof replaces only the no-helper entry preflight.
    // Cache phases keep the same source, Range/decode/lifecycle assertions.
    for (const phase of ['populate', 'reopen']) await support().executePhase(derivedPlan, file, phase);
    verifyRuntime(repo, derived.runtime, plan.paths.artifact, derived.descriptor);
    support().writeNew(path.join(root, 'result.json'), {status: 'passed', kind: 'derived-loader-trial-NOT-original-package', controlsCommit: plan.workflowCommit,
        baseSourceCommit: support().CANDIDATE.commit, comparison: 'original-dll-load-failed-derived-ready', cachePhases: ['populate', 'reopen'], originalPackageModified: false});
}
if (require.main === module) {
    const args = support().argumentsOf(process.argv.slice(2), ['--control-plan']);
    run(args['--control-plan']).catch(error => {console.error(/^trial-[A-Za-z-]+$/.test(error.message) ? error.message : 'controlled-loader-trial-failed'); process.exitCode = 1;});
}
module.exports = {LOCK, additionFor, compareInventories, verifyRuntime, derive, startup, assertComparisonData, assertComparison, run};
