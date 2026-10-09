'use strict';

const fs = require('fs');
const path = require('path');
const {fileURLToPath} = require('url');
const {createRecorder} = require('./bounded-diagnostics');
const TYPES = new Set(['Error', 'ReferenceError', 'TypeError', 'SyntaxError', 'RangeError', 'URIError', 'EvalError', 'AggregateError']);
const KINDS = new Set(['reference-not-defined', 'type-error', 'syntax-error', 'UNAVAILABLE']);
const EVENTS = new Set(['global-error', 'unhandled-rejection']);

function text(value, limit) { return typeof value === 'string' ? value.slice(0, limit) : ''; }
function position(value) { return Number.isSafeInteger(value) && value > 0 && value <= 10000000 ? value : null; }

function createProjector(appRoot) {
    const root = path.resolve(appRoot || path.join(__dirname, '..'));
    function script(value) {
        try {
            let location = text(value, 2048);
            if (!location || location === 'UNAVAILABLE' || /[?#\x00-\x1f]/.test(location)) return 'UNAVAILABLE';
            if (/^file:/i.test(location)) location = fileURLToPath(location);
            else if (/^[a-z]+:/i.test(location) && !/^[a-z]:[\\/]/i.test(location)) return 'UNAVAILABLE';
            const absolute = path.resolve(root, location);
            const relative = path.relative(root, absolute).replace(/\\/g, '/');
            // Only installed package scripts are useful callsites. Arbitrary
            // sourceURL names, remote URLs and user filesystem paths are omitted.
            if (!relative || relative.length > 240 || relative.startsWith('../') || path.isAbsolute(relative) ||
                !/^[A-Za-z0-9_./-]+\.(?:js|cjs)$/.test(relative) || !fs.statSync(absolute).isFile()) return 'UNAVAILABLE';
            const realRelative = path.relative(fs.realpathSync(root), fs.realpathSync(absolute));
            if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) return 'UNAVAILABLE';
            return relative;
        } catch (_) { return 'UNAVAILABLE'; }
    }
    function frame(value) {
        const name = script(value && value.script);
        return {script: name, line: name === 'UNAVAILABLE' ? null : position(value.line),
            column: name === 'UNAVAILABLE' ? null : position(value.column)};
    }
    return function project(input) {
        const value = input || {};
        return {errorType: TYPES.has(value.errorType) ? value.errorType : 'UNAVAILABLE',
            messageKind: KINDS.has(value.messageKind) ? value.messageKind : 'UNAVAILABLE',
            location: frame(value.location),
            frames: Array.isArray(value.frames) ? value.frames.slice(0, 8).map(frame) : []};
    };
}

function capture(event, rejection, project) {
    const error = rejection ? event && event.reason : event && event.error;
    const errorType = TYPES.has(error && error.name) ? error.name : 'UNAVAILABLE';
    const message = text(error && error.message || event && event.message, 1024);
    const stack = text(error && error.stack, 8192);
    const frames = [];
    for (const line of stack.split(/\r?\n/).slice(1, 17)) {
        const match = line.match(/(?:\(|\s)([^()]+):(\d+):(\d+)\)?$/);
        if (match) frames.push({script: match[1].trim().replace(/^at\s+/, ''), line: Number(match[2]), column: Number(match[3])});
        if (frames.length === 8) break;
    }
    return project({errorType,
        messageKind: errorType === 'ReferenceError' && / is not defined$/.test(message) ? 'reference-not-defined' :
            errorType === 'TypeError' ? 'type-error' : errorType === 'SyntaxError' ? 'syntax-error' : 'UNAVAILABLE',
        location: {script: event && event.filename, line: event && event.lineno, column: event && event.colno}, frames});
}

function createReceiver(logger, options) {
    const project = createProjector(options && options.appRoot);
    const emit = createRecorder(logger, 'renderer', 20, options);
    return function receive(record) {
        try {
            if (record && record.event === 'diagnostics-suppressed') {
                emit('diagnostics-suppressed', {reason: 'rate-limit', limitPerMinute: 20}, true);
                return;
            }
            if (!record || !EVENTS.has(record.event)) return;
            emit(record.event, project(record.details), true);
        } catch (_) { /* Reject malformed diagnostic input without side effects. */ }
    };
}

function install(window, send, options) {
    try {
        if (!window || typeof window.addEventListener !== 'function' || window.top && window.top !== window) return function () {};
        const project = createProjector(options && options.appRoot);
        const emit = createRecorder(send, 'renderer', 20, options);
        function report(event, rejection) {
            try { emit(rejection ? 'unhandled-rejection' : 'global-error', capture(event, rejection, project), true); }
            catch (_) { /* Includes hostile getters and cyclic rejection values. */ }
        }
        const onError = event => report(event, false);
        const onRejection = event => report(event, true);
        function dispose() {
            window.removeEventListener('error', onError);
            window.removeEventListener('unhandledrejection', onRejection);
            window.removeEventListener('unload', dispose);
        }
        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onRejection);
        window.addEventListener('unload', dispose, {once: true});
        return dispose;
    } catch (_) { return function () {}; }
}

module.exports = {createProjector, createReceiver, install};
