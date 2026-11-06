'use strict';

const fs = require('node:fs');
const {normalizeDiagnostic} = require('./diagnostics.cjs');
const input = require('./electron-input.json');
const expectedVersion = input.version;
const expectedHash = input.sha256;
const stages = ['APP_CODE_STARTED', 'APP_READY', 'PANEL_READY', 'BOOTSTRAP',
    'PRIMARY_PAGE_AUTHORIZED', 'PRIMARY_API_VERIFIED', 'ISOLATED_API_DENIED', 'HTTP_SESSION',
    'API_SESSION_POST', 'REDIRECT_SEPARATION', 'WEBSOCKET_SESSION', 'CANCELLATION', 'PROFILE_CLOSE', 'EXPIRY', 'DRAINED'];
const checks = ['bootstrap', 'isolatedSessions', 'httpSessionCookie', 'authenticatedApiPost', 'range206', 'range416',
    'externalRedirectCredentialSeparation', 'credentialLocationRejected', 'websocketSessionCookie',
    'websocketRawBytes', 'pendingWebSocketCancelled', 'pendingHeadersCancelled', 'streamCancelled',
    'profileCloseClearsCookies', 'profileCloseRetiresSockets', 'profileCloseRetiresStreams', 'expiryRetiresLeases',
    'sandboxedControlRenderer', 'isolatedControlRenderer'];
const launchStates = new Set(['COMPLETED', 'TIMEOUT', 'DOWNLOAD_FAILED', 'HASH_MISMATCH', 'EXTRACT_FAILED',
    'PROCESS_START_FAILED', 'HARNESS_FAILED', 'PLATFORM_UNSUPPORTED', 'PROCESS_EXIT_UNCONFIRMED', 'PIPE_EOF_TIMEOUT']);
const safeReasons = new Set(['FIXTURE_DEADLINE', 'STARTUP_FAILED', 'TEMP_PROFILE_CLEANUP_FAILED',
    'INCOMPLETE', 'PROTOTYPE_ACTION_FAILED', 'NETWORK_TIMEOUT', 'NETWORK_ERROR', 'WS_PROXY_UNSUPPORTED',
    'INFO_STREAM_FAILED', 'CANCELLED', 'SESSION_CLEAR_FAILED']);

function normalize(raw, {sourceCommit, runId, archiveHash, launchState, exitCode, processExited, profileCleanupVerified}) {
    const events = [];
    for (const line of String(raw).split(/\r?\n/)) {
        if (!line.startsWith('ETE_FN_FIXTURE ') || line.length > 16384) continue;
        try { events.push(JSON.parse(line.slice('ETE_FN_FIXTURE '.length))); } catch { /* No raw diagnostics copied. */ }
    }
    const foundStages = events.filter(e => e?.kind === 'stage').map(e => e.stage);
    const bindings = events.filter(e => e?.kind === 'binding');
    const runtimes = events.filter(e => e?.kind === 'runtime');
    const results = events.filter(e => e?.kind === 'result');
    const diagnostics = events.filter(e => e?.kind === 'diagnostic').map(normalizeDiagnostic).filter(Boolean).slice(-128);
    const last = results.length === 1 ? results[0] : null;
    const safeState = launchStates.has(launchState) ? launchState : 'HARNESS_FAILED';
    const exactStages = JSON.stringify(foundStages) === JSON.stringify(stages);
    const versionMatches = runtimes.length === 1 && runtimes[0].electronVersion === expectedVersion;
    const hashVerified = archiveHash === expectedHash;
    const commit = /^[a-f0-9]{40}$/.test(sourceCommit || '') ? sourceCommit : 'UNKNOWN';
    const round = /^[a-f0-9]{32}$/.test(runId || '') ? runId : 'UNKNOWN';
    const bindingVerified = round !== 'UNKNOWN' && commit !== 'UNKNOWN' && bindings.length === 1 && bindings[0].runId === round && bindings[0].sourceCommit === commit;
    const safeChecks = Object.fromEntries(checks.map(key => [key, last?.checks?.[key] === true]));
    const declaredScope = last?.checks?.realFNConnect === 'NOT_TESTED' && last?.checks?.nativeHelperPlayback === 'NOT_TESTED' && last?.checks?.hlsDash === 'NOT_SUPPORTED';
    const cleaned = processExited === true && profileCleanupVerified === true && last?.profileCleanupOwner === 'runner';
    const passed = bindingVerified && safeState === 'COMPLETED' && exitCode === 0 && commit !== 'UNKNOWN' && hashVerified && versionMatches && exactStages &&
        last?.test === 'electron-synthetic-session' && last.result === 'PASSED' && cleaned &&
        Object.values(safeChecks).every(Boolean) && declaredScope;
    return {schemaVersion: 1, test: 'fn-connect-electron-loopback', sourceCommit: commit, runId: round, bindingVerified,
        electron: {version: expectedVersion, asset: input.asset, sha256: expectedHash, hashVerified, versionMatches},
        launchState: safeState, exitCode: Number.isInteger(exitCode) ? exitCode : null,
        stages: foundStages.filter(value => stages.includes(value)), result: passed ? 'PASSED' : 'FAILED',
        reason: passed ? null : safeState !== 'COMPLETED' ? safeState : safeReasons.has(last?.reason) ? last.reason : 'EVIDENCE_INCOMPLETE',
        checks: safeChecks, diagnostics, processExited: processExited === true, temporaryProfileRemoved: cleaned,
        realFNConnect: 'NOT_TESTED', nativeHelperPlayback: 'NOT_TESTED', hlsDash: 'NOT_SUPPORTED'};
}
// A permanent per-output claim makes the first finalization authoritative,
// including failures. Late/concurrent calls never rewrite an earlier receipt.
function finalize(raw, meta, {resultPath, statusPath}, io = fs) {
    const fixed = reason => ({passed: false, reason});
    const validOwner = value => value?.schemaVersion === 1 && value.runId === meta.runId && value.sourceCommit === meta.sourceCommit &&
        /^[a-f0-9]{32}$/.test(meta.runId || '') && /^[a-f0-9]{40}$/.test(meta.sourceCommit || '');
    let current;
    try { current = JSON.parse(io.readFileSync(statusPath, 'utf8')); } catch { return fixed('STATUS_BINDING_INVALID'); }
    if (!validOwner(current)) return fixed('STATUS_BINDING_INVALID');
    if (current.terminal === true) return fixed('FINAL_RECEIPT_ALREADY_TERMINAL');
    if (current.terminal !== false || current.stage !== 'ELECTRON_START') return fixed('STATUS_BINDING_INVALID');
    const ownerPath = statusPath + '.final-owner';
    try { io.writeFileSync(ownerPath, JSON.stringify({runId: meta.runId, sourceCommit: meta.sourceCommit}) + '\n', {flag: 'wx'}); }
    catch (error) { return fixed(error?.code === 'EEXIST' ? 'FINAL_RECEIPT_ALREADY_CLAIMED' : 'FINAL_RECEIPT_CLAIM_FAILED'); }
    const result = normalize(raw, meta);
    let receiptWritten = false, reason = result.reason;
    try { io.writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n', {flag: 'wx'}); receiptWritten = true; }
    catch { reason = 'RESULT_WRITE_FAILED'; }
    const elapsedMs = Number.isSafeInteger(meta.elapsedMs) && meta.elapsedMs >= 0 ? meta.elapsedMs : 0;
    const terminal = {schemaVersion: 1, runId: meta.runId, sourceCommit: meta.sourceCommit, stage: 'FINISHED', elapsedMs,
        terminal: true, result: receiptWritten ? result.result : 'FAILED', reason, receiptWritten,
        bindingVerified: result.bindingVerified, processExited: result.processExited, temporaryProfileRemoved: result.temporaryProfileRemoved};
    const pending = statusPath + '.final-' + meta.runId + '.tmp';
    try {
        const latest = JSON.parse(io.readFileSync(statusPath, 'utf8'));
        if (!validOwner(latest) || latest.terminal === true) return fixed('STATUS_BINDING_INVALID');
        io.writeFileSync(pending, JSON.stringify(terminal, null, 2) + '\n', {flag: 'wx'});
        io.renameSync(pending, statusPath);
    } catch { return fixed('STATUS_WRITE_FAILED'); }
    return {passed: receiptWritten && result.result === 'PASSED', reason, result};
}
if (require.main === module) {
    const [inputPath, output, sourceCommit, archiveHash, launchInput, exitText, processExited, profileCleanupVerified, runId, statusPath, elapsedText] = process.argv.slice(2);
    let launchState = launchInput;
    let outcome;
    try {
        let raw = '';
        try { raw = fs.readFileSync(inputPath, 'utf8'); } catch { launchState = 'HARNESS_FAILED'; }
        outcome = finalize(raw, {sourceCommit, runId, archiveHash, launchState, exitCode: /^-?\d+$/.test(exitText || '') ? Number(exitText) : null,
            processExited: processExited === 'true', profileCleanupVerified: profileCleanupVerified === 'true', elapsedMs: Number(elapsedText)},
            {resultPath: output, statusPath});
    } catch { outcome = {passed: false, reason: 'REPORT_FAILED'}; }
    if (outcome.result) {
        for (const value of outcome.result.stages) process.stdout.write('FN_FIXTURE_STAGE ' + value + '\n');
        for (const value of outcome.result.diagnostics) process.stdout.write('FN_FIXTURE_DIAGNOSTIC ' + JSON.stringify(value) + '\n');
    }
    process.stdout.write('FN_FIXTURE_RESULT ' + (outcome.passed ? 'PASSED' : 'FAILED ' + (outcome.reason || 'REPORT_FAILED')) + '\n');
    process.exitCode = outcome.passed ? 0 : 1;
}
module.exports = {normalize, finalize, stages, checks, expectedVersion, expectedHash};
