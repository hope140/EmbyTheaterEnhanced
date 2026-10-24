'use strict';
// Never publish raw helper stderr. Fixed native labels and numeric codes only.
const LABELS = new Set(['invalid-parent-window', 'surface-create-failed', 'dll-load-failed', 'mpv-create-failed', 'mpv-initialize-failed']);
function summarize(chunks, observedBytes, exit, streamsClosed) {
    const bytes = Buffer.concat(chunks || []).subarray(-65536), labels = new Set(), systemCodes = new Set(); let unknownFatal = false;
    for (const line of bytes.toString('utf8').split(/\r?\n/)) {
        if (line.startsWith('helper-fatal:')) {
            const text = line.slice('helper-fatal:'.length);
            const extended = /^dll-load-failed:win32-([0-9]{1,10}):target-file-[01]:absolute-[01]:chars-[0-9]{1,6}:forward-slashes-[01]$/.exec(text);
            if (extended && Number(extended[1]) <= 0xffffffff) {labels.add('dll-load-failed'); systemCodes.add(Number(extended[1]));}
            else if (LABELS.has(text)) labels.add(text);
            else if (text.startsWith('missing-export:')) labels.add('missing-export');
            else if (text.startsWith('option-failed:')) labels.add('option-failed');
            else unknownFatal = true;
        }
        const code = /^(?:helper-system-code|win32-error):([0-9]{1,10})$/.exec(line);
        if (code && Number(code[1]) <= 0xffffffff) systemCodes.add(Number(code[1]));
    }
    return {labels: [...labels].sort(), unknownFatal, systemCodes: [...systemCodes].sort((a, b) => a - b), systemCodeAvailable: systemCodes.size > 0,
        processExitCode: Number.isSafeInteger(exit?.code) && exit.code >= -2147483648 && exit.code <= 0xffffffff ? exit.code : null, processSignaled: typeof exit?.signal === 'string' && exit.signal.length > 0, processSignal: ['SIGTERM', 'SIGKILL', 'SIGABRT'].includes(exit?.signal) ? exit.signal : null,
        retainedBytes: bytes.length, observedBytes: Number.isSafeInteger(observedBytes) && observedBytes >= 0 ? observedBytes : bytes.length,
        streamsClosed: streamsClosed === true};
}
async function capture(client, closeTimeoutMs = 2000) {
    const exit = await client.exitPromise;
    let timer;
    const closed = await Promise.race([client.smokeClosePromise ? client.smokeClosePromise.then(() => true) : Promise.resolve(false),
        new Promise(resolve => {timer = setTimeout(() => resolve(false), closeTimeoutMs);})]); clearTimeout(timer);
    return summarize(client.stderrChunks, client.stderrObservedBytes, exit, closed);
}
function normalExit(diagnostic) {return diagnostic?.streamsClosed === true && diagnostic.processExitCode === 0 && diagnostic.processSignaled === false && diagnostic.processSignal === null;}
function isLoaderFailure(receipt) {
    return receipt?.status === 'failed' && receipt.phase === 'startup' && receipt.helpers?.length === 1 && receipt.helpers.every(helper =>
        Number.isInteger(helper.pid) && helper.pid > 0 && helper.exited === true && helper.handshake === null && helper.diagnostics?.streamsClosed === true &&
        helper.diagnostics.processExitCode === 23 && helper.diagnostics.processSignaled === false && helper.diagnostics.labels.length === 1 && helper.diagnostics.labels[0] === 'dll-load-failed' && helper.diagnostics.unknownFatal === false);
}
module.exports = {summarize, capture, normalExit, isLoaderFailure};
