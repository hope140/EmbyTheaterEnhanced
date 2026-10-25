'use strict';
// Anonymous owned synthetic fixture only. Not a production/auth/session adapter.
const fs = require('node:fs'), path = require('node:path');
const support = require('./playback-range-windows-smoke.cjs');
const edl = require('./playback-buffer-edl-probe.cjs');
const SCOPE = 'synthetic-retention-preflight-fallback-NOT-product-authorization';
function matches(file, expected, max) {
    if (!expected || !Number.isSafeInteger(expected.bytes) || expected.bytes <= 0 || expected.bytes > max || !/^[a-f0-9]{64}$/.test(expected.sha256 || '')) return false;
    try {support.regular(file); return fs.statSync(file).size === expected.bytes && support.hashFile(file) === expected.sha256;} catch (_) {return false;}
}
function select({directory, source, fixture, position, range, clip, descriptor}) {
    const probe = require('./playback-buffer-export-probe.cjs'); probe.physical(directory);
    if (fs.readFileSync(support.regular(path.join(directory, 'owner')), 'utf8') !== 'ETE isolated finite buffer export v1\n') throw Error('export-owner-drift');
    const url = new URL(source);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/Videos/A/stream.avi' ||
        fixture?.file !== 'A.avi' || fixture.etag !== '"' + fixture.sha256 + '"' || !matches(path.join(directory, 'A.avi'), {bytes: fixture.size, sha256: fixture.sha256}, probe.MAX_FILE) ||
        !Number.isFinite(position) || position < 0 || position >= 8) throw Error('export-fallback-input');
    // Local fixture proof is not real media-version validation or renewed authorization.
    let reason = 'retained';
    if (!range || range.total !== 8 || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start <= 0 || range.end <= range.start || range.end >= 8 || position < range.start || position >= range.end) reason = 'outside-retained-range';
    else if (!matches(path.join(directory, 'excerpt.avi'), clip, probe.MAX_FILE)) reason = 'excerpt-unavailable-or-changed';
    else if (!matches(path.join(directory, 'retained.edl'), descriptor, 16384)) reason = 'descriptor-unavailable-or-changed';
    return {scope: SCOPE, mode: reason === 'retained' ? 'retained' : 'original', reason, position,
        command: ['loadfile', reason === 'retained' ? path.join(directory, 'retained.edl') : source, 'replace', '-1', 'start=' + position]};
}
async function run({client, property, until, server, directory, fixture, previous, clip, checkpoint, isCurrent = () => true}) {
    let generation = null;
    const cancelled = () => {if (!isCurrent() || generation !== null && client.currentGenerationId !== generation) throw Error('export-fallback-cancelled');};
    const query = async name => {cancelled(); const value = await property(name); cancelled(); return value;};
    cancelled();
    // Deliberately stale metadata, not damage to the canonical excerpt needed by
    // existing immutability/retirement checks. Missing files are covered offline.
    const stale = {...clip, sha256: (clip.sha256[0] === '0' ? '1' : '0') + clip.sha256.slice(1)};
    const input = {directory, source: server.origin + '/Videos/A/stream.avi', fixture, position: previous.range.resume,
        range: previous.range, clip: stale, descriptor: previous.descriptor};
    const selected = select(input);
    if (selected.mode !== 'original' || selected.reason !== 'excerpt-unavailable-or-changed') throw Error('export-fallback-observation');
    const result = {scope: SCOPE, reason: selected.reason, targetSourceSeconds: selected.position, normalEmbySession: 'NOT_ASSESSED'};
    const firstRequest = server.rows.length;
    checkpoint(result); cancelled();
    generation = client.beginGeneration('fallback-original', ['core-idle', 'time-pos', 'duration']);
    const eventStart = client.timeline.length;
    try {
        cancelled(); client.setProperty('pause', true); if (await query('pause') !== true) throw Error('export-fallback-observation');
        cancelled(); const revalidated = select(input);
        if (JSON.stringify(revalidated.command) !== JSON.stringify(selected.command) || revalidated.reason !== selected.reason) throw Error('export-fallback-input');
        cancelled(); await client.load(selected.command).promise; cancelled();
        await until(async () => {cancelled(); return client.state.fileLoaded && Math.abs(await query('time-pos') - selected.position) <= 1 / 24;});
        result.landedSourceSeconds = await query('time-pos'); result.duration = await query('duration');
        if (!Number.isFinite(result.landedSourceSeconds) || Math.abs(result.landedSourceSeconds - selected.position) > 1 / 24 || !Number.isFinite(result.duration) || Math.abs(result.duration - 8) > 1 / 24 || await query('path') !== selected.command[1]) throw Error('export-fallback-observation');
        cancelled(); client.setProperty('pause', false);
        await until(async () => {cancelled(); return await query('time-pos') >= selected.position + .1;});
        cancelled(); client.setProperty('pause', true); if (await query('pause') !== true) throw Error('export-fallback-observation');
        result.advancedSourceSeconds = await query('time-pos');
        const video = await query('video-out-params'), audio = await query('audio-out-params'), tracks = await query('track-list');
        if (!video || video.w !== 320 || video.h !== 180 || !audio || audio.samplerate !== 48000 || audio['channel-count'] !== 1 || await query('current-ao') !== 'null' ||
            !Array.isArray(tracks) || tracks.filter(t => t.type === 'audio' && t.selected).length !== 1 || tracks.filter(t => t.type === 'video' && t.selected).length !== 1) throw Error('export-fallback-observation');
        result.startFiles = client.timeline.slice(eventStart).filter(e => e.action === 'ACCEPT' && e.name === 'start-file').length;
        result.sourceRequests = server.rows.length - firstRequest;
        if (result.startFiles !== 1 || result.sourceRequests <= 0 || !Number.isFinite(result.advancedSourceSeconds) || result.advancedSourceSeconds < selected.position + .1 || result.advancedSourceSeconds >= 8 || result.advancedSourceSeconds <= result.landedSourceSeconds) throw Error('export-fallback-observation');
        cancelled(); result.decodeAndTimelinePassed = true;
    } finally {
        try {
            if (client.currentGenerationId === generation) {
                await client.stop();
                const retired = () => {
                    if (client.currentGenerationId !== null) {result.supersededWithoutStoppingReplacement = true; throw Error('export-fallback-cancelled');}
                    return edl.physicalClosed(server.snapshot(firstRequest));
                };
                // stop() retires our generation synchronously. A new generation
                // must never be mistaken for our still-closing source requests.
                retired(); await until(retired);
                if (!retired()) throw Error('export-fallback-observation');
                result.stop = server.snapshot(firstRequest);
            } else result.supersededWithoutStoppingReplacement = true;
        } finally {checkpoint(result);}
    }
    return result;
}
module.exports = {SCOPE, matches, select, run};
