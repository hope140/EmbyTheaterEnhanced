'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {randomUUID, createHash} = require('node:crypto');
const probe = require('./source-probe');
const records = require('./task-store');
const {createSession} = require('./source-session');
const {download} = require('./transfer');
const owner = value => value.serverId + ':' + value.accountId;
const sameMedia = (a, b) => owner(a) === owner(b) && a.itemId === b.itemId && a.mediaSourceId === b.mediaSourceId;
const summary = task => ({id: task.id, title: task.source.title, directory: task.directory, state: task.state,
    reason: task.reason, bytes: task.state === 'complete' ? task.source.total : task.partial?.offset || 0,
    total: task.source.total, fileName: task.file?.name || null,
    targetPath: task.file ? path.join(task.directory, task.file.name) : null});

function completedFile(task) {
    if (task.state !== 'complete' || !task.file) return null;
    try {
        const root = records.physical(task.directory), stat = fs.lstatSync(path.join(root, task.file.name), {bigint: true});
        if (!records.sameId(fs.lstatSync(root, {bigint: true}), task.file.rootId) || !stat.isFile() || stat.isSymbolicLink() ||
            !records.sameId(stat, task.file.fileId) || Number(stat.size) !== task.file.size || String(stat.mtimeNs) !== task.file.mtimeNs) return null;
        return path.join(root, task.file.name);
    } catch (_) {return null;}
}

function createManager(options) {
    const store = options.store || records.createStore(options.profileRoot);
    const makeSession = options.createSession || (context => createSession(context, options.sourceDependencies));
    const transfer = options.transfer || download;
    const tasks = new Map(store.list().map(task => [task.id, task]));
    const allTasks = () => [...tasks.values()];
    const preparations = new Set();
    // Preflight failures have no verified source/receipt and never grant playback authority.
    // Keep bounded UI diagnostics for this process, without credentials or source URLs.
    const attempts = new Map();
    const changedRestarts = new Map();
    let credentials, credentialHash, active, closing = false, closingPromise;
    for (const task of allTasks()) if (['queued', 'downloading'].includes(task.state)) tasks.set(task.id, store.save({...task, state: 'paused', reason: 'app-closed'}));
    function visible(task) {return !!credentials && owner(task) === owner(credentials);}
    function emit(task, progress) {if (visible(task)) {try {options.onChange?.({...summary(task), ...(progress || {})});} catch (_) {}}}
    function update(id, patch) {
        const task = store.get(id);
        if (!task) throw probe.failure('task-unavailable');
        const next = store.save({...task, ...patch}); tasks.set(id, next); emit(next); return next;
    }
    function list(context) {return [...allTasks().filter(task => owner(task) === owner(context)).map(summary),
        ...[...attempts.values()].filter(task => owner(task) === owner(context)).map(({itemId, mediaSourceId, serverId, accountId, ...value}) => value)];}
    function kick() {
        if (closing || active || !credentials) return;
        const task = allTasks().find(value => value.state === 'queued' && visible(value));
        if (!task) return;
        const operation = {id: task.id, controller: new AbortController(), credential: {...credentials}, pauseReason: 'app-closed'};
        active = operation;
        operation.done = (async () => {
            let session;
            try {
                update(task.id, {state: 'downloading', reason: task.reason});
                session = makeSession({...operation.credential, itemId: task.itemId, mediaSourceId: task.mediaSourceId});
                const source = await session.acquire(operation.controller.signal);
                if (closing || operation.controller.signal.aborted) throw probe.failure('cancelled');
                await transfer({session, source, directory: task.directory, signal: operation.controller.signal,
                    journal: {get: () => store.get(task.id), update: patch => update(task.id, patch)},
                    onProgress: progress => emit(store.get(task.id), progress),
                    onRestart: reason => update(task.id, {reason: reason + '-restarting'})});
            } catch (error) {
                const reason = probe.reasonOf(error);
                const current = store.get(task.id);
                if (current?.state !== 'complete') {
                    if (operation.controller.signal.aborted || closing) {
                        update(task.id, {state: credentials && owner(credentials) === owner(task) && !closing ? 'queued' : 'paused', reason: operation.pauseReason});
                    } else if (reason === 'representation-changed' && (changedRestarts.get(task.id) || 0) < 2) {
                        changedRestarts.set(task.id, (changedRestarts.get(task.id) || 0) + 1);
                        update(task.id, {state: 'queued', reason: 'source-changed-restarting'});
                    } else update(task.id, {state: 'failed', reason});
                }
            } finally {
                await session?.close();
            }
        })().catch(() => {try {options.onFailure?.('task-store-unavailable');} catch (_) {}}).finally(() => {
            if (active === operation) active = null;
            queueMicrotask(kick);
        });
    }
    function attach(context) {
        if (closing) return;
        // Validation is performed by the source session before any media write;
        // contexts are supplied only by the trusted current renderer account.
        const value = {serverId: context.serverId, accountId: context.accountId, serverAddress: context.serverAddress, token: context.token};
        if (!value.serverId || !value.accountId || !value.token) return;
        const signature = createHash('sha256').update(JSON.stringify(value)).digest('hex');
        if (signature === credentialHash) return;
        for (const operation of preparations) operation.controller.abort();
        if (active) {active.pauseReason = credentials && owner(value) === owner(credentials) ? 'credentials-changed' : 'account-changed'; active.controller.abort();}
        credentials = value; credentialHash = signature;
        for (const task of allTasks()) if (visible(task) && task.state === 'paused' && ['app-closed', 'account-changed', 'credentials-changed'].includes(task.reason)) update(task.id, {state: 'queued', reason: null});
        kick();
    }
    async function enqueue(context) {
        if (closing) return {status: 'cancelled'};
        attach(context);
        const operation = {controller: new AbortController(), networkDone: Promise.resolve()};
        let releaseNetwork = () => {}, selected, attempt;
        preparations.add(operation);
        let session, source;
        try {
            // Pick/confirm the user's destination before any potentially failing network preflight.
            // Shutdown must not wait for a native picker owned by the OS.
            selected = context.retryDirectory ? {status: 'selected', directory: context.retryDirectory} :
                await options.selectDirectory({signal: operation.controller.signal});
            if (closing || operation.controller.signal.aborted || selected.status !== 'selected') return {status: 'cancelled'};
            attempt = {id: 'preflight-' + randomUUID(), serverId: context.serverId, accountId: context.accountId,
                itemId: context.itemId, mediaSourceId: context.mediaSourceId, title: context.displayTitle || '视频下载',
                directory: selected.directory, state: 'checking', reason: null, stage: 'server-check', bytes: 0, total: null};
            for (const [id, value] of attempts) if (owner(value) === owner(context) && value.itemId === context.itemId && value.mediaSourceId === context.mediaSourceId) attempts.delete(id);
            while (attempts.size >= 64) attempts.delete(attempts.keys().next().value);
            attempts.set(attempt.id, attempt);
            operation.networkDone = new Promise(resolve => {releaseNetwork = resolve;});
            try {session = makeSession(context); source = await session.acquire(operation.controller.signal);}
            finally {await session?.close(); releaseNetwork();}
            if (closing || operation.controller.signal.aborted) return {status: 'cancelled'};
            const media = {...context, mediaSourceId: source.mediaSourceId};
            const previous = allTasks().find(task => sameMedia(task, media) && (task.state !== 'complete' || completedFile(task) &&
                task.source.identity === source.identity && task.source.etag === source.etag && task.source.prefixSha256 === source.prefixSha256));
            if (previous) {
                changedRestarts.delete(previous.id);
                if (previous.state !== 'complete' && active?.id !== previous.id) update(previous.id, {state: 'queued', reason: null});
                attempts.delete(attempt.id);
                kick(); return {status: previous.state === 'complete' ? 'downloaded' : 'queued', task: summary(store.get(previous.id))};
            }
            if (tasks.size >= 1024) throw probe.failure('task-limit');
            const task = store.save({schemaVersion: 1, id: randomUUID(), serverId: context.serverId, accountId: context.accountId,
                itemId: context.itemId, mediaSourceId: source.mediaSourceId, serverAddress: context.serverAddress,
                directory: selected.directory, state: 'queued', reason: null, source: records.sourceRecord(source), partial: null, file: null});
            attempts.delete(attempt.id);
            tasks.set(task.id, task); emit(task); kick(); return {status: 'queued', task: summary(task)};
        } catch (error) {
            if (operation.controller.signal.aborted) return {status: 'cancelled'};
            const reason = /^advance-download-(directory-invalid|directory-unavailable|settings-invalid|settings-save-failed)$/.exec(error?.message || '')?.[1] || probe.reasonOf(error);
            if (attempt) {attempt.state = 'failed'; attempt.reason = reason; attempt.stage = error.downloadStage || 'prepare';}
            return {status: 'error', reason, stage: attempt?.stage};
        } finally {
            if (operation.controller.signal.aborted && attempt) attempts.delete(attempt.id);
            releaseNetwork(); preparations.delete(operation);
        }
    }
    function retry(context, id) {
        const attempt = attempts.get(id);
        if (attempt && owner(attempt) === owner(context)) return enqueue({...context, itemId: attempt.itemId,
            mediaSourceId: attempt.mediaSourceId, displayTitle: attempt.title, retryDirectory: attempt.directory});
        const task = store.get(id);
        if (!task || !sameMedia({...context, itemId: task.itemId, mediaSourceId: task.mediaSourceId}, task)) return {status: 'error', reason: 'task-unavailable'};
        attach(context);
        changedRestarts.delete(id);
        if (task.state !== 'complete' && active?.id !== id) update(id, {state: 'queued', reason: null});
        kick(); return {status: 'queued'};
    }
    async function localSource(context, signal) {
        const candidates = allTasks().filter(value => sameMedia(value, context) && completedFile(value));
        if (!candidates.length) return null;
        let session, handle;
        try {
            signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000);
            session = makeSession(context);
            const source = await session.acquire(signal);
            const task = candidates.find(value => source.identity === value.source.identity && (!value.source.etag || source.etag === value.source.etag) &&
                (!value.source.prefixSha256 || value.source.prefixBytes !== source.prefixBytes || value.source.prefixSha256 === source.prefixSha256));
            if (signal?.aborted || !task) return null;
            const file = completedFile(task);
            if (!file) return null;
            handle = await fs.promises.open(file, 'r');
            if (!records.sameId(await handle.stat({bigint: true}), task.file.fileId)) return null;
            const prefix = Buffer.alloc(source.prefixBytes || Math.min(65536, source.total));
            let offset = 0;
            while (offset < prefix.length) {
                if (signal?.aborted) return null;
                const part = await handle.read(prefix, offset, prefix.length - offset, offset);
                if (!part.bytesRead) return null;
                offset += part.bytesRead;
            }
            if (source.prefixSha256 && createHash('sha256').update(prefix).digest('hex') !== source.prefixSha256 || !completedFile(task) || signal?.aborted) return null;
            return {status: 'hit', source: file, sourceKind: 'downloaded-file'};
        } catch (_) {return null;}
        finally {if (handle) await handle.close(); session?.close();}
    }
    async function pauseAll() {
        credentials = credentialHash = null;
        for (const operation of preparations) operation.controller.abort();
        if (active) {active.pauseReason = 'app-closed'; active.controller.abort(); await active.done;}
        await Promise.allSettled([...preparations].map(operation => operation.networkDone));
    }
    function close() {
        if (!closingPromise) {closing = true; closingPromise = pauseAll();}
        return closingPromise;
    }
    return Object.freeze({attach, enqueue, list, retry, localSource, pauseAll, close,
        directory(context, id) {return list(context).find(task => task.id === id)?.directory || null;},
        idle: async () => {while (active) await active.done;}});
}

module.exports = {createManager, completedFile};
