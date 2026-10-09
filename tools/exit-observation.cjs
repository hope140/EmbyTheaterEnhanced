'use strict';

// Harness-only, synchronous and bounded. Observations must never own shutdown.
const fs = require('node:fs');
const path = require('node:path');
const stages = new Set([
    'observer-installed', 'result-persist-begin', 'result-persisted',
    'harness-cleanup-complete', 'app-exit-requested', 'app-exit-returned',
    'before-quit-observed', 'will-quit-observed', 'quit-observed', 'process-exit-observed'
]);

function createExitObservation({app, processObject = process, evidence, write, now = Date.now}) {
    const append = write || (row => fs.appendFileSync(path.join(evidence, 'exit-observation.jsonl'), row, 'utf8'));
    const start = now();
    let count = 0;
    function record(stage, exitCode) {
        try {
            if (!stages.has(stage) || count >= 32) return;
            const row = {schemaVersion: 1, role: 'main', sequence: ++count, stage,
                elapsedMs: Math.max(0, now() - start)};
            if (Number.isInteger(exitCode) && exitCode >= 0 && exitCode <= 255) row.exitCode = exitCode;
            append(JSON.stringify(row) + '\n');
        } catch (_) { /* Evidence I/O cannot delay, cancel or replace the original exit. */ }
    }
    try {
        app.on('before-quit', () => record('before-quit-observed'));
        app.on('will-quit', () => record('will-quit-observed'));
        app.on('quit', (_event, code) => record('quit-observed', code));
        processObject.on('exit', code => record('process-exit-observed', code));
        record('observer-installed');
    } catch (_) { /* Optional observer, never an application lifecycle dependency. */ }
    return {record};
}

module.exports = {createExitObservation};
