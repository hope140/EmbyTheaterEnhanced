'use strict';
const fs = require('node:fs');
const path = require('node:path');

function verify({scenario, smoke, runner, marker, stages, exitStages}) {
    const failures = [];
    const check = (value, code) => { if (!value) failures.push(code); };
    check(['idle','playing','stopped','pipeline'].includes(scenario), 'scenario');
    const state = smoke && smoke.state && smoke.state.pipeline;
    const close = state && state.normalClose;
    check(smoke && smoke.ok === true && close && close.scenario === scenario && close.preconditionsPassed === true && close.hidden === true, 'scenario-preconditions');
    const records = state && state.records || [];
    const starts = records.filter(row => row.endpoint.endsWith('/Playing'));
    const stops = records.filter(row => row.endpoint.endsWith('/Stopped'));
    const complete = row => row.body.ItemId === 'fixture-close' && row.body.PlaySessionId === 'play-fixture-close' && row.body.MediaSourceId === 'source-fixture-close';
    if (scenario === 'pipeline') {
        check(close && ['hit','miss','direct'].includes(close.cd2Mode) &&
            require('../tests/pipeline-result.cjs').pipelinePassed(state,close.cd2Mode,smoke.cd2Fake), 'complete-playback-pipeline');
        check(close && close.currentItemId === null, 'player-preconditions');
    } else {
        check(starts.every(complete) && stops.every(complete) && starts.length === (scenario === 'idle' ? 0 : 1) && stops.length === (scenario === 'stopped' ? 1 : 0), 'session-preconditions');
        check(close && close.embeddedPlayCount === (scenario === 'idle' ? 0 : 1) && close.currentItemId === (scenario === 'playing' ? 'fixture-close' : null), 'player-preconditions');
    }
    check(runner && runner.exitMode === 'NATURAL' && runner.exitCode === 0 && runner.timedOut === false && runner.cleanupAttempted === false && runner.candidateResidual === 0 && runner.outputCapture === 'COMPLETE', 'os-natural-exit');
    check(runner && runner.childExitObservations.every(row => row.gone === true && row.observation === 'GONE_WITHOUT_OUTER_CLEANUP'), 'observed-children-exited');
    check(marker && ['appDataIsolated','userDataIsolated','aboutVersionMatched','aboutSourceCommitMatched','applicationDocumentMatched','applicationWindowInjected'].every(key => marker[key] === true) && marker.auxiliaryWindowInjected === false, 'isolation-and-identity');
    const index = name => stages.findIndex(row => row.stage === name);
    for (const stage of ['application-close-requested','application-window-close','application-window-closed','window-all-closed','before-quit','will-quit','quit','fixture-server-close-requested']) check(index(stage) >= 0, 'missing-' + stage);
    check(index('application-close-requested') < index('application-window-close') && index('application-window-close') < index('window-all-closed') && index('window-all-closed') < index('before-quit') && index('before-quit') < index('will-quit') && index('will-quit') < index('quit'), 'close-order');
    for (const name of ['diagnostics','maintenance','strm-config','cd2','native']) {
        check(index(name + '-unregister-start') > index('before-quit') && index(name + '-unregister-complete') > index(name + '-unregister-start') && index(name + '-unregister-complete') < index('will-quit'), 'cleanup-' + name);
    }
    check(!stages.some(row => /failed$/.test(row.stage)), 'cleanup-failure');
    check(!stages.some(row => row.stage === 'native-child-force-kill'), 'native-forced-exit');
    const helperReady = (smoke.nativeHelperEvents || []).some(row => row.event === 'helper-ready');
    check(!(smoke.nativeHelperEvents || []).some(row => ['helper-terminal','load-failed'].includes(row.event) || row.failureCode), 'native-preclose-failure');
    check(scenario === 'idle' || helperReady, 'native-helper-ready');
    if (helperReady) {
        const numbered = stages.map((row, position)=>({...row,position}));
        const starts = numbered.filter(row=>row.stage === 'native-client-shutdown-start');
        const ends = numbered.filter(row=>row.stage === 'native-client-shutdown-complete');
        const pairs = starts.map(start=>({start,end:ends.find(end=>end.clientId===start.clientId)}));
        check(starts.length > 0 && starts.length === ends.length &&
            new Set(starts.map(row=>row.clientId)).size === starts.length &&
            new Set(ends.map(row=>row.clientId)).size === ends.length &&
            pairs.every(({start,end})=>Number.isSafeInteger(start.clientId) && start.clientId>0 && end &&
                end.exited === true && end.position>start.position && end.position<index('will-quit')) &&
            pairs.some(({end})=>end && end.position>index('application-close-requested')), 'native-actual-exit');
    }
    check(!exitStages.some(row => row.stage === 'app-exit-requested'), 'direct-exit-forbidden');
    check(exitStages.some(row => row.stage === 'before-quit-observed') && exitStages.some(row => row.stage === 'will-quit-observed'), 'product-quit-path');
    return {schemaVersion:1,scenario,status:failures.length ? 'FAIL' : 'PASS',failures,
        realServiceAccess:false,visibleAcceptance:'NOT_EXECUTED',historicalAppExitRootCause:'UNKNOWN'};
}

if (require.main === module) {
    const [, , runtime, evidence, scenario] = process.argv;
    const read = name => JSON.parse(fs.readFileSync(path.join(evidence, name), 'utf8').replace(/^\uFEFF/,''));
    const lines = name => fs.readFileSync(path.join(evidence, name), 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
    const result = verify({scenario, smoke:read('electron-smoke.json'),runner:read('runner-result.json'),marker:read('p1-diagnostics-injection.json'),stages:lines('normal-close.jsonl'),exitStages:lines('exit-observation.jsonl')});
    const provenance = JSON.parse(fs.readFileSync(path.join(runtime, 'runtime-provenance.json')));
    result.sourceCommit = provenance.sourceCommit;
    fs.writeFileSync(path.join(evidence, 'normal-close-result.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result));
    if (result.status !== 'PASS') process.exitCode = 1;
}
module.exports = {verify};
