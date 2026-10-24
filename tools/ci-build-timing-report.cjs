'use strict';

const fs = require('node:fs');

// Offline analysis of read-only Actions API records and decoded job logs.
// A runner cannot observe the queue that preceded its allocation.
function analyze(run, job, log) {
    if (run.id !== job.run_id || run.head_sha !== job.head_sha) throw new Error('Run/job source identity mismatch.');
    const created = Date.parse(run.created_at), started = Date.parse(job.started_at), completed = Date.parse(job.completed_at);
    if (![created, started, completed].every(Number.isFinite) || created > started || started > completed) {
        throw new Error('Invalid run/job timing boundaries.');
    }
    const pending = new Map(), phases = [], seen = new Set();
    for (const line of log.split(/\r?\n/)) {
        const marker = /(?:^|\s)CI_PHASE (\{.*\})$/.exec(line);
        if (!marker) continue;
        const row = JSON.parse(marker[1]);
        if (row.schemaVersion !== 1 || !/^[a-f0-9]{32}$/.test(row.id) ||
            !/^[a-z][a-z0-9.-]{0,79}$/.test(row.phase) || !Number.isFinite(Date.parse(row.utc))) {
            throw new Error('Invalid CI phase record.');
        }
        if (row.sourceCommit !== undefined && row.sourceCommit !== run.head_sha) throw new Error('Phase source mismatch.');
        if (row.runId !== undefined && row.runId !== String(run.id)) throw new Error('Phase run mismatch.');
        if (row.event === 'start') {
            if (seen.has(row.id)) throw new Error('Duplicate phase identity.');
            seen.add(row.id);pending.set(row.id, row);
        } else if (row.event === 'end') {
            const begin = pending.get(row.id);
            if (!begin || begin.phase !== row.phase || !Number.isFinite(row.elapsedMs) || row.elapsedMs < 0 ||
                !['passed', 'failed'].includes(row.status)) throw new Error('Invalid phase completion.');
            phases.push({id: row.id, phase: row.phase, startUtc: begin.utc, endUtc: row.utc,
                elapsedMs: row.elapsedMs, status: row.status});
            pending.delete(row.id);
        } else throw new Error('Unknown phase event.');
    }
    return {schemaVersion: 1, runId: run.id, jobId: job.id, sourceCommit: run.head_sha,
        waitingMs: started - created, executionMs: completed - started,
        waitingScope: 'run creation to job start; includes concurrency, scheduling and provisioning',
        phases, incompletePhases: [...pending.values()].map(row => ({id: row.id, phase: row.phase, startUtc: row.utc}))};
}

module.exports = {analyze};
if (require.main === module) {
    const [run, job, log] = process.argv.slice(2);
    console.log(JSON.stringify(analyze(JSON.parse(fs.readFileSync(run)), JSON.parse(fs.readFileSync(job)),
        fs.readFileSync(log, 'utf8')), null, 2));
}
