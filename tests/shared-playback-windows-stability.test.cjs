'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tool = require('../tools/shared-playback-cache/windows-stability.cjs');

function ownedRoot(t) {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-window-stability-')));
    t.after(() => fs.rmSync(root, {recursive: true, force: true})); return root;
}
function tapPass(index = 1, overrides = {}) {
    const data = {type: 'shared-byte-alameda-natural-result', scenario: 'trusted-cd2-shared', syntheticHelper: true, nativeDll: false,
        exactSyntheticCurrentBytes: 314572800, preloadBytes: 40, overlapDiskBytes: 48, freshActualBOriginRequests: 1,
        persistedCurrentBytes: 40, nextBytesAfterReopen: 0, selectionMs: 14, probeMs: 3, storeOpenMs: 7, ...overrides};
    return `TAP version 13\nok ${index} - real Alameda automatic next-prefix: trusted-cd2-shared\n# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 25\n# ${JSON.stringify(data)}\n`;
}
function writeTap(output, value) {fs.writeFileSync(output, value, {flag: 'wx'});}

test('CLI accepts only a fresh absolute output and fixed repeat choices', () => {
    const out = path.join(os.tmpdir(), 'fresh-stability-result');
    assert.deepEqual(tool.parseArgs(['--out=' + out]), {out, repeats: 4});
    assert.deepEqual(tool.parseArgs(['--repeats=8', '--out=' + out]), {out, repeats: 8});
    for (const args of [[], ['--out=relative'], ['--out=' + out, '--repeats=3'], ['--out=' + out, '--out=' + out], ['--out=' + out, '--unknown=x']]) {
        assert.throws(() => tool.parseArgs(args));
    }
});

test('repeated runner makes fresh bounded targeted child calls and aggregates metrics without path leakage', async t => {
    const root = ownedRoot(t), out = path.join(root, 'report'), calls = [], emitted = [];
    const runFile = async options => {
        calls.push(options); writeTap(options.output, tapPass(calls.length, {selectionMs: 10 + calls.length, probeMs: 2, storeOpenMs: 5}));
        return {file: options.file, code: 0, signal: null, timedOut: false, overflow: false, streamsClosed: true,
            elapsedMs: 90, cleanupAssessment: 'TEST_PROCESS_EXITED', status: 'PASS'};
    };
    const report = await tool.runWindowsStability({out, repeats: 2, repo: root, runFile, emit: value => emitted.push(value)});
    assert.equal(report.status, 'PASS'); assert.equal(report.completedRepeats, 2);
    assert.deepEqual(report.mediansMs, {selectionMs: 11.5, probeMs: 2, storeOpenMs: 5});
    assert.equal(calls.length, 2);
    for (const [i, call] of calls.entries()) {
        assert.equal(call.file, tool.TEST_FILE); assert.equal(call.namePattern, tool.NAME_PATTERN);
        assert.equal(call.timeoutMs, tool.PER_TRIAL_MS); assert.equal(call.echo, true);
        assert.equal(path.basename(call.output), `trial-0${i + 1}.tap`);
    }
    assert.notEqual(calls[0].output, calls[1].output);
    const serialized = JSON.stringify(report);
    assert.equal(serialized.includes(root), false); assert.equal(serialized.includes('127.0.0.1'), false);
    assert.equal(emitted.filter(row => row.startsWith('SHARED_CACHE_STABILITY_TRIAL ')).length, 2);
    assert(fs.existsSync(path.join(out, 'stability.json')));
});

test('a failed first sample is preserved and all fixed samples still run', async t => {
    const root = ownedRoot(t), out = path.join(root, 'report'), calls = [];
    const runFile = async options => {
        calls.push(options);
        if (calls.length === 1) {
            writeTap(options.output, 'TAP version 13\nnot ok 1 - real Alameda automatic next-prefix: trusted-cd2-shared\n# tests 1\n# pass 0\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0\n');
            return {code: 1, timedOut: false, overflow: false, streamsClosed: true, elapsedMs: 80, status: 'FAIL'};
        }
        writeTap(options.output, tapPass());
        return {code: 0, timedOut: false, overflow: false, streamsClosed: true, elapsedMs: 80, status: 'PASS'};
    };
    const report = await tool.runWindowsStability({out, repeats: 2, repo: root, runFile, emit() {}});
    assert.equal(calls.length, 2); assert.equal(report.status, 'FAIL');
    assert.deepEqual(report.trials.map(row => row.status), ['FAIL', 'PASS']);
    assert.match(fs.readFileSync(calls[0].output, 'utf8'), /not ok 1/);
    assert.match(fs.readFileSync(calls[1].output, 'utf8'), /shared-byte-alameda-natural-result/);
});

test('missing, malformed, unmatched and contradictory evidence remains a failure while later trials run', async t => {
    const root = ownedRoot(t);
    const badCases = [
        {name: 'missing metric', tap: tapPass(1, {storeOpenMs: undefined})},
        {name: 'wrong fixture byte count', tap: tapPass(1, {overlapDiskBytes: 49})},
        {name: 'extra unmatched pass', tap: tapPass(1).replace('ok 1 - real Alameda automatic next-prefix: trusted-cd2-shared', 'ok 1 - real Alameda automatic next-prefix: trusted-cd2-shared\nok 2 - unrelated sample\n').replace('# tests 1\n# pass 1', '# tests 2\n# pass 2')},
        {name: 'target absent', tap: tapPass(1).replace('real Alameda automatic next-prefix: trusted-cd2-shared', 'unrelated sample')},
        {name: 'nonzero exit contradicts runner pass', tap: tapPass(1), result: {code: 1}},
        {name: 'timeout contradicts runner pass', tap: tapPass(1), result: {timedOut: true}},
        {name: 'overflow contradicts runner pass', tap: tapPass(1), result: {overflow: true}},
        {name: 'open process streams contradict runner pass', tap: tapPass(1), result: {streamsClosed: false}}
    ];
    for (const [caseIndex, bad] of badCases.entries()) {
        const out = path.join(root, 'case-' + caseIndex), calls = [];
        const runFile = async options => {
            calls.push(options);
            writeTap(options.output, calls.length === 1 ? bad.tap : tapPass());
            return {code: 0, timedOut: false, overflow: false, streamsClosed: true, elapsedMs: 5, status: 'PASS', ...calls.length === 1 ? bad.result : {}};
        };
        const report = await tool.runWindowsStability({out, repeats: 2, repo: root, runFile, emit() {}});
        assert.equal(calls.length, 2, bad.name + ': every predetermined trial should still run');
        assert.deepEqual(report.trials.map(row => row.status), ['FAIL', 'PASS'], bad.name);
        assert.equal(report.status, 'FAIL', bad.name);
    }
});
