'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {createStore} = require('../src/electronapp/enhanced/app-update-preferences');
function fixture(t) {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-update-preferences-')));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    return {root, file: path.join(root, 'app-update.json'), store: createStore(root)};
}
test('missing preferences default formal without writing; the user selection survives store recreation', t => {
    const h = fixture(t); assert.equal(h.store.read(), 'stable'); assert.deepEqual(fs.readdirSync(h.root), []);
    h.store.save('testing'); assert.equal(createStore(h.root).read(), 'testing');
    h.store.save('stable'); assert.equal(createStore(h.root).read(), 'stable');
    assert.deepEqual(fs.readdirSync(h.root), ['app-update.json']);
});
test('invalid channels and malformed or oversized existing preferences are preserved', t => {
    const h = fixture(t);
    for (const channel of [null, {}, 'preview', 'Testing']) assert.throws(() => h.store.save(channel), /invalid-update-channel/);
    for (const bytes of ['broken', JSON.stringify({schemaVersion: 2, channel: 'testing'}), JSON.stringify({schemaVersion: 1, channel: 'other'}), 'x'.repeat(1025)]) {
        fs.writeFileSync(h.file, bytes); assert.throws(() => h.store.read()); assert.throws(() => h.store.save('stable'));
        assert.equal(fs.readFileSync(h.file, 'utf8'), bytes); assert.deepEqual(fs.readdirSync(h.root), ['app-update.json']);
    }
});
test('failed atomic replacement closes owned handles and does not corrupt the previous selection', t => {
    const h = fixture(t); h.store.save('testing'); const before = fs.readFileSync(h.file);
    t.mock.method(fs, 'renameSync', () => { throw Error('synthetic replacement failure'); });
    assert.throws(() => h.store.save('stable'), /replacement failure/);
    assert.deepEqual(fs.readFileSync(h.file), before); assert.deepEqual(fs.readdirSync(h.root), ['app-update.json']);
});
test('a partial write failure closes its handle and removes only the owned temporary preference file', t => {
    const h = fixture(t); h.store.save('testing'); const before = fs.readFileSync(h.file);
    let fd;
    t.mock.method(fs, 'writeFileSync', file => { fd = file; throw Error('synthetic write failure'); });
    assert.throws(() => h.store.save('stable'), /write failure/);
    assert.throws(() => fs.fstatSync(fd), /EBADF/);
    assert.deepEqual(fs.readFileSync(h.file), before); assert.deepEqual(fs.readdirSync(h.root), ['app-update.json']);
});
test('redirected settings files and roots cannot change an unrelated target', t => {
    const h = fixture(t), target = path.join(h.root, 'unrelated'); fs.writeFileSync(target, 'keep');
    fs.symlinkSync(target, h.file, 'file'); assert.throws(() => h.store.read()); assert.throws(() => h.store.save('testing'));
    assert.equal(fs.readFileSync(target, 'utf8'), 'keep');
    fs.unlinkSync(h.file);
    const alias = path.join(h.root, 'alias'); fs.symlinkSync(h.root, alias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => createStore(alias).read(), /invalid-update-settings-path/);
});
