'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {inspectResponse, finishResponse} = require('../src/electronapp/enhanced/advance-download/response-contract');
const request = (overrides = {}) => ({offset: 4, total: 8, etag: '"original"', ...overrides});
const response = (overrides = {}) => ({statusCode: 206, headers: {
    'content-range': 'bytes 4-7/8', 'content-length': '4', etag: '"original"', ...overrides
}});
const reject = (value, reason) => assert.deepEqual(value, {action: 'reject', reason});

test('a full original response and a matching tail are structurally accepted', () => {
    const full = inspectResponse({offset: 0, total: 8}, {statusCode: 200, headers: {'Content-Length': '8'}});
    assert.equal(full.action, 'receive');
    assert.deepEqual(finishResponse(full, {receivedBytes: 8, messageComplete: true}),
        {action: 'body-accepted', nextOffset: 8, representationEndReached: true});
    const tail = inspectResponse(request(), response());
    assert.equal(tail.offset, 4);
    assert.equal(tail.expectedBytes, 4);
    assert.equal(tail.etag, '"original"');
    assert.equal(finishResponse(tail, {receivedBytes: 4, messageComplete: true}).representationEndReached, true);
    assert.ok(Object.isFrozen(tail));
});

test('a bounded partial response is not a complete representation', () => {
    const part = inspectResponse(request(), response({'content-range': 'bytes 4-5/8', 'content-length': '2'}));
    assert.deepEqual(finishResponse(part, {receivedBytes: 2, messageComplete: true}),
        {action: 'body-accepted', nextOffset: 6, representationEndReached: false});
});

test('missing content length still requires the exact range length and a clean message end', () => {
    const headers = response().headers;
    delete headers['content-length'];
    const plan = inspectResponse(request(), {statusCode: 206, headers});
    assert.equal(plan.expectedBytes, 4);
    assert.equal(finishResponse(plan, {receivedBytes: 4, messageComplete: true}).action, 'body-accepted');
    for (const receivedBytes of [0, 3, 5, NaN, Infinity, '4']) {
        reject(finishResponse(plan, {receivedBytes, messageComplete: true}), 'body-incomplete');
    }
    reject(finishResponse(plan, {receivedBytes: 4, messageComplete: false}), 'body-incomplete');
});

test('a server ignoring resume Range requires an explicit fresh transfer decision', () => {
    assert.deepEqual(inspectResponse(request(), {statusCode: 200, headers: {'content-length': '8'}}),
        {action: 'restart-required', reason: 'range-ignored'});
    assert.deepEqual(inspectResponse(request({etag: undefined}), response()),
        {action: 'restart-required', reason: 'validator-unavailable'});
});

test('the same item and same length do not allow appending a changed representation', () => {
    reject(inspectResponse(request(), response({etag: '"replacement"'})), 'representation-changed');
    reject(inspectResponse(request(), response({'content-range': 'bytes 4-7/9'})), 'representation-changed');
    const headers = response().headers;
    delete headers.etag;
    reject(inspectResponse(request(), {statusCode: 206, headers}), 'representation-changed');
});

test('weak and malformed validators never authorize appending', () => {
    for (const etag of ['W/"original"', 'original', '"line\r\nbreak"', null, '"' + 'x'.repeat(1024) + '"']) {
        reject(inspectResponse(request({etag}), response()), 'invalid-request');
    }
    // A weak tag on a new full download is not promoted to a strong validator.
    const plan = inspectResponse({offset: 0, total: 8}, {statusCode: 200, headers: {etag: 'W/"new"'}});
    assert.equal(plan.action, 'receive');
    assert.equal(plan.etag, null);
});

test('invalid, overflowing and mismatched ranges never provide a write plan', () => {
    for (const range of ['bytes 0-7/8', 'bytes 5-7/8', 'bytes 4-3/8', 'bytes 4-8/8',
        'bytes 4-7/*', 'bytes */8', 'bytes 04-7/8', 'bytes 4-7/9007199254740993',
        'bytes 4-9007199254740993/9007199254740994', 'bytes 4-7/8, bytes 4-7/8']) {
        reject(inspectResponse(request(), response({'content-range': range})), 'invalid-range');
    }
});

test('invalid length, encoded bytes and multipart bodies are refused', () => {
    for (const length of ['3', '5', '-4', '04', '4, 4', '9007199254740993', '']) {
        reject(inspectResponse(request(), response({'content-length': length})), 'length-mismatch');
    }
    reject(inspectResponse(request(), response({'content-encoding': 'gzip'})), 'encoding-unsupported');
    reject(inspectResponse(request(), response({'content-type': 'multipart/byteranges; boundary=fixture'})), 'multipart-unsupported');
    assert.equal(inspectResponse(request(), response({'content-encoding': 'Identity'})).action, 'receive');
});

test('authentication, redirects and 416 never declare an existing partial file complete', () => {
    for (const [statusCode, reason] of [[401, 'auth-required'], [403, 'auth-required'], [302, 'redirect'],
        [307, 'redirect'], [416, 'range-unsatisfied'], [404, 'unexpected-status'], [500, 'unexpected-status']]) {
        reject(inspectResponse(request(), {statusCode, headers: {'content-range': 'bytes */8'}}), reason);
    }
});

test('ambiguous or non-string critical headers are refused without echoing their contents', () => {
    for (const headers of [{ETag: '"other"'}, {'content-length': ['4']}, {'content-encoding': 'identity\r\nsecret-canary'},
        {'content-range': undefined}]) {
        const result = inspectResponse(request(), response(headers));
        reject(result, 'invalid-headers');
        assert.ok(!JSON.stringify(result).includes('secret-canary'));
    }
});

test('invalid requests and full-offset guesses do not become completion records', () => {
    for (const input of [null, request({offset: -1}), request({offset: 8}), request({offset: 9}),
        request({offset: '4'}), request({total: 0}), request({total: Number.MAX_SAFE_INTEGER + 1})]) {
        reject(inspectResponse(input, response()), 'invalid-request');
    }
    reject(inspectResponse(request(), {statusCode: 206}), 'invalid-headers');
    reject(inspectResponse(request(), {statusCode: '206', headers: {}}), 'invalid-response');
    reject(inspectResponse({offset: 0, total: 8}, {statusCode: 200, headers: {'content-range': 'bytes 0-7/8'}}), 'unexpected-range');
    reject(finishResponse({action: 'receive', expectedBytes: 4, nextOffset: 8, total: 8},
        {receivedBytes: 4, messageComplete: true}), 'invalid-plan');
});
