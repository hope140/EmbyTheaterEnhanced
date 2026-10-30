'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const {EventEmitter} = require('node:events'), {PassThrough} = require('node:stream');
const {createDeleter, deleteWindows} = require('../src/electronapp/enhanced/advance-download/deletion');
const {identity} = require('../src/electronapp/enhanced/advance-download/task-store');
const probe = require('../src/electronapp/enhanced/advance-download/source-probe');
const windowsOnly = process.platform === 'win32' ? false : 'Requires actual Windows handle deletion and PowerShell 5.1';
function fixture(t) {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-delete-own-fixture-')));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const name = '自有夹具 $ ` 影片.mkv', file = path.join(root, name), body = Buffer.from('synthetic-owned-file'); fs.writeFileSync(file, body);
    const stat = fs.statSync(file, {bigint: true});
    const record = {directory: root, name, rootId: identity(fs.statSync(root, {bigint: true})), fileId: identity(stat), size: body.length,
        mtimeNs: String(stat.mtimeNs), sha256: crypto.createHash('sha256').update(body).digest('hex')};
    return {root, file, body, record, task: {directory: root, file: record}};
}
test('file removal validates the indexed file before invoking any native helper and never touches a replacement', async t => {
    const f = fixture(t); let called = false;
    fs.renameSync(f.file, f.file + '.retained'); fs.writeFileSync(f.file, f.body);
    await assert.rejects(createDeleter({platform: 'win32', removeWindows: async () => {called = true;}})(f.task), error => probe.reasonOf(error) === 'file-changed');
    assert.equal(called, false); assert.deepEqual(fs.readFileSync(f.file), f.body); assert.deepEqual(fs.readFileSync(f.file + '.retained'), f.body);
});
test('unavailable/missing/publication-pending files refuse deletion without discarding authority', async t => {
    const f = fixture(t), remove = createDeleter({platform: 'win32', removeWindows: async () => {throw Error('must not invoke');}});
    fs.unlinkSync(f.file);
    await assert.rejects(remove(f.task), error => probe.reasonOf(error) === 'file-missing');
    await assert.rejects(remove({...f.task, file: null, partial: {publishing: 'pending.mkv'}}), error => probe.reasonOf(error) === 'publication-unconfirmed');
    await assert.rejects(remove({...f.task, directory: path.join(f.root, 'offline')}), error => probe.reasonOf(error) === 'directory-unavailable');
});
test('helper cancellation joins its owned process close and rejects late success without deleting receipts', async t => {
    const f = fixture(t), controller = new AbortController(), child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); let killed = 0, settled = false;
    child.kill = () => {killed++;};
    const pending = deleteWindows(f.record, {environment: {SystemRoot: 'C:\\Windows'}, signal: controller.signal,
        spawn(executable, args, options) {assert.match(executable, /WindowsPowerShell/); assert.equal(options.windowsHide, true); assert.ok(!args.join(' ').includes(f.record.name)); return child;}});
    pending.catch(() => {settled = true;}); controller.abort(); await Promise.resolve();
    assert.equal(killed, 1); assert.equal(settled, false);
    child.stdout.write('ETE_MEDIA_DELETE 0\n'); child.emit('close', 0);
    await assert.rejects(pending, error => probe.reasonOf(error) === 'file-delete-unconfirmed'); assert.deepEqual(fs.readFileSync(f.file), f.body);
});
test('actual Windows deletes only the exact hash/identity-verified synthetic file and leaves neighboring data', {skip: windowsOnly}, async t => {
    const f = fixture(t); fs.writeFileSync(path.join(f.root, 'neighbor.mkv'), 'keep');
    await deleteWindows(f.record); assert.equal(fs.existsSync(f.file), false); assert.equal(fs.readFileSync(path.join(f.root, 'neighbor.mkv'), 'utf8'), 'keep');
});
test('actual Windows rejects wrong hash and physical identity before marking any file for deletion', {skip: windowsOnly}, async t => {
    const f = fixture(t);
    await assert.rejects(deleteWindows({...f.record, sha256: '0'.repeat(64)})); assert.deepEqual(fs.readFileSync(f.file), f.body);
    await assert.rejects(deleteWindows({...f.record, fileId: {...f.record.fileId, ino: String(BigInt(f.record.fileId.ino) + 1n)}})); assert.deepEqual(fs.readFileSync(f.file), f.body);
});
