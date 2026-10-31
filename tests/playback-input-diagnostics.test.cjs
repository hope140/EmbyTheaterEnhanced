'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const {patchInputApi} = require('../tools/patch-playback-input-diagnostics.cjs');
const {WEB_OVERLAY_CONTRACT, sha256} = require('../tools/prepare-web-overlays.cjs');

const root = path.resolve(__dirname, '..');
const contract = WEB_OVERLAY_CONTRACT.find(entry => entry.id === 'playback-input-diagnostics');
const original = fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/modules/common/input/api.js'), 'utf8');
const transformed = patchInputApi(original);

function harness(source) {
    const calls = [], listeners = [];
    const api = {serverInfo: () => ({Id: 'synthetic-server'}), getCurrentUserId: () => 'synthetic-user'};
    const events = {
        on(target, name, listener) {listeners.push({target, name, listener});},
        off() {},
        trigger(_target, name, args) {calls.push({method: 'event:' + name, args});}
    };
    const manager = new Proxy({}, {get(_target, name) {
        return (...args) => {calls.push({method: String(name), args});};
    }});
    let factory;
    vm.runInNewContext(source, {define(_dependencies, callback) {factory = callback;}, console: {log() {}}});
    factory({}, {default: events}, {default: {getApiClients: () => [api]}},
        {default: {htmlEncode: value => value}}, {default: manager},
        {appHost: {supports: () => false}}, {default: {showItem() {}}},
        {default: {notify: () => calls.push({method: 'notify'}), trigger: name => calls.push({method: 'input', name})}},
        {default: {sendText: text => calls.push({method: 'text', text})}});
    return {
        calls,
        send(message) {
            for (const row of listeners.filter(row => row.target === api && row.name === 'message')) {
                row.listener.call(api, {}, message);
            }
        }
    };
}

test('remote Playstate Seek preserves the exact received target and supplies only its fixed diagnostic origin', () => {
    for (const ticks of [0, 123456789, -10000, 900000000000, '450000000', undefined]) {
        const fixture = harness(transformed);
        const message = {MessageType: 'Playstate', Data: {Command: 'Seek', SeekPositionTicks: ticks,
            ItemId: 'private-item-canary', Token: 'private-token-canary', Url: 'https://private-canary.invalid/media'}};
        fixture.send(message);
        assert.equal(fixture.calls.length, 1);
        const call = fixture.calls[0];
        assert.equal(call.method, 'seek');
        assert.equal(call.args.length, 3);
        assert.equal(call.args[0], ticks, 'the input layer must retain PlaybackManager target handling');
        assert.equal(call.args[1], null, 'the existing current-player selection stays with PlaybackManager');
        assert.deepEqual(JSON.parse(JSON.stringify(call.args[2])), {origin: 'remote-playstate'});
        assert.doesNotMatch(JSON.stringify(call.args[2]), /private|Token|ItemId|Url/);
    }
});

test('all other Playstate commands retain their original dispatch and notification behavior', () => {
    for (const command of ['Stop', 'Pause', 'Unpause', 'PlayPause', 'NextTrack', 'PreviousTrack', 'Unknown']) {
        const before = harness(original), after = harness(transformed);
        const message = {MessageType: 'Playstate', Data: {Command: command, SeekPositionTicks: 123}};
        before.send(message); after.send(message);
        assert.deepEqual(after.calls, before.calls, command);
        assert.equal(after.calls.some(call => call.method === 'seek'), false);
    }
});

test('Play and representative general commands preserve their existing arguments', () => {
    const messages = [
        {MessageType: 'Play', Data: {PlayCommand: 'PlayNow', ItemIds: ['synthetic-A'], StartPositionTicks: 123456789,
            MediaSourceId: 'synthetic-source', AudioStreamIndex: 2, SubtitleStreamIndex: 3, StartIndex: 0}},
        {MessageType: 'Play', Data: {PlayCommand: 'PlayNext', ItemIds: ['synthetic-B']}},
        {MessageType: 'Play', Data: {PlayCommand: 'PlayLast', ItemIds: ['synthetic-C']}},
        {MessageType: 'GeneralCommand', Data: {Name: 'SetVolume', Arguments: {Volume: '42'}}},
        {MessageType: 'GeneralCommand', Data: {Name: 'SetAudioStreamIndex', Arguments: {Index: '2'}}},
        {MessageType: 'GeneralCommand', Data: {Name: 'SetPlaybackRate', Arguments: {PlaybackRate: '1.25'}}}
    ];
    for (const message of messages) {
        const before = harness(original), after = harness(transformed);
        before.send(message); after.send(message);
        assert.deepEqual(JSON.parse(JSON.stringify(after.calls)), JSON.parse(JSON.stringify(before.calls)));
    }
});

test('remote diagnostic overlay fails closed for missing, duplicate or already transformed anchors', () => {
    const anchor = '_playbackmanager.default.seek(msg.Data.SeekPositionTicks)';
    for (const source of [null, {}, '', original.replace(anchor, '_playbackmanager.default.seek(0)'),
        original + anchor, transformed]) {
        assert.throws(() => patchInputApi(source), /source contract mismatch/);
    }
});

test('remote diagnostic overlay is bound to its exact production input, output and generator', () => {
    assert.ok(contract);
    assert.equal(contract.mode, 'tracked-canonical-transform');
    assert.equal(contract.basePath, 'vendor/web-snapshot/www/modules/common/input/api.js');
    assert.equal(contract.runtimePath, 'electronapp/www/modules/common/input/api.js');
    assert.equal(sha256(Buffer.from(original)), contract.expectedBaseSha256);
    assert.equal(sha256(Buffer.from(transformed)), contract.expectedOutputSha256);
    assert.ok(contract.generatorPaths.includes('tools/patch-playback-input-diagnostics.cjs'));
});
