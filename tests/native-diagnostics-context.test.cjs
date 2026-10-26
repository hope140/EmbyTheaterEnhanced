'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {NativeHelperClient, PROTOCOL_VERSION} = require('../src/electronapp/native-helper/controller');
const {createNativeDiagnostics} = require('../src/electronapp/enhanced/native-diagnostics');
const diagnostics = require('../src/electronapp/enhanced/diagnostics');

function harness(logger) {
    const records = [];
    const observe = createNativeDiagnostics(record => { records.push(record); if (logger) return logger(record); });
    const delivered = [];
    const client = new NativeHelperClient({helperPath: 'unused', libmpvPath: 'unused', parentWindowHandle: '1',
        helperInstanceId: 'current', onDiagnostic: record => observe({...record, helperRun: 1}),
        onEvent: message => delivered.push(message)});
    client.command = () => {};
    function begin(sequence, diagnosticIdentity) {
        return client.beginGeneration(`play-${sequence}-${sequence}`, [], diagnosticIdentity);
    }
    function event(generationId, name, value, helperInstanceId = 'current') {
        client.dispatch({protocolVersion: PROTOCOL_VERSION, type: 'event', scope: 'generation', helperInstanceId,
            generationId, name, value});
    }
    return {records, client, begin, event, delivered};
}

test('anonymous media references distinguish episodes, sources and servers without persistent correlation', () => {
    const h = harness();
    const identity = {serverId: 'server-canary', itemId: 'episode-four-canary', mediaSourceId: 'source-canary'};
    const begin = (sequence, value) => { h.begin(sequence, value); return h.records.at(-1).details; };
    const first = begin(1, identity);
    const same = begin(2, identity);
    const otherSource = begin(3, {...identity, mediaSourceId: 'source-two-canary'});
    const nextEpisode = begin(4, {...identity, itemId: 'episode-five-canary'});
    const otherServer = begin(5, {...identity, serverId: 'server-two-canary'});
    assert.match(first.itemRef, /^anon-[a-f0-9]{32}$/);
    assert.match(first.mediaSourceRef, /^anon-[a-f0-9]{32}$/);
    assert.equal(same.itemRef, first.itemRef);
    assert.equal(same.mediaSourceRef, first.mediaSourceRef);
    assert.equal(otherSource.itemRef, first.itemRef);
    assert.notEqual(otherSource.mediaSourceRef, first.mediaSourceRef);
    assert.notEqual(nextEpisode.itemRef, first.itemRef);
    assert.notEqual(nextEpisode.mediaSourceRef, first.mediaSourceRef);
    assert.notEqual(otherServer.itemRef, first.itemRef);
    assert.notEqual(first.itemRef, first.mediaSourceRef, 'reference domains are separate');
    const fresh = harness();
    fresh.begin(1, identity);
    assert.notEqual(fresh.records.at(-1).details.itemRef, first.itemRef);
    assert.notEqual(fresh.records.at(-1).details.mediaSourceRef, first.mediaSourceRef);
    assert.doesNotMatch(JSON.stringify(h.records), /canary/);
    assert.doesNotMatch(JSON.stringify(h.client.timeline), /canary/);
});

test('native error code and phase remain bound to the episode generation, including stale events', () => {
    const h = harness();
    const fourth = h.begin(1, {serverId: 'S', itemId: 'fourth', mediaSourceId: 'M'});
    h.event(fourth, 'start-file');
    h.event(fourth, 'end-file', {reason: 4, error: -13});
    const failed = h.records.at(-1).details;
    assert.equal(failed.endReason, 4);
    assert.equal(failed.mpvErrorCode, -13);
    assert.equal(failed.playbackPhase, 'loading');
    const fifth = h.begin(2, {serverId: 'S', itemId: 'fifth', mediaSourceId: 'M'});
    h.event(fifth, 'file-loaded');
    assert.equal(h.records.at(-1).details.playbackPhase, 'loading', 'file-loaded alone does not prove playing');
    h.event(fifth, 'core-idle', false);
    h.event(fifth, 'core-idle', true);
    h.event(fourth, 'core-idle', false);
    h.event(fourth, 'end-file', {reason: 0, error: 0});
    const stale = h.records.at(-1).details;
    assert.equal(stale.disposition, 'DROP_STALE_GENERATION');
    assert.equal(stale.requestId, 'play-1-1');
    assert.equal(stale.itemRef, failed.itemRef);
    assert.equal(stale.playbackPhase, 'loading');
    assert.equal(stale.mpvErrorCode, 0);
    h.event(fifth, 'end-file', {reason: 4, error: -12});
    const playingFailure = h.records.at(-1).details;
    assert.equal(playingFailure.requestId, 'play-2-2');
    assert.notEqual(playingFailure.itemRef, failed.itemRef);
    assert.equal(playingFailure.playbackPhase, 'playing');
    assert.equal(playingFailure.mpvErrorCode, -12);
    assert.equal(h.delivered.filter(message => message.name === 'end-file').length, 2);
    h.event(fifth, 'end-file', {reason: 4, error: -13}, 'old-helper');
    assert.equal(h.records.at(-1).details.itemRef, 'UNAVAILABLE');
    assert.equal(h.records.at(-1).details.requestId, 'UNAVAILABLE');
});

test('legacy or malformed optional fields stay unavailable and never become HTTP status or free text', () => {
    const h = harness();
    const generation = h.begin(1);
    assert.equal(h.records.at(-1).details.itemRef, 'UNAVAILABLE');
    for (const error of [undefined, null, '-13', NaN, Infinity, -1.5, -2147483649, 2147483648, {}, 'HTTP 403 private-canary']) {
        h.event(generation, 'end-file', {reason: 4, error});
        assert.equal(h.records.at(-1).details.endReason, 4);
        assert.equal(h.records.at(-1).details.mpvErrorCode, null);
    }
    for (const error of [0, -13, -2147483648, 2147483647]) {
        h.event(generation, 'end-file', {reason: 4, error});
        assert.equal(h.records.at(-1).details.mpvErrorCode, error);
    }
    h.begin(2, {serverId: 'S', itemId: 'I', mediaSourceId: 123});
    assert.match(h.records.at(-1).details.itemRef, /^anon-/);
    assert.equal(h.records.at(-1).details.mediaSourceRef, 'UNAVAILABLE');
    h.begin(3, {serverId: 'S', itemId: 'x'.repeat(513), mediaSourceId: 'M'});
    assert.equal(h.records.at(-1).details.itemRef, 'UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(h.records), /HTTP|private-canary/);
});

test('JSONL and exported report preserve numeric evidence without raw media, secrets or mpv logs', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-anonymous-diagnostics-'));
    try {
        const logger = diagnostics.createLogger(root);
        const h = harness(logger);
        const generation = h.begin(1, {serverId: 'SERVER_PRIVATE_CANARY', itemId: 'ITEM_PRIVATE_CANARY',
            mediaSourceId: 'SOURCE_PRIVATE_CANARY', Path: 'C:\\PATH_PRIVATE_CANARY\\Movie.mkv',
            Name: 'TITLE_PRIVATE_CANARY', token: 'TOKEN_PRIVATE_CANARY'});
        h.event(generation, 'end-file', {reason: 4, error: -13,
            log: 'https://URL_PRIVATE_CANARY/movie?sign=SIGN_PRIVATE_CANARY Cookie: COOKIE_PRIVATE_CANARY'});
        await logger.flush();
        const jsonl = fs.readFileSync(logger.getPaths().file, 'utf8');
        const report = await logger.exportReport({appVersion: 'synthetic'});
        for (const output of [jsonl, report]) {
            assert.doesNotMatch(output, /PRIVATE_CANARY|Movie\.mkv/);
            assert.match(output, /mpvErrorCode/);
            assert.match(output, /-13/);
            assert.match(output, /anon-[a-f0-9]{32}/);
        }
    } finally { fs.rmSync(root, {recursive: true, force: true}); }
});
