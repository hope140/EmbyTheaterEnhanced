'use strict';
// Fixed synthetic source only. PCM AO is untimed: not an audible gaplessness test.
const fs = require('node:fs'), path = require('node:path');
const support = require('./playback-range-windows-smoke.cjs'), inspect = require('./playback-buffer-pcm-inspect.cjs');
async function capture({client, property, until, source, range, output}) {
    const end = range.end + .25;
    if (fs.existsSync(output) || !Number.isFinite(range.resume) || range.resume < 0 || !Number.isFinite(end) || end >= 8 || end <= range.resume) throw Error('export-pcm-input');
    client.setProperty('pause', true); if (await property('pause') !== true) throw Error('export-pcm-output');
    await client.load(['loadfile', source, 'replace', '-1', 'start=' + range.resume + ',end=' + end]).promise;
    let audio;
    await until(async () => {
        if (!client.state.fileLoaded) return false;
        try {audio = await property('audio-out-params'); return await property('current-ao') === 'pcm' && audio?.samplerate === 48000 && audio?.['channel-count'] === 1;}
        catch (error) {if (error.message === 'property-unavailable') return false; throw error;}
    });
    client.setProperty('pause', false); if (await property('pause') !== false) throw Error('export-pcm-output');
    await until(async () => {
        if (fs.existsSync(output) && fs.statSync(output).size > inspect.MAX_BYTES) throw Error('export-pcm-limit');
        return await property('eof-reached') === true;
    });
    return {reachedEOF: true, sampleRate: audio.samplerate, channels: audio['channel-count'], output: 'pcm', untimed: true};
}
function finish(directory, sourcePCM, range, observations) {
    const captures = ['baseline.wav', 'seam.wav'].map((file, i) => {
        const full = support.regular(path.join(directory, file)), parsed = inspect.inspectWav(full);
        return {file, bytes: fs.statSync(full).size, sha256: support.hashFile(full), samples: parsed.samples, format: parsed.format, observation: observations[i], pcm: parsed.pcm};
    });
    const comparison = inspect.compareSeam(sourcePCM, captures[0].pcm, captures[1].pcm, range.end);
    if (comparison.ok && [comparison.baseline, comparison.edl].some(c => Math.abs(c.sourceSample / 48000 - range.resume) > 1 / 24)) {
        comparison.ok = false; comparison.assessment = 'capture-start-mismatch';
    }
    return {scope: 'fixed-PCM-AO-synthetic-seam-NOT-device-gaplessness', captures: captures.map(({pcm, ...safe}) => safe), comparison};
}
function valid(result) {
    return result?.scope === 'fixed-PCM-AO-synthetic-seam-NOT-device-gaplessness' && result.captures?.length === 2 &&
        result.captures.every((r, i) => r.file === ['baseline.wav', 'seam.wav'][i] && Number.isSafeInteger(r.bytes) && r.bytes > 0 && r.bytes <= inspect.MAX_BYTES && /^[a-f0-9]{64}$/.test(r.sha256 || '') &&
            Number.isSafeInteger(r.samples) && r.samples > 0 && r.format?.sampleRate === 48000 && r.format.channels === 1 && r.format.bitsPerSample === 16 && r.format.encoding === 's16le' &&
            r.observation?.sampleRate === 48000 && r.observation.channels === 1 && r.observation.reachedEOF === true && r.observation.output === 'pcm' && r.observation.untimed === true) &&
        typeof result.comparison?.ok === 'boolean' && result.comparison.ok === (result.comparison.assessment === 'exact-source-samples-through-seam') && /^(exact-source-samples-through-seam|capture-start-mismatch|(?:unalignable|changed|duplicated-sample|missing-sample|capture-outside-source|insufficient-seam-coverage)-(?:baseline|edl)|changed-sample-at-seam)$/.test(result.comparison?.assessment || '');
}
module.exports = {capture, finish, valid};
