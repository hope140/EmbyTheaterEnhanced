'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {projectLog, createInputReference} = require('../src/electronapp/enhanced/media-network-diagnostics');
const {createNativeDiagnostics} = require('../src/electronapp/enhanced/native-diagnostics');
const {NativeHelperClient} = require('../src/electronapp/native-helper/controller');
const diagnostics = require('../src/electronapp/enhanced/diagnostics');
const observation = extra => ({kind: 'response', stage: 'response', networkError: 'none', httpStatus: 200, sequence: 1, ...extra});
test('unavailable random key degrades only endpoint diagnostics instead of failing the playback service', () => {
    const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), module = {exports: {}};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/electronapp/enhanced/media-network-diagnostics.js'), 'utf8'),
        {module, exports: module.exports, require() {return {randomBytes() {throw Error('SECRET_CANARY');}};}, URL});
    const ref = module.exports.createInputReference();
    assert.equal(ref('https://synthetic.invalid/').inputEndpointRef, null);
});
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
    assert.doesNotMatch(JSON.stringify(first), /CANARY|user/);
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
    assert.doesNotMatch(JSON.stringify([records, diagnostics.sanitizeRecord(row)]), /CANARY/);
});

test('input host, route shape, path grouping and exact locator attempts survive real logging/export without path or signature values', async t => {
    const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-input-diagnostic-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const ref = createInputReference(), logger = diagnostics.createLogger(root);
    const a = ref('https://USER_CANARY:PASSWORD_CANARY@media.example.invalid:8443/Videos/RESOURCE_CANARY/stream.mkv?sig=SIGNATURE_CANARY');
    const signedAgain = ref('https://media.example.invalid:8443/Videos/RESOURCE_CANARY/stream.mkv?sig=CHANGED_CANARY');
    const other = ref('https://media.example.invalid:8443/Videos/OTHER_CANARY/stream.mkv?sig=SIGNATURE_CANARY');
    assert.equal(a.inputHost, 'media.example.invalid'); assert.equal(a.inputPort, 8443);
    assert.deepEqual(a.inputRoute, ['Videos', '{segment}', 'stream.mkv']);
    assert.equal(a.inputEndpointRef, other.inputEndpointRef);
    assert.notEqual(a.inputPathRef, other.inputPathRef);
    assert.equal(a.inputPathRef, signedAgain.inputPathRef, 'path grouping deliberately ignores all query values');
    assert.notEqual(a.inputLocatorRef, signedAgain.inputLocatorRef, 'exact submitted locator includes the query');
    assert.notEqual(a.loadAttempt, signedAgain.loadAttempt);
    assert.equal(a.finalEndpointRef, null);
    const observe = createNativeDiagnostics(logger);
    observe({name: 'generation-begin', disposition: 'BEGIN_GENERATION', generationId: 9, helperRun: 1, label: 'play-9-9'});
    observe({name: 'media-network-input', disposition: 'ACCEPT', generationId: 9, helperRun: 1, network: a});
    const read = await logger.readRecords();
    const row = read.records.find(row => row.event === 'load-input');
    assert.equal(row.details.inputHost, a.inputHost);
    assert.deepEqual(row.details.inputRoute, a.inputRoute);
    assert.equal(row.details.inputPathRef, a.inputPathRef);
    const report = await logger.exportReport({});
    assert.match(report, /media.example.invalid/); assert.match(report, /8443/);
    assert.doesNotMatch(JSON.stringify(read) + report, /CANARY|sig=|https:\/\/USER/);
});
