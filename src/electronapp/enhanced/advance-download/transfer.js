'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');
const probe = require('./source-probe');
const {inspectResponse, finishResponse} = require('./response-contract');
const fail = probe.failure;
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
const cancelled = signal => {if (signal?.aborted) throw fail('cancelled');};

function physicalRoot(directory) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw fail('directory-invalid');
    const resolved = path.resolve(directory), actual = fs.realpathSync.native(resolved);
    if ((process.platform === 'win32' ? actual.toLowerCase() !== resolved.toLowerCase() : actual !== resolved) ||
        !fs.lstatSync(resolved).isDirectory() || fs.lstatSync(resolved).isSymbolicLink()) throw fail('directory-invalid');
    return actual;
}
function filename(title) {
    let name = String(title || 'Video').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').replace(/[ .]+$/, '').slice(0, 100).replace(/[ .]+$/, '');
    if (!name || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = 'Video_' + name;
    return name;
}
async function openResponse(source, offset, signal) {
    cancelled(signal);
    const url = probe.sourceUrl(source.url);
    const headers = {...source.headers, 'Accept-Encoding': 'identity', Connection: 'close'};
    if (offset > 0) {headers.Range = 'bytes=' + offset + '-'; headers['If-Range'] = source.etag;}
    else if (source.etag) headers['If-Match'] = source.etag;
    let request, response, abort;
    let closed;
    const done = new Promise(resolve => {closed = resolve;});
    try {
        const incoming = await new Promise((resolve, reject) => {
            request = (url.protocol === 'https:' ? https : http).request(url, {method: 'GET', headers, agent: false});
            abort = () => {response?.destroy(); request.destroy(fail('cancelled'));};
            request.once('close', closed);
            request.once('error', () => reject(fail(signal?.aborted ? 'cancelled' : 'network-failed')));
            request.once('response', value => {response = value; response.on('error', () => {}); resolve(value);});
            request.setTimeout(30000, () => request.destroy(fail('timeout')));
            signal?.addEventListener('abort', abort, {once: true});
            if (signal?.aborted) abort();
            request.end();
        });
        return {response: incoming, async close() {
            incoming.destroy(); request.destroy(); await done;
            signal?.removeEventListener('abort', abort);
        }};
    } catch (error) {
        request?.destroy(); if (request) await done;
        signal?.removeEventListener('abort', abort);
        throw error;
    }
}

async function download({session, source: initial, directory, signal, onProgress}) {
    let handle, temporary, own, root, rootId, source = initial, offset = 0, failures = 0;
    function owned() {
        if (physicalRoot(root) !== root || !same(fs.lstatSync(root, {bigint: true}), rootId)) throw fail('directory-changed');
        const stat = fs.lstatSync(temporary, {bigint: true});
        if (!stat.isFile() || stat.isSymbolicLink() || !same(stat, own)) throw fail('temporary-changed');
    }
    function progress() {try {onProgress?.({bytes: offset, total: source.total});} catch (_) {}}
    try {
        cancelled(signal);
        if (!session || typeof session.acquire !== 'function' || !initial || !/^[a-f0-9]{64}$/.test(initial.identity) ||
            !Number.isSafeInteger(initial.total) || initial.total < 1 || !/^(?:mkv|mp4|mov|webm|avi|mpg|ts|m2ts|flv|wmv)$/.test(initial.extension)) throw fail('invalid-source');
        root = physicalRoot(directory); rootId = fs.lstatSync(root, {bigint: true});
        temporary = path.join(root, '.ete-media-' + crypto.randomBytes(16).toString('hex') + '.part');
        handle = await fs.promises.open(temporary, 'wx+', 0o600); own = await handle.stat({bigint: true});
        cancelled(signal); progress();
        while (offset < source.total) {
            cancelled(signal);
            let connection, plan, receivedBytes = 0;
            try {
                if (offset > 0 && (!source.resumeVerified || !source.etag)) throw fail('resume-unavailable');
                connection = await openResponse(source, offset, signal);
                const response = connection.response;
                plan = inspectResponse({offset, total: source.total, ...(source.etag ? {etag: source.etag} : {})}, response);
                if (plan.action !== 'receive') throw fail(plan.reason);
                for await (const chunk of response) {
                    cancelled(signal);
                    if (receivedBytes + chunk.length > plan.expectedBytes) throw fail('body-overlong');
                    let written = 0;
                    while (written < chunk.length) {
                        cancelled(signal);
                        const result = await handle.write(chunk, written, chunk.length - written, offset);
                        if (!Number.isSafeInteger(result.bytesWritten) || result.bytesWritten <= 0) throw fail('write-stalled');
                        written += result.bytesWritten; offset += result.bytesWritten;
                    }
                    receivedBytes += chunk.length; progress();
                }
                if (finishResponse(plan, {receivedBytes, messageComplete: response.complete}).action !== 'body-accepted') throw fail('body-incomplete');
            } catch (error) {
                if (connection) {await connection.close(); connection = null;}
                cancelled(signal);
                if (['ENOSPC', 'EDQUOT'].includes(error.code)) throw fail('disk-full');
                if (['EACCES', 'EPERM', 'EROFS'].includes(error.code)) throw fail('directory-unwritable');
                if (++failures > 2) throw fail(probe.reasonOf(error));
                const next = await session.acquire(signal);
                cancelled(signal);
                if (next.identity !== initial.identity || next.total !== initial.total || initial.etag && next.etag !== initial.etag) throw fail('representation-changed');
                source = next;
                if (offset > 0 && (offset >= initial.total || !initial.etag || !next.resumeVerified || next.etag !== initial.etag || probe.reasonOf(error) === 'range-ignored')) {
                    await handle.truncate(0); offset = 0; progress();
                }
            } finally {if (connection) await connection.close();}
        }
        cancelled(signal);
        const stat = await handle.stat();
        if (stat.size !== initial.total || offset !== initial.total) throw fail('length-mismatch');
        const prefix = Buffer.alloc(Math.min(65536, stat.size));
        let read = 0;
        while (read < prefix.length) {
            const part = await handle.read(prefix, read, prefix.length - read, read);
            if (!part.bytesRead) throw fail('body-incomplete');
            read += part.bytesRead;
        }
        if (probe.mediaExtension(prefix, initial.extension) !== initial.extension) throw fail('representation-changed');
        await handle.sync(); await handle.close(); handle = null;
        cancelled(signal); owned();
        const name = filename(initial.title);
        // Atomic no-replace publication. Existing downloads and unrelated files
        // survive even if a same-name file appears between selection and commit.
        for (let index = 0; index < 1000; index++) {
            cancelled(signal); owned();
            const fileName = name + (index ? ' (' + index + ')' : '') + '.' + initial.extension;
            try {
                await fs.promises.link(temporary, path.join(root, fileName));
                return {status: 'downloaded', directory: root, fileName, size: initial.total};
            } catch (error) {if (error.code !== 'EEXIST') throw error;}
        }
        throw fail('file-exists');
    } catch (error) {
        cancelled(signal);
        if (['ENOSPC', 'EDQUOT'].includes(error.code)) throw fail('disk-full');
        if (['EACCES', 'EPERM', 'EROFS'].includes(error.code)) throw fail('directory-unwritable');
        throw fail(probe.reasonOf(error));
    } finally {
        try {if (handle) await handle.close();}
        finally {try {if (own) {owned(); await fs.promises.unlink(temporary);}} catch (_) {}}
    }
}

module.exports = {download};
