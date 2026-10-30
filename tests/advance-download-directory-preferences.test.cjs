'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {createStore, createSelector} = require('../src/electronapp/enhanced/advance-download/directory-preferences');
function fixture(t) {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-advance-directory-')));
    const settings = path.join(root, 'profile'), media = path.join(root, 'media');
    fs.mkdirSync(settings); fs.mkdirSync(media);
    fs.writeFileSync(path.join(media, 'user-video.mkv'), 'unrelated-user-file');
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    return {root, settings, media, file: path.join(settings, 'advance-download-directory.json'), store: createStore(settings)};
}
test('the first native folder selection is remembered and reused after store recreation', async t => {
    const f = fixture(t);
    let dialogs = 0;
    const dialog = {async showOpenDialog(_window, options) {dialogs++; assert.deepEqual(options.properties, ['openDirectory']); return {canceled: false, filePaths: [f.media]};}};
    assert.equal(f.store.read(), null);
    const first = await createSelector({store: f.store, dialog}).select();
    assert.deepEqual(first, {status: 'selected', directory: f.media});
    assert.deepEqual(await createSelector({store: createStore(f.settings), dialog}).select(), first);
    assert.equal(dialogs, 1);
    assert.deepEqual(fs.readdirSync(f.media), ['user-video.mkv']);
    assert.equal(fs.readFileSync(path.join(f.media, 'user-video.mkv'), 'utf8'), 'unrelated-user-file');
});
test('cancelling the first folder picker or a later reselection preserves existing state', async t => {
    const f = fixture(t);
    const selector = createSelector({store: f.store, dialog: {async showOpenDialog() {return {canceled: true, filePaths: []};}}});
    assert.deepEqual(await selector.select(), {status: 'cancelled'});
    assert.deepEqual(fs.readdirSync(f.settings), []);
    f.store.save(f.media);
    const before = fs.readFileSync(f.file);
    assert.deepEqual(await selector.select({force: true}), {status: 'cancelled'});
    assert.deepEqual(fs.readFileSync(f.file), before);
});
test('retired picker results do not write preferences and concurrent clicks do not open another picker', async t => {
    const f = fixture(t), controller = new AbortController();
    let resolve, dialogs = 0;
    const selector = createSelector({store: f.store, dialog: {showOpenDialog() {dialogs++; return new Promise(done => {resolve = done;});}}});
    const first = selector.select({signal: controller.signal});
    await Promise.resolve();
    assert.deepEqual(await selector.select(), {status: 'busy'});
    controller.abort();
    resolve({canceled: false, filePaths: [f.media]});
    assert.deepEqual(await first, {status: 'cancelled'});
    assert.equal(dialogs, 1);
    assert.deepEqual(fs.readdirSync(f.settings), []);
});
test('invalid, malformed and redirected preferences are preserved without changing media files', t => {
    const f = fixture(t);
    for (const body of ['invalid-json', JSON.stringify({schemaVersion: 2, directory: f.media}), 'x'.repeat(32769)]) {
        fs.writeFileSync(f.file, body);
        assert.throws(() => f.store.read(), /settings-invalid/);
        assert.throws(() => f.store.save(f.media));
        assert.equal(fs.readFileSync(f.file, 'utf8'), body);
    }
    fs.unlinkSync(f.file);
    const sentinel = path.join(f.media, 'user-video.mkv');
    fs.symlinkSync(sentinel, f.file, 'file');
    assert.throws(() => f.store.read(), /settings-invalid/);
    assert.throws(() => f.store.save(f.media));
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'unrelated-user-file');
});
test('failed atomic save closes its handle and preserves the prior remembered directory', t => {
    const f = fixture(t); f.store.save(f.media);
    const before = fs.readFileSync(f.file);
    t.mock.method(fs, 'renameSync', () => {throw Error('synthetic save failure');});
    assert.throws(() => f.store.save(f.media), /settings-save-failed/);
    assert.deepEqual(fs.readFileSync(f.file), before);
    assert.deepEqual(fs.readdirSync(f.settings), ['advance-download-directory.json']);
});
