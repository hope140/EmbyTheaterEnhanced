'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const TESTS = Object.freeze([
    'tests/update-install-cache.test.cjs', 'tests/update-install-handoff.test.cjs',
    'tests/update-install-windows.test.cjs', 'tests/update-install-exit-order.test.cjs',
    'tests/update-install-controlled-wizard.test.cjs', 'tests/manual-app-update.test.cjs',
    'tests/manual-app-update-channels.test.cjs', 'tests/manual-app-update-ui.test.cjs',
    'tests/app-update-preferences.test.cjs', 'tests/release-note-links.test.cjs'
]);
function requireInvocation(argv, platform, environment, actualSha) {
    if (argv.length !== 2 || argv[0] !== '--expected-source' || !/^[0-9a-f]{40}$/.test(argv[1]) || argv[1] !== actualSha) throw Error('exact-source-required');
    if (platform !== 'win32' || environment.GITHUB_ACTIONS !== 'true' || environment.RUNNER_ENVIRONMENT !== 'github-hosted' ||
        environment.GITHUB_REPOSITORY !== 'hope140/EmbyTheaterEnhanced') throw Error('hosted-windows-only');
    return argv[1];
}
function summary(output) {
    const result = {};
    for (const name of ['tests', 'pass', 'fail', 'cancelled', 'skipped']) {
        const matches = [...output.matchAll(new RegExp('^# ' + name + ' (\\d+)$', 'gm'))];
        if (matches.length !== 1) throw Error('complete-test-summary-required');
        result[name] = Number(matches[0][1]);
    }
    return result;
}
function main() {
    const root = path.resolve(__dirname, '..');
    const actual = cp.execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
    const sourceCommit = requireInvocation(process.argv.slice(2), process.platform, process.env, actual);
    const directory = path.join(root, 'test-output', 'managed-update-windows');
    if (fs.existsSync(directory)) throw Error('output-already-exists');
    fs.mkdirSync(directory, {recursive: true});
    const diagnostic = process.env.ETE_DIAGNOSTIC_NO_WIZARD === '1';
    const focus = diagnostic && process.env.ETE_DIAGNOSTIC_FOCUS === '1';
    const selected = focus ? ['tests/update-install-windows.test.cjs'] : diagnostic ? TESTS.filter(name => name !== 'tests/update-install-controlled-wizard.test.cjs') : TESTS;
    const selection = focus ? ['--test-name-pattern=^actual Windows handoff locks Unicode'] : [];
    const result = cp.spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=tap', ...selection, ...selected], {
        cwd: root, encoding: 'utf8', timeout: 300000, maxBuffer: 4 * 1024 * 1024,
        env: {...process.env, ETE_MANAGED_UPDATE_WIZARD_TEST: diagnostic ? '0' : '1'}, windowsHide: true
    });
    const stdout = result.stdout || '', stderr = result.stderr || '';
    fs.writeFileSync(path.join(directory, 'tests.tap'), stdout, {flag: 'wx'});
    fs.writeFileSync(path.join(directory, 'stderr.txt'), stderr, {flag: 'wx'});
    let counts;
    try { counts = summary(stdout.replace(/\r/g, '')); } catch (_) { counts = null; }
    const passed = result.status === 0 && !result.error && counts && counts.tests > 0 && counts.pass === counts.tests && !counts.fail && !counts.cancelled && !counts.skipped;
    const receipt = {schemaVersion: 1, status: passed ? (diagnostic ? 'diagnostic-only' : 'passed') : 'failed', sourceCommit, tests: selected, counts,
        platform: process.platform, node: process.versions.node, runnerOS: process.env.RUNNER_OS,
        controlledLocalAsInvokerProbe: !diagnostic, diagnosticFocus: focus, officialReleaseMetadata: 'synthetic fixture only',
        realApplicationExited: false, realSoftwareInstalled: false, uacValidated: false,
        securityWarningsBypassed: false, productionProfileAccessed: false};
    fs.writeFileSync(path.join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
    process.stdout.write(JSON.stringify(receipt) + '\n');
    // Emit newly generated test failures through the ordinary job log. This
    // does not retrieve or re-route any previous inaccessible artifact.
    if (!passed) {
        const blocks = stdout.replace(/\r/g, '').split(/(?=^# Subtest: )/m).filter(block => /^not ok /m.test(block));
        for (const block of blocks) process.stdout.write(block.slice(0, 10000) + '\n');
        for (const line of stdout.split(/\r?\n/).filter(line => line.includes('ETE_NATIVE_DIAG'))) process.stdout.write(line.slice(0, 6500) + '\n');
        if (stderr) process.stderr.write(stderr.slice(0, 4000));
    }
    if (!passed) process.exitCode = 1;
}
module.exports = {requireInvocation, summary, TESTS};
if (require.main === module) {
    try { main(); } catch (error) { process.stderr.write('Managed update Windows verification stopped: ' + error.message + '\n'); process.exitCode = 1; }
}
