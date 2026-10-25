'use strict';
// Explicit experiment tooling only. Not imported by main/service or normal playback.
const fs = require(process.versions.electron ? 'original-fs' : 'node:fs');
const path = require('node:path'), crypto = require('node:crypto');
const OWNER = 'ETE owned retention exports v1\n', states = new WeakMap();
const regular = file => {const s = fs.lstatSync(file, {bigint: true}); if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1n) throw Error('retention-export-owner'); return s;};
function create({client, source, root, signal}) {
    if (signal?.aborted) throw Error('retention-export-retired');
    if (!client || typeof source !== 'string' || !source || !path.isAbsolute(root)) throw Error('retention-export-input');
    const resolved = fs.realpathSync(root), rootStat = fs.lstatSync(root, {bigint: true});
    if (resolved !== root || !rootStat.isDirectory() || rootStat.isSymbolicLink()) throw Error('retention-export-owner');
    const marker = path.join(root, 'owner'), markerStat = regular(marker);
    if (fs.readFileSync(marker, 'utf8') !== OWNER) throw Error('retention-export-owner');
    const generation = client.currentGenerationId, instance = client.helperInstanceId, child = client.child;
    if (!Number.isSafeInteger(generation) || generation <= 0 || typeof instance !== 'string' || !instance || !child) throw Error('retention-export-input');
    let retired = false, childClosed = false, ownedFile = null;
    const owns = () => !retired && !signal?.aborted && !client.exited && !client.transportTerminated && client.child === child &&
        client.helperInstanceId === instance && client.currentGenerationId === generation && client.state?.fileLoaded === true && client.state.path === source;
    function rootOwned() {
        const r = fs.lstatSync(root, {bigint: true}), m = regular(marker);
        if (fs.realpathSync(root) !== root || r.dev !== rootStat.dev || r.ino !== rootStat.ino || m.dev !== markerStat.dev || m.ino !== markerStat.ino || fs.readFileSync(marker, 'utf8') !== OWNER) throw Error('retention-export-owner');
        if (fs.readdirSync(root).some(name => name !== 'owner' && name !== (ownedFile && path.basename(ownedFile)))) throw Error('retention-export-owner');
    }
    rootOwned();
    const onChildClose = () => {childClosed = true;}; child.once('close', onChildClose);
    const abort = () => {retired = true; unwatch();}; signal?.addEventListener('abort', abort, {once: true});
    let state = states.get(client); if (!state) {state = {next: 0, busy: null, retained: null}; states.set(client, state);}
    const unwatch = () => {if (retired && !state.busy && !state.retained) child.removeListener('close', onChildClose);};
    async function exportWindow({start, end, format}) {
        if (!owns() || state.busy || state.retained || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || !['nut', 'mp4'].includes(format)) return {state: 'unavailable', reason: 'owner-or-window'};
        const job = {}; state.busy = job; let file, identity, sent = false, barrier = false, readers = 0;
        async function dispose() {
            if (!file) return {cleanupPending: false};
            if (readers || sent && !barrier && !childClosed) return {cleanupPending: true};
            rootOwned(); const current = regular(file);
            if (current.dev !== identity.dev || current.ino !== identity.ino) throw Error('retention-export-owner');
            fs.unlinkSync(file); file = ownedFile = null; if (state.retained === job) state.retained = null; unwatch(); return {cleanupPending: false};
        }
        try {
            rootOwned();
            const [actualSource, paused, disk, cache, capability] = await Promise.all([
                client.getProperty('path', 2000), client.getProperty('pause', 2000), client.getProperty('cache-on-disk', 2000),
                client.getProperty('demuxer-cache-state', 2000), client.getProperty('cache-export-report', 2000)]);
            if (!owns() || actualSource !== source || paused !== true || disk !== false || capability?.schema !== 1 || cache?.idle !== true ||
                !Number.isSafeInteger(cache['total-bytes']) || cache['total-bytes'] <= 0 ||
                !cache['seekable-ranges']?.some(r => Number.isFinite(r.start) && Number.isFinite(r.end) && start >= r.start && end <= r.end)) throw Error('retention-export-unavailable');
            const id = ++state.next; if (!Number.isSafeInteger(id)) throw Error('retention-export-unavailable');
            rootOwned(); file = path.join(root, crypto.randomUUID() + '.' + format);
            const fd = fs.openSync(file, 'wx', 0o600); ownedFile = file; state.retained = job;
            try {identity = fs.fstatSync(fd, {bigint: true});} finally {fs.closeSync(fd);}
            if (!owns()) throw Error('retention-export-unavailable');
            sent = true; client.command('command', {args: ['dump-cache-report', String(start), String(end), file, String(id)]}, generation);
            // Non-media-scoped barrier is deliberate: retirement rejects use immediately,
            // but must not lose the physical completion signal of the old finite dump.
            const reply = await client.request('get-property', {name: 'cache-export-report'}, {generationId: generation, mediaScoped: false, timeoutMs: 10000});
            barrier = true; const report = reply?.value;
            if (!owns() || report?.schema !== 1 || report['export-id'] !== id || report.complete !== true || report['io-ok'] !== true || report['internal-affine-map-known'] !== true || report['serialized-clip-map-verified'] !== false) throw Error('retention-export-unavailable');
            const afterSource = await client.getProperty('path', 2000);
            if (!owns() || afterSource !== source) throw Error('retention-export-unavailable');
            rootOwned(); const stat = regular(file);
            if (stat.dev !== identity.dev || stat.ino !== identity.ino || stat.size <= 0n || stat.size > BigInt(cache['total-bytes'])) throw Error('retention-export-unavailable');
            function hashFile() {
                const h = crypto.createHash('sha256'), buffer = Buffer.alloc(65536), fd = fs.openSync(file, 'r');
                try {
                    const actual = fs.fstatSync(fd, {bigint: true});
                    if (actual.dev !== identity.dev || actual.ino !== identity.ino || actual.size !== stat.size || actual.nlink !== 1n) throw Error('retention-export-owner');
                    let remaining = Number(stat.size);
                    while (remaining) {const length = fs.readSync(fd, buffer, 0, Math.min(buffer.length, remaining), null); if (!length) throw Error('retention-export-owner'); h.update(buffer.subarray(0, length)); remaining -= length;}
                    if (fs.readSync(fd, buffer, 0, 1, null)) throw Error('retention-export-owner');
                }
                finally {fs.closeSync(fd);} return h.digest('hex');
            }
            const sha256 = hashFile();
            function assertCurrent() {
                if (!owns() || !file) throw Error('retention-export-retired'); rootOwned();
                const current = regular(file);
                if (current.dev !== identity.dev || current.ino !== identity.ino || current.size !== stat.size || hashFile() !== sha256) throw Error('retention-export-owner');
            }
            async function verifyClip(inspect) {
                assertCurrent(); readers++;
                try {const result = await inspect(file, report); assertCurrent(); return result;}
                finally {readers--;}
            }
            return {state: 'exported-unverified', helperInstanceId: instance, generationId: generation, exportId: id, report,
                path: file, bytes: Number(stat.size), sha256, observedBufferBytes: cache['total-bytes'], assertCurrent, verifyClip, dispose};
        } catch (_) {
            let cleanupPending = true; try {cleanupPending = (await dispose()).cleanupPending;} catch (_) {}
            return {state: 'unavailable', reason: owns() ? 'capability-or-export' : 'retired', cleanupPending, dispose};
        } finally {
            if (!sent || barrier || childClosed) {if (state.busy === job) state.busy = null;}
            else child.once('close', () => {if (state.busy === job) state.busy = null; unwatch();});
            unwatch();
        }
    }
    return {exportWindow, retire() {abort(); signal?.removeEventListener('abort', abort); unwatch();}};
}
module.exports = {create, OWNER};
