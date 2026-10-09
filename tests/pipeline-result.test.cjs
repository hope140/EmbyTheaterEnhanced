'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {pipelinePassed, NEXT_CHECKS, PLAYER_CHECKS, GENERATION_CHECKS} = require('./pipeline-result.cjs');
const {createFakeCd2Fixture} = require('./fake-cd2-fixture.cjs');
const truth = names => Object.fromEntries(names.map(name => [name,true]));
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
    return {snapshot, pipeline:{next:truth(NEXT_CHECKS),results:['video','strm'].map(kind=>({kind,playerId:'libmpvmediaplayer',...truth(PLAYER_CHECKS)})),generation:{...truth(GENERATION_CHECKS),observer:{fixtures:[{fixtureId:'fixtureStop#1-play',requestId:null,nativeGenerationId:null,cd2RequestId:gates.stopPending.requestId,cd2PendingAtGate:true,cd2CancelSent:true}]}},gateEvidence:gates}};
}
test('actual fake-service cancellation receipts pass for hit and direct', async () => {
    const {pipeline,snapshot}=await fixture();
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
