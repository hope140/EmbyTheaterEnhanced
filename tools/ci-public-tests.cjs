'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const MATERIAL_REQUIRED = Object.freeze([
    'tests/device-identity.test.cjs',
    'tests/external-player-process-chain.test.cjs',
    'tests/playback-route-stats.test.cjs',
    'tests/playbackmanager-request-session.test.cjs',
    'tests/runtime-provenance.test.cjs',
    'tests/web-overlay-preparation.test.cjs'
]);

function discoverTests() {
    return fs.readdirSync(path.join(root, 'tests'))
        .filter(name => name.endsWith('.test.cjs'))
        .sort()
        .map(name => 'tests/' + name);
}

function selectTests(allTests) {
    const excluded = new Set(MATERIAL_REQUIRED);
    return allTests.filter(testPath => !excluded.has(testPath));
}

function main() {
    const files = discoverTests();
    const selected = selectTests(files);
    const missingExclusions = MATERIAL_REQUIRED.filter(testPath => !files.includes(testPath));
    if (missingExclusions.length) throw new Error('Required material-test exclusions were not discovered: ' + missingExclusions.join(', '));

    process.stdout.write('Discovered ' + files.length + ' tests/*.test.cjs files; excluding exactly ' + MATERIAL_REQUIRED.length + ' material-required files.\n');
    for (const excludedPath of MATERIAL_REQUIRED) process.stdout.write('Excluded material-required: ' + excludedPath + '\n');
    process.stdout.write('Running ' + selected.length + ' discovered public tests.\n');

    const result = childProcess.spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...selected], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    if (result.error) throw result.error;
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exitCode = result.status === null ? 1 : result.status;
}

module.exports = {MATERIAL_REQUIRED, discoverTests, selectTests};

if (require.main === module) {
    try { main(); }
    catch (error) {
        process.stderr.write('Public test runner failed: ' + error.message + '\n');
        process.exitCode = 1;
    }
}
