'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {installMediaCheck} = require('../prototypes/fn-connect/client/media-check.cjs');

function panel() {
    const elements = new Map();
    const document = {getElementById(id) {
        if (!elements.has(id)) elements.set(id, {textContent: '', addEventListener() {}});
        return elements.get(id);
    }};
    let receive;
    const context = {document, window: {fnExperiment: {
        action: async () => ({fixture: false}), onState: listener => { receive = listener; }
    }}};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../prototypes/fn-connect/client/panel.js'), 'utf8'), context);
    return {send: value => receive(value), view: () => JSON.parse(elements.get('status').textContent)};
}
const blocked = {event: 'diagnostic', result: 'MEDIA_CHECK_EXTERNAL_BLOCKED', scheme: 'OTHER', resourceType: 'other'};
const terminal = {event: 'terminal', result: 'MEDIA_CHECK_PARTIAL_HEADERS_OBSERVED', bodyRead: false};
const media = (id, mediaCheck) => ({id, state: 'media-check', mediaCheck});

test('diagnostics are not an outcome; removing early records no assumption about who stopped it', () => {
    const x = panel(); x.send(media('one', blocked));
    assert.equal(x.view().mediaCheck.diagnosticCount, 1);
    assert.equal(x.view().mediaCheck.outcome, null);
    assert.equal(x.view().mediaCheck.awaitingTerminal, true);
    x.send({id: 'one', state: 'closed'});
    assert.equal(x.view().mediaCheck.outcome, null);
    assert.equal(x.view().mediaCheck.ended, 'CONNECTION_REMOVED_BEFORE_TERMINAL');
    assert.equal(x.view().mediaCheck.awaitingTerminal, false);
    assert.deepEqual(x.view().mediaCheck.lastDiagnostic, blocked);
});
test('the first HTTP media block remains visible when later non-media diagnostics arrive', () => {
    const x = panel(), first = {...blocked, scheme: 'HTTPS', resourceType: 'media',
        origin: 'https://outside.example.test', blockReason: 'ORIGIN_MISMATCH'};
    x.send(media('one', first)); x.send(media('one', {...blocked, resourceType: 'script'}));
    x.send(media('one', {event: 'terminal', result: 'MEDIA_CHECK_TIMEOUT'}));
    x.send({id: 'one', state: 'closed'});
    assert.deepEqual(x.view().mediaCheck.firstMediaBlock, first);
    assert.equal(x.view().mediaCheck.lastDiagnostic.resourceType, 'script');
    assert.equal(x.view().mediaCheck.outcome.result, 'MEDIA_CHECK_TIMEOUT');
});
test('first terminal survives later diagnostics, cleanup failures, actions and profile removal', () => {
    const x = panel(); x.send({id: 'one', state: 'media-check-armed'});
    x.send(media('one', blocked)); x.send(media('one', terminal));
    x.send(media('one', {event: 'cleanup', result: 'MEDIA_CHECK_CLOSE_UNCONFIRMED'}));
    x.send(media('one', blocked));
    x.send(media('one', {event: 'terminal', result: 'MEDIA_CHECK_TIMEOUT'}));
    x.send({error: 'SYNTHETIC_ACTION_ERROR'}); x.send({id: 'one', state: 'closed'});
    assert.deepEqual(x.view().mediaCheck.outcome, terminal);
    assert.equal(x.view().mediaCheck.connectionCleanup, 'MEDIA_CHECK_CLOSE_UNCONFIRMED');
    assert.equal(x.view().mediaCheck.diagnosticCount, 2);
    assert.equal(x.view().mediaCheck.ended, null);
});
test('only explicit terminal results qualify; unknown and misclassified blocked events do not', () => {
    const x = panel();
    for (const value of [{result: 'MEDIA_CHECK_HEADERS_ONLY'}, {event: 'terminal', result: 'MEDIA_CHECK_EXTERNAL_BLOCKED'},
        {event: 'terminal', result: 'UNKNOWN'}, {event: 'cleanup', result: 'MEDIA_CHECK_TIMEOUT'}]) x.send(media('one', value));
    assert.equal(x.view().mediaCheck.outcome, null);
    for (const result of ['MEDIA_CHECK_PARTIAL_HEADERS_OBSERVED', 'MEDIA_CHECK_HEADERS_ONLY',
        'MEDIA_CHECK_PLAYLIST_UNSUPPORTED', 'MEDIA_CHECK_TIMEOUT', 'MEDIA_CHECK_METADATA_INVALID']) {
        x.send(media(result, {event: 'terminal', result}));
        assert.equal(x.view().mediaCheck.outcome.result, result);
    }
});
test('separate connection outcomes cannot overwrite each other', () => {
    const x = panel(); x.send(media('one', terminal)); x.send(media('two', blocked));
    assert.equal(x.view().mediaCheck.outcome, null);
    x.send({id: 'one', state: 'target-opened'});
    assert.deepEqual(x.view().mediaCheck.outcome, terminal);
    x.send({id: 'two', state: 'closed'});
    assert.equal(x.view().mediaCheck.outcome, null);
});
test('explicit next rounds keep the preceding terminal and ignore late reports from an older round', () => {
    const x = panel();
    x.send({...media('one', terminal), roundId: 1});
    x.send({id: 'one', state: 'check-prepared', roundId: 1});
    x.send({id: 'one', state: 'media-check-armed', roundId: 2});
    assert.equal(x.view().mediaCheck.roundId, 2);
    assert.equal(x.view().mediaCheck.outcome, null);
    assert.deepEqual(x.view().mediaCheck.previousRounds, [{roundId: 1, outcome: terminal, ended: null}]);
    x.send({...media('one', terminal), roundId: 1});
    assert.equal(x.view().mediaCheck.outcome, null);
    x.send({...media('one', {event: 'terminal', result: 'MEDIA_CHECK_TIMEOUT'}), roundId: 2});
    assert.equal(x.view().mediaCheck.outcome.result, 'MEDIA_CHECK_TIMEOUT');
    assert.equal(x.view().mediaCheck.previousRounds[0].outcome.result, terminal.result);
});
test('an unarmed second connection and global notices cannot misattribute the retained first outcome', () => {
    const x = panel(); x.send(media('one', terminal));
    const owner = x.view().mediaCheck.connection;
    for (const state of ['ready', 'closed']) {
        x.send({id: 'two', state});
        assert.notEqual(x.view().operation.connection, owner);
        assert.equal(x.view().mediaCheck.connection, owner);
        assert.deepEqual(x.view().mediaCheck.outcome, terminal);
    }
    x.send({state: 'notice', reason: 'SYNTHETIC_NOTICE'});
    assert.equal(x.view().operation.connection, null);
    assert.equal(x.view().mediaCheck.connection, owner);
});
test('actual observer-to-panel reports retain timeout separately from late connection-close failure', async () => {
    const x = panel(), handlers = {}; let expire;
    const session = {webRequest: {}, closeAllConnections: async () => { throw new Error('SYNTHETIC_CLOSE_FAILED'); }};
    for (const name of ['onBeforeRequest', 'onHeadersReceived']) session.webRequest[name] = (filter, fn) => { handlers[name] = fn; };
    const observer = installMediaCheck(session, 'https://media.example.test/', {onReport: value => x.send(media('one', value)),
        schedule(fn) { expire = fn; return {}; }, unschedule() {}});
    handlers.onBeforeRequest({url: 'synthetic-canary:private-canary', resourceType: 'other'}, value => assert.equal(value.cancel, true));
    assert.equal(x.view().mediaCheck.outcome, null);
    expire(); await Promise.resolve();
    assert.equal(x.view().mediaCheck.outcome.result, 'MEDIA_CHECK_TIMEOUT');
    assert.equal(x.view().mediaCheck.connectionCleanup, 'MEDIA_CHECK_CLOSE_UNCONFIRMED');
    observer.dispose(); x.send({id: 'one', state: 'closed'});
    assert.equal(x.view().mediaCheck.outcome.result, 'MEDIA_CHECK_TIMEOUT');
});
