'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {projectLog, createInputReference} = require('../src/electronapp/enhanced/media-network-diagnostics');
const {createNativeDiagnostics} = require('../src/electronapp/enhanced/native-diagnostics');
const {NativeHelperClient} = require('../src/electronapp/native-helper/controller');
const diagnostics = require('../src/electronapp/enhanced/diagnostics');
const observation = extra => ({kind: 'response', stage: 'response', networkError: 'none', httpStatus: 200, sequence: 1, ...extra});
test('network schema rejects arbitrary strings, fields, accessors and fabricated status shapes', () => {
    assert.deepEqual(projectLog(observation()), observation());
    for (const value of [null, [], observation({raw: 'TOKEN_CANARY'}), observation({kind: 'TOKEN_CANARY'}),
        observation({stage: 'TOKEN_CANARY'}), observation({networkError: 'TOKEN_CANARY'}), observation({httpStatus: 600}),
        observation({httpStatus: '403'}), observation({sequence: Infinity}), observation({kind: 'error', httpStatus: 403})]) assert.equal(projectLog(value), null);
    let called = false;
    const getter = observation(); Object.defineProperty(getter, 'httpStatus', {get() {called = true; throw Error('TOKEN_CANARY');}});
    assert.equal(projectLog(getter), null); assert.equal(called, false);
});
test('submitted endpoint references ignore credentials/path/query and cannot claim redirected host or survive a new service', () => {
    const ref = createInputReference(), first = ref('https://user:SECRET_CANARY@EXAMPLE.invalid:443/PATH_CANARY?token=QUERY_CANARY');
    assert.match(first.inputEndpointRef, /^ep-[a-f0-9]{32}$/);
    assert.equal(first.inputEndpointRef, ref('https://example.invalid/different').inputEndpointRef);
    assert.notEqual(first.inputEndpointRef, ref('https://other.invalid/').inputEndpointRef);
    assert.notEqual(first.inputEndpointRef, ref('http://example.invalid/').inputEndpointRef);
    assert.notEqual(first.inputEndpointRef, createInputReference()('https://example.invalid/').inputEndpointRef);
    assert.equal(first.finalEndpointRef, null); assert.equal(first.endpointRole, 'input-only');
    for (const value of ['C:\\PATH_CANARY', 'file:///PATH_CANARY', '\nhttps://example.invalid', 'https://' + 'x'.repeat(9000)]) assert.equal(ref(value).inputEndpointRef, null);
    assert.doesNotMatch(JSON.stringify(first), /CANARY|example|user/);
});
test('late curl observations remain helper-only across A/B, Stop and concurrent resources; invalid text never reaches timeline or logger', () => {
    const records = [], observe = createNativeDiagnostics(row => records.push(row));
    const client = new NativeHelperClient({helperPath: 'unused', libmpvPath: 'unused', parentWindowHandle: '1', helperInstanceId: 'H',
        onDiagnostic: value => observe({...value, helperRun: 1})});
    client.command = () => {};
    const a = client.beginGeneration('play-1-1'), b = client.beginGeneration('play-2-2');
    const send = (detail, helperInstanceId = 'H') => client.dispatch({type: 'lifecycle', scope: 'helper', helperInstanceId,
        name: 'media-network', detail, generationId: a});
    send(observation({httpStatus: 403, networkError: 'http-status'}));
    const row = records.at(-1);
    assert.equal(client.currentGenerationId, b); assert.equal(row.details.generationId, null);
    assert.equal(row.details.requestId, 'UNAVAILABLE'); assert.equal(row.details.association, 'helper-only');
    assert.equal(row.details.resourceRole, 'unknown'); assert.equal(row.details.finalEndpointRef, null);
    assert.equal(row.details.httpStatus, 403); assert.equal(row.details.evidenceSource, 'mpv-log');
    const before = records.length;
    send(observation({raw: 'SECRET_CANARY'})); send(observation({networkError: 'SECRET_CANARY'}));
    send(observation(), 'OLD_HELPER'); assert.equal(records.length, before);
    client.retireGeneration('stop'); send(observation({sequence: 2}));
    assert.equal(records.at(-1).details.requestId, 'UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify([records, client.timeline, diagnostics.sanitizeRecord(row)]), /SECRET_CANARY/);
});
test('engine log flood is bounded independently of normal lifecycle diagnostics', () => {
    const records = [], observe = createNativeDiagnostics(row => records.push(row), {now: () => 0});
    observe({name: 'generation-begin', disposition: 'BEGIN_GENERATION', generationId: 1, helperRun: 1, label: 'play-1-1'});
    for (let i = 1; i <= 2000; ++i) observe({name: 'media-network', disposition: 'ACCEPT_HELPER_GLOBAL', helperRun: 1, network: observation({sequence: i})});
    assert.equal(records.filter(row => row.category === 'media-network').length, 121);
    observe({name: 'end-file', disposition: 'ACCEPT', generationId: 1, helperRun: 1, endReason: 4, mpvErrorCode: -13});
    assert.equal(records.at(-1).event, 'end-file'); assert.equal(records.at(-1).details.mpvErrorCode, -13);
});
test('load-input keeps only a submitted endpoint reference and the original request association', () => {
    const records = [], observe = createNativeDiagnostics(row => records.push(row)), ref = createInputReference();
    observe({name: 'generation-begin', disposition: 'BEGIN_GENERATION', generationId: 1, helperRun: 1, label: 'play-1-1'});
    const network = ref('https://user:SECRET_CANARY@synthetic.invalid/PATH_CANARY?token=QUERY_CANARY');
    observe({name: 'media-network-input', disposition: 'ACCEPT', generationId: 1, helperRun: 1, network});
    const row = records.at(-1); assert.equal(row.event, 'load-input'); assert.equal(row.details.requestId, 'play-1-1');
    assert.equal(row.details.finalEndpointRef, null); assert.equal(row.details.inputEndpointRef, network.inputEndpointRef);
    assert.equal(diagnostics.sanitizeRecord(row).details.inputEndpointRef, network.inputEndpointRef);
    const before = records.length;
    observe({name: 'media-network-input', disposition: 'ACCEPT', generationId: 1, helperRun: 1, network: {...network, raw: 'SECRET_CANARY'}});
    assert.equal(records.length, before);
    assert.doesNotMatch(JSON.stringify([records, diagnostics.sanitizeRecord(row)]), /CANARY|synthetic\.invalid/);
});
