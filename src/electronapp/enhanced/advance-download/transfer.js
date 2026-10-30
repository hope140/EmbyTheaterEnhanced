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

async function download({session, source: initial, directory, signal, onProgress, journal, onRestart, publisher = require('./publication').createPublisher()}) {
    const records = require('./task-store');
    let handle, temporary, own, root, rootId, source = initial, offset = 0, failures = 0;
    let digest = crypto.createHash('sha256'), checkpointable = false, cleanEnd = false, published = false;
    let lastCheckpoint = 0, lastCheckpointAt = Date.now();
    function owned() {
        if (physicalRoot(root) !== root || !same(fs.lstatSync(root, {bigint: true}), rootId)) throw fail('directory-changed');
        const stat = fs.lstatSync(temporary, {bigint: true});
        if (!stat.isFile() || stat.isSymbolicLink() || !same(stat, own)) throw fail('temporary-changed');
    }
    function progress() {try {onProgress?.({bytes: offset, total: source.total});} catch (_) {}}
    function restartNotice(reason) {try {onRestart?.(reason);} catch (_) {}}
    async function checkpoint(publishing = null, publishMethod) {
        if (!journal || !checkpointable) return;
        owned();
        if (handle) await handle.sync();
        journal.update({source: records.sourceRecord(source), partial: {name: path.basename(temporary),
            rootId: records.identity(rootId), fileId: records.identity(own), offset,
            sha256: digest.copy().digest('hex'), messageComplete: cleanEnd, publishing,
            ...(publishMethod ? {publishMethod} : {})}});
        lastCheckpoint = offset; lastCheckpointAt = Date.now();
    }
    async function reset(reason) {
        owned(); await handle.truncate(0);
        offset = 0; cleanEnd = false; digest = crypto.createHash('sha256'); checkpointable = true;
        restartNotice(reason); await checkpoint(); progress();
    }
    async function finishRecord(fileName, recordSource = source, expectedFileId = records.identity(own)) {
        const stat = fs.lstatSync(path.join(root, fileName), {bigint: true});
        if (!stat.isFile() || stat.isSymbolicLink() || !records.sameId(stat, expectedFileId) || Number(stat.size) !== offset) throw fail('temporary-changed');
        if (journal) journal.update({source: records.sourceRecord(recordSource), state: 'complete', reason: null,
            file: {name: fileName, rootId: records.identity(rootId), fileId: records.identity(stat),
                size: offset, mtimeNs: String(stat.mtimeNs), sha256: digest.copy().digest('hex')}});
        published = true;
        return {status: 'downloaded', directory: root, fileName, size: offset};
    }
    try {
        cancelled(signal);
        if (!session || typeof session.acquire !== 'function' || !initial || !/^[a-f0-9]{64}$/.test(initial.identity) ||
            !Number.isSafeInteger(initial.total) || initial.total < 1 || !/^(?:mkv|mp4|mov|webm|avi|mpg|ts|m2ts|flv|wmv)$/.test(initial.extension)) throw fail('invalid-source');
        root = physicalRoot(directory); rootId = fs.lstatSync(root, {bigint: true});
        const task = journal?.get(), previous = task?.partial;
        temporary = path.join(root, previous ? previous.name : records.partialName(task ? task.id : crypto.randomBytes(16).toString('hex')));
        if (previous) {
            let before, moved = false;
            try {before = fs.lstatSync(temporary, {bigint: true});}
            catch (error) {
                if (error.code !== 'ENOENT' || previous.publishMethod !== 'move' || !previous.publishing ||
                    !previous.messageComplete || previous.offset !== task.source.total) throw error;
                before = fs.lstatSync(path.join(root, previous.publishing), {bigint: true}); moved = true;
            }
            if (!records.sameId(rootId, previous.rootId) || !before.isFile() || before.isSymbolicLink() ||
                !records.sameId(before, previous.fileId) || before.nlink > (previous.publishing ? 2n : 1n)) throw fail('temporary-changed');
            handle = await fs.promises.open(moved ? path.join(root, previous.publishing) : temporary, moved ? 'r' : 'r+'); own = await handle.stat({bigint: true});
            if (!same(own, before)) throw fail('temporary-changed');
            const buffer = Buffer.alloc(262144);
            let verified = 0;
            while (verified < previous.offset && verified < Number(own.size)) {
                cancelled(signal);
                const part = await handle.read(buffer, 0, Math.min(buffer.length, previous.offset - verified), verified);
                if (!part.bytesRead) break;
                digest.update(buffer.subarray(0, part.bytesRead)); verified += part.bytesRead;
            }
            const intact = verified === previous.offset && digest.copy().digest('hex') === previous.sha256;
            offset = previous.offset; cleanEnd = previous.messageComplete && offset === task.source.total;
            if (moved) {
                // A digest alone must never authorize adopting a same-named file.
                // Root and file IDs must match the pre-move receipt above too.
                if (!intact || !cleanEnd || Number(own.size) !== offset || own.nlink !== 1n) throw fail('publication-unowned');
                return await finishRecord(previous.publishing, task.source);
            }
            // Recover a crash after no-replace publication, before metadata commit.
            // Never truncate a temporary file that is already linked to a complete user file.
            if (previous.publishing) {
                let final;
                try {final = fs.lstatSync(path.join(root, previous.publishing), {bigint: true});} catch (error) {if (error.code !== 'ENOENT') throw error;}
                if (final && same(final, own)) {
                    if (!intact || !cleanEnd || !final.isFile() || final.isSymbolicLink() || Number(final.size) !== offset) throw fail('publication-unowned');
                    checkpointable = false;
                    return await finishRecord(previous.publishing, task.source);
                }
                if (own.nlink !== 1n) throw fail('temporary-changed');
            }
            checkpointable = true;
            const sameVersion = task.source.identity === initial.identity && task.source.total === initial.total &&
                task.source.extension === initial.extension && task.source.etag === initial.etag &&
                (!task.source.prefixSha256 || task.source.prefixSha256 === initial.prefixSha256);
            if (!intact) await reset('partial-corrupt');
            else if (!sameVersion) await reset('source-changed');
            else if (!cleanEnd && (offset >= initial.total || offset > 0 && (!initial.etag || !initial.resumeVerified))) await reset('resume-unavailable');
            else {
                // A crash may leave uncommitted bytes after the durable checkpoint.
                if (Number(own.size) !== offset) {owned(); await handle.truncate(offset);}
                await checkpoint();
            }
        } else {
            handle = await fs.promises.open(temporary, 'wx+', 0o600); own = await handle.stat({bigint: true});
            checkpointable = true; await checkpoint();
        }
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
                cleanEnd = false;
                for await (const chunk of response) {
                    cancelled(signal);
                    if (receivedBytes + chunk.length > plan.expectedBytes) throw fail('body-overlong');
                    let written = 0;
                    while (written < chunk.length) {
                        cancelled(signal);
                        const result = await handle.write(chunk, written, chunk.length - written, offset);
                        if (!Number.isSafeInteger(result.bytesWritten) || result.bytesWritten <= 0) throw fail('write-stalled');
                        digest.update(chunk.subarray(written, written + result.bytesWritten));
                        written += result.bytesWritten; offset += result.bytesWritten;
                    }
                    receivedBytes += chunk.length; progress();
                    if (journal && (offset - lastCheckpoint >= 8388608 || Date.now() - lastCheckpointAt >= 1000)) await checkpoint();
                }
                if (finishResponse(plan, {receivedBytes, messageComplete: response.complete}).action !== 'body-accepted') throw fail('body-incomplete');
                cleanEnd = offset === source.total;
                await checkpoint();
            } catch (error) {
                if (connection) {await connection.close(); connection = null;}
                cancelled(signal);
                if (['ENOSPC', 'EDQUOT'].includes(error.code)) throw fail('disk-full');
                if (error.code === 'EFBIG') throw fail('file-too-large');
                if (['EACCES', 'EPERM', 'EROFS'].includes(error.code)) throw fail('directory-unwritable');
                if (++failures > 2) throw fail(probe.reasonOf(error));
                const next = await session.acquire(signal);
                cancelled(signal);
                if (next.identity !== initial.identity || next.total !== initial.total || initial.etag && next.etag !== initial.etag) throw fail('representation-changed');
                source = next;
                if (offset > 0 && (offset >= initial.total || !initial.etag || !next.resumeVerified || next.etag !== initial.etag || probe.reasonOf(error) === 'range-ignored')) await reset('resume-unavailable');
            } finally {if (connection) await connection.close();}
        }
        cancelled(signal);
        const stat = await handle.stat();
        if (!cleanEnd || stat.size !== initial.total || offset !== initial.total) throw fail('length-mismatch');
        const prefix = Buffer.alloc(Math.min(65536, stat.size));
        let read = 0;
        while (read < prefix.length) {
            const part = await handle.read(prefix, read, prefix.length - read, read);
            if (!part.bytesRead) throw fail('body-incomplete');
            read += part.bytesRead;
        }
        if (probe.mediaExtension(prefix, initial.extension) !== initial.extension || initial.prefixSha256 &&
            crypto.createHash('sha256').update(prefix.subarray(0, initial.prefixBytes || prefix.length)).digest('hex') !== initial.prefixSha256) throw fail('representation-changed');
        await checkpoint();
        await handle.sync(); await handle.close(); handle = null;
        cancelled(signal); owned();
        const name = filename(initial.title);
        for (let index = 0; index < 1000; index++) {
            cancelled(signal); owned();
            const fileName = name + (index ? ' (' + index + ')' : '') + '.' + initial.extension;
            await checkpoint(fileName);
            try {
                const before = fs.lstatSync(temporary, {bigint: true});
                const publication = await publisher({directory: root, from: path.basename(temporary), to: fileName,
                    rootId: records.identity(rootId), fileId: records.identity(own), size: offset, mtimeNs: String(before.mtimeNs)}, async () => {
                    owned(); await checkpoint(fileName, 'move');
                    checkpointable = false; // A lost reply may mean the move committed.
                });
                checkpointable = false; // Keep the publishing receipt if commit fails.
                return await finishRecord(fileName, source, publication?.fileId || records.identity(own));
            } catch (error) {if (error.code !== 'EEXIST') throw error; checkpointable = true;}
        }
        throw fail('file-exists');
    } catch (error) {
        cancelled(signal);
        if (['ENOSPC', 'EDQUOT'].includes(error.code)) throw fail('disk-full');
        if (error.code === 'EFBIG') throw fail('file-too-large');
        if (['EACCES', 'EPERM', 'EROFS'].includes(error.code)) throw fail('directory-unwritable');
        throw fail(probe.reasonOf(error));
    } finally {
        try {
            if (journal && !published && checkpointable) {try {await checkpoint();} catch (_) {}}
            if (handle) await handle.close();
        } finally {
            // Persistent tasks keep their own partial file on pause/failure.
            // Completed files are never removed, moved or replaced here.
            if (!journal || published) {try {if (own) {owned(); await fs.promises.unlink(temporary);}} catch (_) {}}
        }
    }
}

module.exports = {download};
