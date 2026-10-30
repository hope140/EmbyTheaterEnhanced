'use strict';

// Dormant transport checks only. No authentication, IO, storage, or completion publication.
const plans = new WeakSet();
const integer = value => Number.isSafeInteger(value) && value >= 0;
const strongTag = value => typeof value === 'string' && value.length <= 1024 && /^"[\x21\x23-\x7e\x80-\xff]*"$/.test(value);
const verdict = (action, reason) => Object.freeze({action, reason});

function header(headers, name) {
    const matches = Object.keys(headers).filter(key => key.toLowerCase() === name);
    if (matches.length > 1) throw Error('ambiguous-header');
    if (!matches.length) return undefined;
    const value = headers[matches[0]];
    if (typeof value !== 'string' || value.length > 4096 || /[\r\n\0]/.test(value)) throw Error('invalid-header');
    return value.trim();
}

function decimal(value) {
    if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value) || !integer(Number(value))) return null;
    return Number(value);
}

// The caller must bind this request to an authorized representation and, for an
// append, actually send Range plus If-Range with the supplied strong ETag.
function inspectResponse(request, response) {
    if (!request || !integer(request.offset) || !integer(request.total) || request.total === 0 || request.offset >= request.total ||
        request.etag !== undefined && !strongTag(request.etag)) return verdict('reject', 'invalid-request');
    if (request.offset > 0 && !strongTag(request.etag)) return verdict('restart-required', 'validator-unavailable');
    if (!response || !Number.isInteger(response.statusCode)) return verdict('reject', 'invalid-response');
    const status = response.statusCode;
    if (status === 401 || status === 403) return verdict('reject', 'auth-required');
    if (status >= 300 && status < 400) return verdict('reject', 'redirect');
    // A matching file length is not evidence that the old bytes are still valid.
    if (status === 416) return verdict('reject', 'range-unsatisfied');
    if (status !== 200 && status !== 206) return verdict('reject', 'unexpected-status');
    if (status === 200 && request.offset > 0) return verdict('restart-required', 'range-ignored');
    if (!response.headers || typeof response.headers !== 'object' || Array.isArray(response.headers)) return verdict('reject', 'invalid-headers');
    let encoding, range, length, etag, type;
    try {
        encoding = header(response.headers, 'content-encoding');
        range = header(response.headers, 'content-range');
        length = header(response.headers, 'content-length');
        etag = header(response.headers, 'etag');
        type = header(response.headers, 'content-type');
    } catch (_) {return verdict('reject', 'invalid-headers');}
    if (encoding !== undefined && encoding.toLowerCase() !== 'identity') return verdict('reject', 'encoding-unsupported');
    if (type !== undefined && /^multipart\/byteranges(?:\s*;|$)/i.test(type)) return verdict('reject', 'multipart-unsupported');
    if (request.etag !== undefined && etag !== request.etag) return verdict('reject', 'representation-changed');
    let end = request.total - 1;
    if (status === 206) {
        const match = /^bytes (0|[1-9]\d*)-(0|[1-9]\d*)\/([1-9]\d*)$/i.exec(range || '');
        if (!match) return verdict('reject', 'invalid-range');
        const start = decimal(match[1]), last = decimal(match[2]), total = decimal(match[3]);
        if (start === null || last === null || total === null || start !== request.offset || last < start || last >= total) return verdict('reject', 'invalid-range');
        if (total !== request.total) return verdict('reject', 'representation-changed');
        end = last;
    } else if (range !== undefined) return verdict('reject', 'unexpected-range');
    const expectedBytes = end - request.offset + 1;
    if (length !== undefined && decimal(length) !== expectedBytes) return verdict('reject', 'length-mismatch');
    const plan = Object.freeze({action: 'receive', offset: request.offset, total: request.total,
        expectedBytes, nextOffset: end + 1, etag: strongTag(etag) ? etag : null});
    plans.add(plan);
    return plan;
}

// Accepts only a plan from this module for this process. A successful result is
// not a file-completion record: disk validation and publication belong elsewhere.
function finishResponse(plan, body) {
    if (!plan || !plans.has(plan)) return verdict('reject', 'invalid-plan');
    if (!body || body.messageComplete !== true || !integer(body.receivedBytes) || body.receivedBytes !== plan.expectedBytes) return verdict('reject', 'body-incomplete');
    return Object.freeze({action: 'body-accepted', nextOffset: plan.nextOffset,
        representationEndReached: plan.nextOffset === plan.total});
}

module.exports = {inspectResponse, finishResponse};
