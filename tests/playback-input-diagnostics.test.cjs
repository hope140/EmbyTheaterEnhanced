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
        {default: {notify: () => calls.push({method: 'notify'}), trigger: (name, options) => calls.push({method: 'input', name, options: options && JSON.parse(JSON.stringify(options))})}},
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
        if (['Stop', 'NextTrack', 'PreviousTrack'].includes(command)) {
            assert.deepEqual(after.calls[0].options, {diagnosticOrigin: 'remote-playstate'});
            after.calls[0].options = undefined;
        }
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
        if (message.Data.PlayCommand === 'PlayNow') {
            const options = after.calls.find(call => call.method === 'play').args[0];
            assert.deepEqual(JSON.parse(JSON.stringify(options._eteDiagnosticControl)), {controlOrigin: 'remote-playstate'});
            delete options._eteDiagnosticControl;
        }
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

test('generated inputmanager keeps Stop/Next dispatch and finite origins including remote and SMTC without leaking options', () => {
    const {patchInputManager} = require('../tools/patch-playback-input-diagnostics.cjs');
    const raw = fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/modules/common/inputmanager.js'), 'utf8');
    const transformedInput = patchInputManager(raw);
    const contract = WEB_OVERLAY_CONTRACT.find(row => row.id === 'playback-input-manager-diagnostics');
    assert.equal(sha256(Buffer.from(transformedInput)), contract.expectedOutputSha256);
    for (const origin of ['remote-playstate', 'windows-media', 'host-command', 'PRIVATE_CANARY', undefined]) {
        let factory; const calls = [], scope = {tagName: 'DIV', dispatchEvent: () => true}, exported = {};
        vm.runInNewContext(transformedInput, {define(_deps, callback) {factory = callback;}, Date,
            self: {}, window: {addEventListener() {}}, document: {activeElement: scope}, CustomEvent: class {constructor(name, data) {this.detail = data.detail;}}});
        factory(exported, {default: {}}, {default: {}}, {default: {stop: (...args) => calls.push(['stop', ...args]), nextTrack: (...args) => calls.push(['next', ...args])}},
            {default: {getCurrentScope: () => scope}}, {appHost: {}}, {default: {on() {}}});
        exported.default.trigger('stop', {diagnosticOrigin: origin, raw: 'PRIVATE_CANARY'});
        exported.default.trigger('next', {diagnosticOrigin: origin});
        assert.deepEqual(calls.map(call => call[0]), ['stop', 'next']);
        for (const call of calls) {
            assert.equal(call[1], null);
            assert.equal(call[2].controlOrigin, ['remote-playstate', 'windows-media', 'host-command'].includes(origin) ? origin : 'input');
            assert.doesNotMatch(JSON.stringify(call), /PRIVATE_CANARY/);
        }
    }
});
