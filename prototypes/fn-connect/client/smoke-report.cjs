'use strict';

const fs = require('node:fs');
const expectedVersion = '44.4.2';
const expectedHash = '6aae435b6cd5c0eedf9fd38824bae4045ffdaecd029f0b8c8328bac3f5b71f03';
const stages = ['APP_CODE_STARTED', 'APP_READY', 'PANEL_READY', 'BOOTSTRAP', 'HTTP_SESSION',
    'REDIRECT_SEPARATION', 'WEBSOCKET_SESSION', 'CANCELLATION', 'PROFILE_CLOSE', 'EXPIRY', 'DRAINED'];
const checks = ['bootstrap', 'isolatedSessions', 'httpSessionCookie', 'range206', 'range416',
    'externalRedirectCredentialSeparation', 'credentialLocationRejected', 'websocketSessionCookie',
    'websocketRawBytes', 'pendingWebSocketCancelled', 'pendingHeadersCancelled', 'streamCancelled',
    'profileCloseClearsCookies', 'profileCloseRetiresSockets', 'profileCloseRetiresStreams', 'expiryRetiresLeases',
    'sandboxedControlRenderer', 'isolatedControlRenderer'];
const launchStates = new Set(['COMPLETED', 'TIMEOUT', 'DOWNLOAD_FAILED', 'HASH_MISMATCH', 'EXTRACT_FAILED',
    'PROCESS_START_FAILED', 'HARNESS_FAILED', 'PLATFORM_UNSUPPORTED', 'PROCESS_EXIT_UNCONFIRMED', 'PIPE_EOF_TIMEOUT']);
const safeReasons = new Set(['FIXTURE_DEADLINE', 'STARTUP_FAILED', 'TEMP_PROFILE_CLEANUP_FAILED',
    'INCOMPLETE', 'PROTOTYPE_ACTION_FAILED', 'NETWORK_TIMEOUT', 'NETWORK_ERROR', 'WS_PROXY_UNSUPPORTED',
    'INFO_STREAM_FAILED', 'CANCELLED', 'SESSION_CLEAR_FAILED']);

function normalize(raw, {sourceCommit, archiveHash, launchState, exitCode, processExited, profileCleanupVerified}) {
    const events = [];
    for (const line of String(raw).split(/\r?\n/)) {
        if (!line.startsWith('ETE_FN_FIXTURE ') || line.length > 16384) continue;
        try { events.push(JSON.parse(line.slice('ETE_FN_FIXTURE '.length))); } catch { /* No raw diagnostics copied. */ }
    }
    const foundStages = events.filter(e => e?.kind === 'stage').map(e => e.stage);
    const runtimes = events.filter(e => e?.kind === 'runtime');
    const results = events.filter(e => e?.kind === 'result');
    const last = results.length === 1 ? results[0] : null;
    const safeState = launchStates.has(launchState) ? launchState : 'HARNESS_FAILED';
    const exactStages = JSON.stringify(foundStages) === JSON.stringify(stages);
    const versionMatches = runtimes.length === 1 && runtimes[0].electronVersion === expectedVersion;
    const hashVerified = archiveHash === expectedHash;
    const commit = /^[a-f0-9]{40}$/.test(sourceCommit || '') ? sourceCommit : 'UNKNOWN';
    const safeChecks = Object.fromEntries(checks.map(key => [key, last?.checks?.[key] === true]));
    const declaredScope = last?.checks?.realFNConnect === 'NOT_TESTED' && last?.checks?.nativeHelperPlayback === 'NOT_TESTED' && last?.checks?.hlsDash === 'NOT_SUPPORTED';
    const cleaned = processExited === true && profileCleanupVerified === true && last?.profileCleanupOwner === 'runner';
    const passed = safeState === 'COMPLETED' && exitCode === 0 && commit !== 'UNKNOWN' && hashVerified && versionMatches && exactStages &&
        last?.test === 'electron-synthetic-session' && last.result === 'PASSED' && cleaned &&
        Object.values(safeChecks).every(Boolean) && declaredScope;
    return {schemaVersion: 1, test: 'fn-connect-electron-loopback', sourceCommit: commit,
        electron: {version: expectedVersion, asset: 'electron-v44.4.2-win32-x64.zip', sha256: expectedHash, hashVerified, versionMatches},
        launchState: safeState, exitCode: Number.isInteger(exitCode) ? exitCode : null,
        stages: foundStages.filter(value => stages.includes(value)), result: passed ? 'PASSED' : 'FAILED',
        reason: passed ? null : safeState !== 'COMPLETED' ? safeState : safeReasons.has(last?.reason) ? last.reason : 'EVIDENCE_INCOMPLETE',
        checks: safeChecks, processExited: processExited === true, temporaryProfileRemoved: cleaned,
        realFNConnect: 'NOT_TESTED', nativeHelperPlayback: 'NOT_TESTED', hlsDash: 'NOT_SUPPORTED'};
}
if (require.main === module) {
    const [input, output, sourceCommit, archiveHash, launchState, exitText, processExited, profileCleanupVerified] = process.argv.slice(2);
    const raw = fs.existsSync(input) ? fs.readFileSync(input, 'utf8') : '';
    const result = normalize(raw, {sourceCommit, archiveHash, launchState, exitCode: /^-?\d+$/.test(exitText || '') ? Number(exitText) : null,
        processExited: processExited === 'true', profileCleanupVerified: profileCleanupVerified === 'true'});
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
    for (const value of result.stages) process.stdout.write('FN_FIXTURE_STAGE ' + value + '\n');
    process.stdout.write('FN_FIXTURE_RESULT ' + result.result + (result.reason ? ' ' + result.reason : '') + '\n');
    process.exitCode = result.result === 'PASSED' ? 0 : 1;
}
module.exports = {normalize, stages, checks, expectedVersion, expectedHash};
