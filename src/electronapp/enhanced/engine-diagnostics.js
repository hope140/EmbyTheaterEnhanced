'use strict';

// Second boundary after the native scrubber. Keep fault descriptions and local
// media paths, but never transport credentials or complete remote locators.
function sanitizeEngineText(value) {
    return String(value || '').replace(/\\(["'])/g, '$1')
        .replace(/\b(?:proxy-authorization|authorization|set-cookie|cookie)\s*[=:][^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*/gi, '[credential header removed]')
        .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
        .replace(/[a-z][a-z0-9+.-]{1,15}:\/\/[^\s"'<>]+/gi, function (url) {
            try { const u = new URL(url); return u.protocol + '//' + u.host + '/[remote-path]'; }
            catch (_) { return '[remote-url]'; }
        })
        .replace(/((?:token|api[_-]?key|password|secret|credential|signature|sig|pickcode)["']?\s*[:=]\s*)(["'])(.*?)\2/gi, '$1$2[REDACTED]$2')
        .replace(/((?:token|api[_-]?key|password|secret|credential|signature|sig|pickcode)["']?\s*[:=]\s*["']?)[^\s,;"'&]+/gi, '$1[REDACTED]')
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').slice(0, 512);
}

function projectEngineSnapshot(value) {
    try {
        if (!value || !['normal', 'detailed'].includes(value.mode) ||
            !['startup', 'playing', 'eof', 'timeout', 'retired'].includes(value.phase) ||
            !Number.isSafeInteger(value.candidateGenerationId) || value.candidateGenerationId < 1 ||
            !Number.isSafeInteger(value.snapshotSequence) || value.snapshotSequence < 1 ||
            !Number.isSafeInteger(value.dropped) || value.dropped < 0 ||
            !Array.isArray(value.records) || value.records.length > 64) return null;
        const records = value.records.map(function (row) {
            if (!row || !Number.isSafeInteger(row.sequence) || row.sequence < 1 ||
                !Number.isSafeInteger(row.monotonicMicros) || row.monotonicMicros < 0 ||
                typeof row.module !== 'string' || row.module.length > 64 || !/^[A-Za-z0-9_./-]+$/.test(row.module) ||
                !['fatal', 'error', 'warn', 'info', 'v', 'debug'].includes(row.level) ||
                typeof row.message !== 'string' || Buffer.byteLength(row.message, 'utf8') > 2048) throw Error('invalid-engine-record');
            return {sequence: row.sequence, monotonicMicros: row.monotonicMicros, module: row.module,
                level: row.level, message: sanitizeEngineText(row.message)};
        });
        return {mode: value.mode, phase: value.phase, candidateGenerationId: value.candidateGenerationId,
            snapshotSequence: value.snapshotSequence, dropped: value.dropped, records};
    } catch (_) { return null; }
}
module.exports = {sanitizeEngineText, projectEngineSnapshot};
