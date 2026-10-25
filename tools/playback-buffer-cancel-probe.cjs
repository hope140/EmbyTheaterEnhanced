'use strict';
// Deterministic actual-helper request barriers; anonymous synthetic source only.
const fallback = require('./playback-buffer-fallback-probe.cjs'), edl = require('./playback-buffer-edl-probe.cjs');
async function run(context) {
    const {client, property, until, delay, server, checkpoint} = context;
    const result = {scope: 'synthetic-held-request-cancel-and-replace', cases: []};
    const phase = (name, kind = null) => {result.phase = name; result.activeCase = kind; checkpoint(result);};
    const stops = () => client.requestHistory.filter(r => r.method === 'stop').length;
    for (const kind of ['cancel', 'replace']) {
        let current = true, lastAttempt;
        phase('starting-held-load', kind); server.hold(row => row.method === 'GET');
        const attempt = fallback.run({...context, isCurrent: () => current, checkpoint(value) {lastAttempt = value;}})
            .then(() => ({unexpectedSuccess: true}), error => ({cancelled: error.message === 'export-fallback-cancelled' || error.state === 'GENERATION_RETIRED' && error.message === (kind === 'cancel' ? 'stop' : 'superseded'), terminal: error.state === 'GENERATION_RETIRED' ? 'GENERATION_RETIRED' : 'PROBE_CANCELLED'}));
        await until(() => !!server.held());
        phase('held', kind); const held = server.held(), oldGeneration = client.currentGenerationId, stopBefore = stops();
        let replacement = null; const eventStart = client.timeline.length;
        phase('retiring', kind); if (kind === 'cancel') {current = false; await client.stop();}
        else {
            replacement = client.beginGeneration('replacement-at-three-seconds', ['time-pos', 'duration', 'core-idle']);
            client.setProperty('pause', true);
            await client.load(['loadfile', server.origin + '/Videos/A/stream.avi', 'replace', '-1', 'start=3']).promise;
        }
        phase('waiting-retired-attempt', kind); const outcome = await attempt;
        phase('retired-attempt-observed', kind);
        if (outcome.cancelled !== true || stops() !== stopBefore + (kind === 'cancel' ? 1 : 0)) throw Error('export-cancel-observation');
        await until(() => held.row.closed); phase('old-response-closed', kind); held.release(); await delay(100);
        if (held.row.bytesScheduled !== 0) throw Error('export-cancel-late-bytes');
        const entry = {kind, cancelled: true, terminal: outcome.terminal, oldRequestClosed: held.row.closed, lateBytes: held.row.bytesScheduled,
            obsoleteAcceptedEvents: null,
            obsoleteStopRequests: stops() - stopBefore - (kind === 'cancel' ? 1 : 0)};
        if (kind === 'replace') {
            await until(async () => client.state.fileLoaded && Math.abs(await property('time-pos') - 3) <= 1 / 24);
            if (client.currentGenerationId !== replacement || await property('pause') !== true) throw Error('export-cancel-observation');
            phase('replacement-ready', kind); const landed = await property('time-pos'); if (!Number.isFinite(landed) || Math.abs(landed - 3) > 1 / 24) throw Error('export-cancel-observation');
            client.setProperty('pause', false); await until(async () => await property('time-pos') >= 3.1);
            client.setProperty('pause', true); const advanced = await property('time-pos');
            if (!Number.isFinite(advanced) || advanced < 3.1 || advanced >= 4 || lastAttempt?.supersededWithoutStoppingReplacement !== true) throw Error('export-cancel-observation');
            Object.assign(entry, {replacementPreserved: true, landedSourceSeconds: landed, advancedSourceSeconds: advanced});
            await client.stop();
        }
        await until(() => edl.physicalClosed(server.snapshot()));
        entry.obsoleteAcceptedEvents = client.timeline.slice(eventStart).filter(e => e.action === 'ACCEPT' && e.generationId === oldGeneration).length;
        if (entry.obsoleteAcceptedEvents !== 0 || entry.obsoleteStopRequests !== 0) throw Error('export-cancel-observation');
        server.clearClosedHold(); result.cases.push(entry); phase('complete-case', kind);
    }
    result.completed = true; phase('complete'); return result;
}
function valid(result) {
    return result?.scope === 'synthetic-held-request-cancel-and-replace' && result.completed === true && result.cases?.length === 2 && result.cases.every((r, i) => r.kind === ['cancel', 'replace'][i] && r.cancelled === true && ['GENERATION_RETIRED', 'PROBE_CANCELLED'].includes(r.terminal) && r.oldRequestClosed === true &&
        r.lateBytes === 0 && r.obsoleteAcceptedEvents === 0 && r.obsoleteStopRequests === 0 && (i === 0 || r.replacementPreserved === true && Number.isFinite(r.landedSourceSeconds) &&
        Math.abs(r.landedSourceSeconds - 3) <= 1 / 24 && Number.isFinite(r.advancedSourceSeconds) && r.advancedSourceSeconds >= 3.1 && r.advancedSourceSeconds < 4));
}
module.exports = {run, valid};
