'use strict';

const fs = require('node:fs');

// Read Node's internal TAP durations, not gaps between buffered log lines.
// This is a diagnostic summary; the original Node exit code remains the gate.
function summarize(text) {
    const totals = new Map();
    const cases = [];
    let current;
    for (const line of text.split(/\r?\n/)) {
        const title = /^# Subtest: (.+)$/.exec(line);
        if (title) current = title[1];
        const duration = /^  duration_ms: (\d+(?:\.\d+)?)$/.exec(line);
        if (duration && current) {
            cases.push({name: current, durationMs: Number(duration[1])});
            current = undefined;
        }
        const total = /^# (tests|pass|fail|cancelled|skipped|todo|duration_ms) (\d+(?:\.\d+)?)$/.exec(line);
        if (total) {
            if (totals.has(total[1])) throw new Error('Duplicate TAP summary field: ' + total[1]);
            totals.set(total[1], Number(total[2]));
        }
    }
    for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo', 'duration_ms']) {
        if (!totals.has(key)) throw new Error('Incomplete TAP timing summary: ' + key);
    }
    return {schemaVersion: 1, totals: Object.fromEntries(totals),
        topLevelCases: cases.length, hotspots: cases.sort((a, b) => b.durationMs - a.durationMs).slice(0, 10)};
}

module.exports = {summarize};
if (require.main === module) {
    try {
        const result = summarize(fs.readFileSync(process.argv[2], 'utf8'));
        console.log('CI_TEST_TIMING ' + JSON.stringify(result));
    } catch {
        console.error('CI_TEST_TIMING unavailable');
        process.exitCode = 1;
    }
}
