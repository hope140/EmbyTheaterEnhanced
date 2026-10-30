'use strict';
const fs = require('node:fs'), path = require('node:path');
const records = require('./task-store');

// Read-only, bounded background checks. An unavailable drive never changes or
// removes a receipt. Slow filesystem calls remain coalesced instead of blocking
// the Electron main thread or creating a new probe on every UI poll.
function createInspector(options = {}) {
    const io = options.fs || fs.promises, cache = new Map();
    let running = 0, closed = false, queue = [];
    const keyOf = task => JSON.stringify([task.directory, task.file]);
    async function inspect(task) {
        let root;
        try {
            const actual = await io.realpath(task.directory), expected = path.resolve(task.directory);
            root = await io.lstat(task.directory, {bigint: true});
            if (!root.isDirectory() || root.isSymbolicLink() || (process.platform === 'win32' ? actual.toLowerCase() !== expected.toLowerCase() : actual !== expected) ||
                !records.sameId(root, task.file.rootId)) return 'directory-changed';
        } catch (_) {return 'directory-unavailable';}
        try {
            const stat = await io.lstat(path.join(task.directory, task.file.name), {bigint: true});
            return stat.isFile() && !stat.isSymbolicLink() && records.sameId(stat, task.file.fileId) &&
                Number(stat.size) === task.file.size && String(stat.mtimeNs) === task.file.mtimeNs ? 'available' : 'file-changed';
        } catch (error) {
            if (error.code !== 'ENOENT') return 'file-unavailable';
            try {if (!records.sameId(await io.lstat(task.directory, {bigint: true}), task.file.rootId)) return 'directory-changed';}
            catch (_) {return 'directory-unavailable';}
            return 'file-missing';
        }
    }
    function pump() {
        while (!closed && running < 4 && queue.length) {
            const {task, record} = queue.shift();
            if (record.pending || Date.now() - record.at < (options.ttl ?? 2000)) continue;
            running++;
            record.pending = inspect(task).then(value => {if (!closed) {record.value = value; record.at = Date.now();}})
                .finally(() => {record.pending = null; running--; pump();});
        }
    }
    function read(task) {
        if (task.state !== 'complete' || !task.file) return null;
        const key = keyOf(task);
        let record = cache.get(task.id);
        if (!record || record.key !== key) {record = {key, value: 'checking', at: 0}; cache.set(task.id, record);}
        return record;
    }
    async function snapshot(tasks) {
        const values = tasks.map(task => ({id: task.id, task, record: read(task)}));
        queue = values.filter(value => value.record).sort((a, b) => a.record.at - b.record.at);
        pump();
        const pending = values.filter(value => value.record?.pending).map(value => value.record.pending);
        if (pending.length) {
            let timer;
            try {await Promise.race([Promise.allSettled(pending), new Promise(resolve => {timer = setTimeout(resolve, options.budget ?? 150);})]);}
            finally {clearTimeout(timer);}
        }
        return new Map(values.map(value => [value.id, value.record?.value || null]));
    }
    return {snapshot, forget(id) {cache.delete(id);}, close() {closed = true; queue = []; cache.clear();}};
}
module.exports = {createInspector};
