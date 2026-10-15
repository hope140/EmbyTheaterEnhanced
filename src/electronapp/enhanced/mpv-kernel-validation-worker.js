'use strict';

const {parentPort} = require('node:worker_threads');
const packageValidator = require('./mpv-kernel-package');

function fail(code) {
    parentPort.postMessage({ok: false, code});
    parentPort.close();
}

function asBuffer(value) {
    if (!(value instanceof Uint8Array)) throw new Error('validation-input-invalid');
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

function transferableCopy(buffer) {
    const view = new Uint8Array(buffer.length);
    view.set(buffer);
    return view;
}

parentPort.once('message', message => {
    try {
        if (!message || !['archive', 'members'].includes(message.kind) || !message.payload ||
            message.payload.kind !== message.kind || !message.expectedHelperIdentity) throw new Error('validation-input-invalid');
        let result;
        if (message.kind === 'archive') {
            result = packageValidator.validateCandidateArchive(asBuffer(message.payload.bytes), message.expectedHelperIdentity);
        } else {
            const members = {};
            for (const name of ['candidate.json', 'mpv-1.dll', 'SOURCE.txt', 'NOTICE.txt']) {
                members[name] = asBuffer(message.payload.members && message.payload.members[name]);
            }
            result = packageValidator.validateCandidateMembers(members, message.expectedHelperIdentity);
        }
        const outputMembers = {};
        const transferList = [];
        for (const name of ['candidate.json', 'mpv-1.dll', 'SOURCE.txt', 'NOTICE.txt']) {
            const view = transferableCopy(result.members[name]);
            outputMembers[name] = view;
            transferList.push(view.buffer);
        }
        parentPort.postMessage({
            ok: true,
            result: {
                candidateId: result.candidateId,
                metadata: result.metadata,
                checks: result.checks,
                members: outputMembers
            }
        }, transferList);
        parentPort.close();
    } catch (error) {
        const code = error && typeof error.code === 'string' && /^[a-z0-9-]{1,48}$/.test(error.code)
            ? error.code
            : 'validation-worker-failed';
        fail(code);
    }
});
