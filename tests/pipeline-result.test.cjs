'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {pipelinePassed, buildPipelineSessionChecks, NEXT_CHECKS, PLAYER_CHECKS, GENERATION_CHECKS} = require('./pipeline-result.cjs');
const {createFakeCd2Fixture} = require('./fake-cd2-fixture.cjs');
const truth = names => Object.fromEntries(names.map(name => [name,true]));
const SESSION_GROUPS = {
    ordinary:['fixture-video'],
    strm:['fixture-strm'],
    queue:['fixture-next-a','fixture-next-b','fixture-next-c']
};
function sessionRecord(endpoint, itemId, playSessionId='play-'+itemId, mediaSourceId='source-'+itemId) {
    const body = {ItemId:itemId,PlaySessionId:playSessionId};
    if (mediaSourceId !== undefined) body.MediaSourceId = mediaSourceId;
    return {endpoint:'/emby/Sessions/Playing'+(endpoint === 'Playing' ? '' : '/Stopped'),body};
}
function validSessionRecords() {
    return Object.values(SESSION_GROUPS).flat().flatMap(itemId => [
        sessionRecord('Playing',itemId),
        sessionRecord('Stopped',itemId)
    ]);
}
async function fixture() {
    const fake = createFakeCd2Fixture({getSource:()=> 'http://127.0.0.1:1/fixture.y4m'});
    const gates = {};
    for (const [prefix, label, requestId] of [['rapid','rapid-next','play-6-11'],['stop','stop-before-load','play-9003-17']]) {
        const {armId} = await fake.control({action:'arm-next',label});
        const resolving = fake.service.resolve({requestId});
        gates[prefix+'Pending'] = await fake.control({action:'wait-pending',armId});
        fake.service.cancel(requestId);
        gates[prefix+'Cancelled'] = await fake.control({action:'wait-cancelled',armId});
        await resolving;
    }
    const snapshot = fake.snapshot(); fake.dispose();
    const records = validSessionRecords();
    return {snapshot, pipeline:{next:truth(NEXT_CHECKS),results:['video','strm'].map(kind=>({kind,playerId:'libmpvmediaplayer',...truth(PLAYER_CHECKS)})),generation:{...truth(GENERATION_CHECKS),observer:{fixtures:[{fixtureId:'fixtureStop#1-play',requestId:null,nativeGenerationId:null,cd2RequestId:gates.stopPending.requestId,cd2PendingAtGate:true,cd2CancelSent:true}]}},gateEvidence:gates,records,sessionChecks:buildPipelineSessionChecks(records,SESSION_GROUPS)}};
}
test('actual fake-service cancellation receipts pass for hit and direct', async () => {
    const {pipeline,snapshot}=await fixture();
    assert.equal(pipeline.sessionChecks.pendingStopped,0);
    assert.equal(pipeline.sessionChecks.unmatchedStopped,0);
    assert.equal(pipeline.sessionChecks.startedStoppedOneToOne,true);
    assert.equal(pipeline.sessionChecks.ordinaryStartedStopped,true);
    assert.equal(pipeline.sessionChecks.strmStartedStopped,true);
    assert.equal(pipeline.sessionChecks.queueStartedStopped,true);
    assert.equal(pipeline.sessionChecks.passed,true);
    assert.equal(pipelinePassed(pipeline,'hit',snapshot),true);
    assert.equal(pipelinePassed(pipeline,'direct',snapshot),true);
});
test('wrong item, missing seek, stale serial source and absent checks fail', async () => {
    for (const mutate of [p=>p.next.selected=false,p=>delete p.next.overlapEstablished,p=>p.next.serialSourceLoaded=false,p=>p.results[0].sought=false,p=>p.results.pop(),p=>p.generation.stopPreventedLateLoad=false]) {
        const {pipeline,snapshot}=await fixture(); mutate(pipeline);
        assert.equal(pipelinePassed(pipeline,'hit',snapshot),false);
    }
});
test('a high global cancel count cannot replace either exact cancellation', async () => {
    for (const change of [s=>s.requests[0].status='completed',s=>s.events=s.events.filter(e=>e.event!=='resolve-cancelled'),s=>s.activeCount=1,s=>s.gateWaiterCount=1]) {
        const {pipeline,snapshot}=await fixture(); snapshot.cancelCount=20; change(snapshot);
        assert.equal(pipelinePassed(pipeline,'hit',snapshot),false);
    }
});
test('forged, mismatched or reused gate receipts fail', async () => {
    for (const mutate of [g=>g.rapidCancelled.requestId='play-99-1',g=>g.rapidPending.held=false,g=>g.stopPending=g.rapidPending,g=>g.stopCancelled.armId='arm-1']) {
        const {pipeline,snapshot}=await fixture(); mutate(pipeline.gateEvidence);
        assert.equal(pipelinePassed(pipeline,'hit',snapshot),false);
    }
});
test('non-CD2 flow still requires all playback and queue checks', async () => {
    const {pipeline}=await fixture(); pipeline.generation=null;
    assert.equal(pipelinePassed(pipeline,null,null),true);
    pipeline.next.serialSelected=false;
    assert.equal(pipelinePassed(pipeline,null,null),false);
});
test('Stop before native generation matches CD2 identity and rejects mismatched renderer evidence', async () => {
    const {pipeline,snapshot}=await fixture();
    assert.equal(pipelinePassed(pipeline,'hit',snapshot),true);
    pipeline.generation.observer.fixtures[0].cd2RequestId='play-9003-999';
    assert.equal(pipelinePassed(pipeline,'hit',snapshot),false);
});
test('stale, forged and missing session checks cannot pass the pipeline', async () => {
    const forged = await fixture();
    forged.pipeline.sessionChecks.passed = false;
    assert.equal(pipelinePassed(forged.pipeline,'hit',forged.snapshot),false,'forged session result');

    const stale = await fixture();
    const started = stale.pipeline.records.find(record => record.endpoint.endsWith('/Playing') && record.body.ItemId === 'fixture-next-b');
    stale.pipeline.records.push({endpoint:started.endpoint,body:{...started.body}});
    assert.equal(stale.pipeline.sessionChecks.passed,true,'stale fixture remains superficially passed');
    assert.equal(pipelinePassed(stale.pipeline,'hit',stale.snapshot),false,'stale session result');

    const missing = await fixture();
    delete missing.pipeline.sessionChecks;
    assert.equal(pipelinePassed(missing.pipeline,'hit',missing.snapshot),false,'missing session result');
});
test('recomputed session checks reject duplicate, mismatched, incomplete and pending reports', async () => {
    const mutations = [
        ['duplicate Started', pipeline => {
            const started = pipeline.records.find(record => record.endpoint.endsWith('/Playing') && record.body.ItemId === 'fixture-next-b');
            pipeline.records.push({endpoint:started.endpoint,body:{...started.body}});
        }, checks => checks.duplicateStarted > 0],
        ['duplicate Stopped', pipeline => {
            const stopped = pipeline.records.find(record => record.endpoint.endsWith('/Stopped') && record.body.ItemId === 'fixture-next-c');
            pipeline.records.push({endpoint:stopped.endpoint,body:{...stopped.body}});
        }, checks => checks.duplicateStopped > 0],
        ['wrong session', pipeline => {
            const stopped = pipeline.records.find(record => record.endpoint.endsWith('/Stopped') && record.body.ItemId === 'fixture-video');
            stopped.body.PlaySessionId = 'wrong-session';
        }, checks => checks.mismatchedStopped > 0 && checks.unmatchedStopped > 0],
        ['missing source', pipeline => {
            const stopped = pipeline.records.find(record => record.endpoint.endsWith('/Stopped') && record.body.ItemId === 'fixture-strm');
            delete stopped.body.MediaSourceId;
        }, checks => checks.incompleteStopped > 0 && checks.unmatchedStopped > 0],
        ['pending Stop with missing identity', pipeline => {
            pipeline.records.unshift(sessionRecord('Stopped','fixture-next-b',null,undefined));
        }, checks => checks.pendingStopped > 0 && checks.incompleteStopped > 0 && checks.unmatchedStopped > 0],
        ['Stopped before Started', pipeline => {
            const startedIndex = pipeline.records.findIndex(record => record.endpoint.endsWith('/Playing') && record.body.ItemId === 'fixture-video');
            const stoppedIndex = pipeline.records.findIndex(record => record.endpoint.endsWith('/Stopped') && record.body.ItemId === 'fixture-video');
            [pipeline.records[startedIndex],pipeline.records[stoppedIndex]] = [pipeline.records[stoppedIndex],pipeline.records[startedIndex]];
        }, checks => checks.pendingStopped > 0 && checks.unmatchedStopped > 0 && checks.unpairedStopped > 0],
        ['missing Started', pipeline => {
            const index = pipeline.records.findIndex(record => record.endpoint.endsWith('/Playing') && record.body.ItemId === 'fixture-next-a');
            pipeline.records.splice(index,1);
        }, checks => checks.pendingStopped > 0 && checks.unmatchedStopped > 0 && checks.unpairedStopped > 0],
        ['missing Stop', pipeline => {
            const index = pipeline.records.findIndex(record => record.endpoint.endsWith('/Stopped') && record.body.ItemId === 'fixture-next-c');
            pipeline.records.splice(index,1);
        }, checks => checks.unpairedStarted > 0]
    ];
    for (const [label, mutate, expected] of mutations) {
        const {pipeline,snapshot}=await fixture();
        mutate(pipeline);
        const checks = buildPipelineSessionChecks(pipeline.records,SESSION_GROUPS);
        assert.equal(checks.passed,false,label+' derived passed');
        assert.equal(expected(checks),true,label+' did not expose expected counter');
        pipeline.sessionChecks = checks;
        assert.equal(pipelinePassed(pipeline,'hit',snapshot),false,label+' pipeline passed');
    }
});
test('recomputed session checks reject an item with no matching report identity', async () => {
    const {pipeline,snapshot}=await fixture();
    const started = pipeline.records.find(record => record.endpoint.endsWith('/Playing') && record.body.ItemId === 'fixture-video');
    const stopped = pipeline.records.find(record => record.endpoint.endsWith('/Stopped') && record.body.ItemId === 'fixture-video');
    started.body.MediaSourceId = 'source-started-only';
    const checks = buildPipelineSessionChecks(pipeline.records,SESSION_GROUPS);
    assert.equal(checks.passed,false);
    assert.ok(checks.mismatchedStopped > 0 || checks.unmatchedStopped > 0);
    pipeline.sessionChecks = checks;
    assert.equal(pipelinePassed(pipeline,'hit',snapshot),false);
    assert.equal(stopped.body.MediaSourceId,'source-fixture-video');
});
