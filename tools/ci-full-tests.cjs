'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const {summarize} = require('./ci-test-timing-summary.cjs');

// Process-isolated suites: all writes and Git mutations belong to unique mkdtemp
// repositories; no fixed ports, live Host, global process cleanup or shared output.
// New/unaudited files always remain serial. See ACTIONS_TEST_PACKAGE.md.
const ISOLATED = Object.freeze([
    'tests/runtime-provenance.test.cjs',
    'tests/build-input-contract.test.cjs',
    'tests/web-overlay-preparation.test.cjs',
    'tests/ci-fixed-git-batch.test.cjs'
]);
function plan(files, mode) {
    if (!['serial', 'isolated'].includes(mode)) throw new Error('Unknown full regression mode');
    if (!files.length || new Set(files).size !== files.length || files.some(f => !/^tests\/[a-z0-9-]+\.test\.cjs$/.test(f))) {
        throw new Error('Invalid full regression discovery');
    }
    if (ISOLATED.some(f => !files.includes(f))) throw new Error('Audited regression file missing');
    const groups = mode === 'serial' ? [{name: 'serial', concurrency: 1, files: [...files]}] : [
        {name: 'isolated', concurrency: 2, files: [...ISOLATED]},
        {name: 'serial', concurrency: 1, files: files.filter(f => !ISOLATED.includes(f))}
    ];
    const assigned = groups.flatMap(g => g.files);
    if (assigned.length !== files.length || new Set(assigned).size !== files.length || files.some(f => !assigned.includes(f))) {
        throw new Error('Regression partition differs from discovery');
    }
    return groups.filter(g => g.files.length);
}
function combine(logs) {
    const totals = {tests: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0, todo: 0, duration_ms: 0};
    let top = 0;
    const output = ['TAP version 13'];
    for (const log of logs) {
        const parsed = summarize(log); // Missing/duplicate summaries fail closed.
        for (const key of Object.keys(totals)) totals[key] += parsed.totals[key];
        for (const line of log.split(/\r?\n/)) {
            if (/^(?:TAP version |1\.\.\d+$|# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) )/.test(line)) continue;
            output.push(line.replace(/^(not ok|ok) \d+(?= -|$)/, (_, status) => status + ' ' + (++top)));
        }
    }
    output.push('1..' + top);
    for (const [key, value] of Object.entries(totals)) output.push('# ' + key + ' ' + value);
    return output.join('\n') + '\n';
}
async function runGroup(root, group, log, write = chunk => process.stdout.write(chunk)) {
    const fd = fs.openSync(log, 'wx');
    try {
        return await new Promise(resolve => {
            const env = {...process.env};
            delete env.NODE_TEST_CONTEXT;
            const child = spawn(process.execPath, ['--test', '--test-reporter=tap', '--test-concurrency=' + group.concurrency, ...group.files], {
                cwd: root, env, stdio: ['ignore', 'pipe', 'inherit']
            });
            let error;
            child.on('error', e => { error = e; });
            child.stdout.on('data', chunk => { fs.writeSync(fd, chunk); write(chunk); });
            child.on('close', code => resolve({code: error || code === null ? 1 : code}));
        });
    } finally { fs.closeSync(fd); }
}
async function main(root, mode, output) {
    const files = fs.readdirSync(path.join(root, 'tests')).filter(f => f.endsWith('.test.cjs')).sort().map(f => 'tests/' + f);
    const groups = plan(files, mode);
    const identity = files.map(file => ({file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')}));
    const receipt = {schemaVersion: 1, mode, files: files.length, selectionSha256: crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex'), groups};
    if (fs.existsSync(output)) throw new Error('Preserve existing regression output');
    fs.writeFileSync(output + '.plan.json', JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
    console.log('CI_TEST_PLAN ' + JSON.stringify(receipt));
    const logs = [];
    let status = 0;
    for (const group of groups) {
        const log = output + '.' + group.name + '.tap';
        const result = await runGroup(root, group, log);
        status ||= result.code;
        logs.push(fs.readFileSync(log, 'utf8'));
    }
    const merged = combine(logs);
    fs.writeFileSync(output, merged, {flag: 'wx'});
    const totals = summarize(merged).totals;
    if (totals.fail || totals.cancelled || !totals.tests) status = 1;
    console.log('CI_FULL_TEST_RESULT ' + JSON.stringify({mode, ...totals, status}));
    return status;
}
module.exports = {ISOLATED, plan, combine, runGroup, main};
if (require.main === module) main(path.resolve(__dirname, '..'), process.argv[2], path.resolve(process.argv[3] || ''))
    .then(code => { process.exitCode = code; }).catch(error => { console.error('Full regression failed: ' + error.message); process.exitCode = 1; });
