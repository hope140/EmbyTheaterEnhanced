'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const renderer = require('../src/electronapp/enhanced/playback-retention-renderer');
function fixture() {
    let account = 'mock-account', epoch = 1, release;
    const api = {serverId: () => 'mock-server', serverAddress: () => 'https://mock.invalid', getCurrentUserId: () => account};
    Object.defineProperty(api, '_identityEpoch', {get: () => epoch});
    const contexts = [], gate = new Promise(resolve => {release = resolve;}), calls = [];
    const options = {endpoint: {retentionContext: {enabled: true}, createRetentionContextBinding() {return {async setContext(c) {contexts.push(c); await gate;}, async sample() {calls.push('sample');}, async retire() {calls.push('retire');}};}},
        connectionManager: {getApiClient: () => api}, item: {Id: 'item', ServerId: 'mock-server', MediaType: 'Video'}, mediaSource: {Id: 'version', Container: 'avi'},
        options: {playSessionId: 'session', playMethod: 'DirectPlay'}, source: 'https://mock.invalid/Videos/item/stream.avi?Static=true', signal: new AbortController().signal, isCurrent: () => true};
    return {options, contexts, calls, release, change() {account = 'other'; epoch++;}};
}
test('no opt-in capability performs no API identity lookup or IPC', async () => {
    const f = fixture(); f.options.endpoint.retentionContext = null; f.options.connectionManager.getApiClient = () => {throw Error('must-not-call');};
    assert.equal(await renderer.bind(f.options), null); assert.deepEqual(f.contexts, []);
});
test('identity epoch/account change during main authorization retires only the bound context', async () => {
    const f = fixture(), promise = renderer.bind(f.options); f.change(); f.release();
    assert.equal(await promise, null); assert.deepEqual(f.calls, ['retire']);
});
test('confirmed current binding samples on actual playback and abort retires without changing the media source', async () => {
    const f = fixture(), abort = new AbortController(); f.options.signal = abort.signal; f.release(); const binding = await renderer.bind(f.options); assert(binding);
    binding.started(); await Promise.resolve(); assert.deepEqual(f.calls, ['sample']); assert.equal(f.contexts[0].source, f.options.source);
    abort.abort(); await Promise.resolve(); assert.deepEqual(f.calls, ['sample', 'retire']);
});
test('abort and repeated close join the same physical retirement barrier', async () => {
    const f = fixture(), abort = new AbortController(); f.options.signal = abort.signal;
    let finish, retiring = 0; const gate = new Promise(resolve => {finish = resolve;});
    f.options.endpoint.createRetentionContextBinding = () => ({async setContext() {}, async sample() {}, retire() {retiring++; return gate;}});
    const binding = await renderer.bind(f.options); abort.abort(); let closed = false;
    const first = binding.close(), second = binding.close(); assert.equal(first, second); first.then(() => {closed = true;});
    await Promise.resolve(); assert.equal(retiring, 1); assert.equal(closed, false); finish(); await first; assert.equal(closed, true);
});
