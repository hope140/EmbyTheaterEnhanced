'use strict';
// Explicit material-required integration probe; uses the real manager transform
// and libmpv module with private in-memory endpoints, never Electron or a server.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const test = require('node:test');
function fixtureExports(file, names) {
    const full = path.resolve(__dirname, '..', file);
    const source = fs.readFileSync(full, 'utf8');
    const cutoff = source.indexOf('\ntest(');
    assert.ok(cutoff > 0);
    const loaded = new Module(full, module);
    loaded.filename = full;
    loaded.paths = Module._nodeModulePaths(path.dirname(full));
    loaded._compile(source.slice(0, cutoff) + '\nmodule.exports = {' + names.join(',') + '};', full);
    return loaded.exports;
}
const pm = fixtureExports('playbackmanager-request-session.test.cjs', ['makeFixture', 'makeItem', 'deferred', 'waitFor', 'settle']);
const native = fixtureExports('native-helper-lifecycle.test.cjs', ['loadPlayer', 'makeNativeEndpoint']);

for (const stage of ['native-create', 'resolver']) {
    test('PLAY-01 real libmpv Stop fences pending ' + stage, {timeout: 5000}, async () => {
        const fixture = pm.makeFixture();
        const entered = pm.deferred();
        const gate = pm.deferred();
        const endpoint = native.makeNativeEndpoint();
        let signal;
        const logical = native.loadPlayer({create() {
            if (stage === 'native-create') {
                entered.resolve();
                return gate.promise.then(() => ({mode: 'native-helper', endpoint}));
            }
            return Promise.resolve({mode: 'native-helper', endpoint});
        }}, null, {resolveAsync(context, options) {
            if (stage === 'resolver') {
                signal = options.signal;
                entered.resolve();
                return gate.promise.then(() => ({type: 'native', source: context.nativeSource}));
            }
            return Promise.resolve({type: 'native', source: context.nativeSource});
        }}).player;
        fixture.player.play = stream => {
            fixture.calls.play.push(stream);
            return logical.play(stream);
        };
        fixture.player.stop = async (...args) => {
            fixture.calls.stop.push(args);
            await logical.stop(args[0]);
            fixture.events.trigger(fixture.player, 'stopped');
        };
        const item = pm.makeItem('A', {fullscreen: false});
        fixture.queueControl.nextItem = () => ({item, index: 0});
        const playing = fixture.manager.nextTrack();
        await pm.waitFor(() => fixture.calls.metadata.length === 1, 'metadata gate');
        fixture.resolveMetadata(0, 'session-A');
        await entered.promise;
        const stopping = fixture.manager.stop();
        if (signal) assert.equal(signal.aborted, true, 'Stop aborts resolver synchronously');
        gate.resolve();
        await Promise.all([playing, stopping]);
        await pm.settle();
        assert.equal(endpoint.operations.filter(row => row.type === 'load').length, 0);
        assert.equal(fixture.manager.currentItem(), null);
        assert.equal(fixture.calls.playbackStarts.length, 0);
        assert.equal(fixture.calls.reports.length, 0, 'pending intent owns no started Session');
    });
}
