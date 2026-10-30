'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {EventEmitter} = require('node:events'), {PassThrough} = require('node:stream');
const {createPublisher, moveWindows} = require('../src/electronapp/enhanced/advance-download/publication');
const {identity, createStore, partialName} = require('../src/electronapp/enhanced/advance-download/task-store');
const {createManager} = require('../src/electronapp/enhanced/advance-download/manager');
const {download} = require('../src/electronapp/enhanced/advance-download/transfer');
const probe = require('../src/electronapp/enhanced/advance-download/source-probe');
const {fixture, media, token} = require('./helpers/advance-download-fixture.cjs');
const unavailable = () => {throw Object.assign(Error('synthetic unsupported hard link'), {code: 'ENOTSUP'});};
const windowsOnly = process.platform === 'win32' ? false : 'Requires actual Windows handle rename and Windows PowerShell 5.1';

function directory(t) {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-media-publish-')));
    t.after(() => fs.rmSync(root, {recursive: true, force: true})); return root;
}
function record(root, to = '影片 $ ` 符号.mkv') {
    const from = '.ete-media-12345678-1234-4123-8123-123456789abc.part';
    fs.writeFileSync(path.join(root, from), media);
    const stat = fs.statSync(path.join(root, from), {bigint: true});
    return {directory: root, from, to, rootId: identity(fs.statSync(root, {bigint: true})), fileId: identity(stat), size: media.length, mtimeNs: String(stat.mtimeNs)};
}
// Portable model only: link+unlink simulates a successful exclusive move while
// preserving IDs. Actual Win32 API tests below do not use this implementation.
async function modelMove(value) {
    await fs.promises.link(path.join(value.directory, value.from), path.join(value.directory, value.to));
    await fs.promises.unlink(path.join(value.directory, value.from));
}

test('publication keeps the hard-link fast path and only Windows capability failures request a durable move intent', async t => {
    const root = directory(t), value = record(root), events = [];
    await createPublisher({platform: 'win32'})(value, async () => events.push('intent'));
    assert.deepEqual(events, []); assert.ok(fs.existsSync(path.join(root, value.from)));
    fs.unlinkSync(path.join(root, value.to));
    await createPublisher({platform: 'win32', link: unavailable, move: async item => {events.push('move'); await modelMove(item);}})(value, async () => events.push('intent'));
    assert.deepEqual(events, ['intent', 'move']);
    assert.deepEqual(fs.readFileSync(path.join(root, value.to)), media);
    assert.ok(!fs.existsSync(path.join(root, value.from)));
});

test('permission/collision errors, unsupported non-Windows platforms and a failed intent never start the move', async t => {
    const value = record(directory(t)); let moves = 0;
    for (const [platform, code] of [['win32', 'EEXIST'], ['win32', 'EACCES'], ['linux', 'ENOTSUP']]) {
        const publish = createPublisher({platform, link: async () => {throw Object.assign(Error(), {code});}, move: async () => moves++});
        await assert.rejects(publish(value, async () => {throw Error('must not request intent');}), error => error.code === code);
    }
    await assert.rejects(createPublisher({platform: 'win32', link: unavailable, move: async () => moves++})(value, async () => {throw Error('cannot persist intent');}));
    assert.equal(moves, 0);
});

test('Windows adapter sends Unicode paths as data, uses a fixed hidden shell and joins an uncertain child outcome', async () => {
    const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.kill = () => {};
    let executable, args, options, input = '';
    child.stdin.on('data', value => {input += value;});
    const operation = moveWindows({directory: "C:\\媒体\\$(`) ' 符号", from: '.ete-media-a.part', to: '影片.mkv'}, {
        environment: {SystemRoot: 'C:\\Windows', GH_TOKEN: 'private-canary', NODE_OPTIONS: 'private-canary'},
        spawn(...values) {[executable, args, options] = values; return child;}
    });
    assert.equal(executable, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    assert.equal(options.windowsHide, true); assert.equal(options.detached, false);
    assert.equal(options.env.GH_TOKEN, undefined); assert.equal(options.env.NODE_OPTIONS, undefined);
    assert.ok(!args.join(' ').includes('媒体'));
    assert.ok(input.includes('\\u5a92')); assert.equal(JSON.parse(input).to, '影片.mkv');
    let settled = false; operation.catch(() => {settled = true;});
    child.emit('error', Error('synthetic error'));
    await new Promise(resolve => setImmediate(resolve)); assert.equal(settled, false);
    child.emit('close', 1);
    await assert.rejects(operation, error => probe.reasonOf(error) === 'publication-unconfirmed');
});

test('Windows adapter accepts attested post-move IDs and reports only finite native diagnostics', async () => {
    for (const [output, code, expected] of [
        ['ETE_MEDIA_MOVE 0 123 456\r\n', 0, 'moved'],
        ['ETE_MEDIA_MOVE 87\r\n', 0, 'rename'],
        ['ETE_MEDIA_MOVE rejected source-time\r\n', 1, 'source-time'],
        ['private path or arbitrary output\n', 1, 'protocol']
    ]) {
        const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.kill = () => {};
        const pending = moveWindows({fileId: {dev: '123', ino: '111'}}, {environment: {SystemRoot: 'C:\\Windows'}, spawn: () => child});
        child.stdout.emit('data', Buffer.from(output)); child.emit('close', code);
        if (expected === 'moved') assert.deepEqual(await pending, {fileId: {dev: '123', ino: '456'}});
        else await assert.rejects(pending, error => {
            assert.equal(error.publicationStage, expected);
            assert.ok(!error.message.includes('private'));
            if (expected === 'rename') assert.equal(error.publicationNativeCode, 87);
            return true;
        });
    }
});

async function movedCrash(t, mutate) {
    const f = await fixture(t), root = directory(t), profile = path.join(root, 'profile'), videos = path.join(root, 'videos');
    fs.mkdirSync(profile); fs.mkdirSync(videos);
    const context = {serverId: 'server', accountId: 'account', itemId: 'item', mediaSourceId: 'source', serverAddress: f.emby + '/base', token};
    const store = createStore(profile), base = {store, profileRoot: profile, createSession: value => f.session(value), selectDirectory: async () => ({status: 'selected', directory: videos})};
    const publisher = createPublisher({platform: 'win32', link: unavailable, move: async value => {
        await (process.platform === 'win32' ? moveWindows : modelMove)(value);
        throw probe.failure('publication-unconfirmed'); // Reply lost after atomic commit.
    }});
    const first = createManager({...base, transfer: options => download({...options, publisher})});
    t.after(() => first.close());
    const queued = await first.enqueue(context); await first.idle(); await first.close();
    const task = store.get(queued.task.id);
    assert.equal(task.state, 'failed'); assert.equal(task.partial.publishMethod, 'move');
    assert.ok(!fs.existsSync(path.join(videos, task.partial.name)));
    const final = path.join(videos, task.partial.publishing);
    if (mutate) mutate(final);
    const second = createManager(base); t.after(() => second.close());
    second.retry(context, task.id); await second.idle();
    return {store, task, final, second, videos};
}

test('lost no-replace move acknowledgement recovers the same complete file without a duplicate', {timeout: 60000}, async t => {
    const f = await movedCrash(t);
    const complete = f.store.get(f.task.id);
    assert.equal(complete.state, 'complete'); assert.equal(complete.file.name, f.task.partial.publishing);
    assert.deepEqual(fs.readFileSync(f.final), media);
    assert.equal(fs.readdirSync(f.videos).length, 1);
});

test('move recovery refuses an exchanged file even when its bytes and name match', {timeout: 60000}, async t => {
    const f = await movedCrash(t, file => {fs.renameSync(file, file + '.keep'); fs.writeFileSync(file, media);});
    assert.equal(f.store.get(f.task.id).state, 'failed');
    assert.deepEqual(fs.readFileSync(f.final), media);
    assert.deepEqual(fs.readFileSync(f.final + '.keep'), media);
});

test('a changed post-rename ID is accepted only from the committing adapter acknowledgement', async t => {
    const f = await fixture(t), root = directory(t), session = f.session(), source = await session.acquire();
    t.after(() => session.close());
    // Models a filesystem assigning a new ID on rename. This copy is test code,
    // never a production publication fallback or a proof of FAT compatibility.
    let oldId, finalId;
    const publisher = async (value, beforeMove) => {
        await beforeMove(); oldId = value.fileId;
        const target = path.join(root, value.to);
        await fs.promises.copyFile(path.join(root, value.from), target, fs.constants.COPYFILE_EXCL);
        await fs.promises.unlink(path.join(root, value.from));
        finalId = identity(fs.statSync(target, {bigint: true}));
        return {fileId: finalId};
    };
    const result = await download({session, source, directory: root, publisher});
    assert.notEqual(finalId.ino, oldId.ino);
    assert.deepEqual(fs.readFileSync(path.join(root, result.fileName)), media);
    assert.equal(fs.readdirSync(root).length, 1);
});

test('new partial names reserve more FAT directory slots than the longest generated final name', async t => {
    const f = await fixture(t), root = directory(t), session = f.session(), source = await session.acquire();
    t.after(() => session.close());
    const longestTitle = 'CON.' + 'x'.repeat(96);
    const result = await download({session, source: {...source, title: longestTitle}, directory: root, publisher: async value => {
        assert.ok(value.from.length > value.to.length + 6, 'includes space for the largest collision suffix');
        assert.ok(value.from.length <= 255);
        await fs.promises.link(path.join(root, value.from), path.join(root, value.to));
    }});
    assert.deepEqual(fs.readFileSync(path.join(root, result.fileName)), media);
    assert.equal(partialName('12345678-1234-4123-8123-123456789abc').length, 133);
});

test('actual Windows handle move commits Unicode names without relying on hard links', {skip: windowsOnly, timeout: 60000}, async t => {
    const root = directory(t), value = record(root);
    const committed = await moveWindows(value);
    assert.ok(!fs.existsSync(path.join(root, value.from)));
    assert.deepEqual(fs.readFileSync(path.join(root, value.to)), media);
    assert.deepEqual(identity(fs.statSync(path.join(root, value.to), {bigint: true})), committed.fileId);
});

test('actual Windows handle move preserves existing files and directories at the target', {skip: windowsOnly, timeout: 60000}, async t => {
    for (const kind of ['file', 'directory']) {
        const root = directory(t), value = record(root, 'existing.mkv');
        if (kind === 'file') fs.writeFileSync(path.join(root, value.to), 'unrelated'); else fs.mkdirSync(path.join(root, value.to));
        await assert.rejects(moveWindows(value), error => error.code === 'EEXIST');
        assert.deepEqual(fs.readFileSync(path.join(root, value.from)), media);
        if (kind === 'file') assert.equal(fs.readFileSync(path.join(root, value.to), 'utf8'), 'unrelated');
        else assert.ok(fs.statSync(path.join(root, value.to)).isDirectory());
    }
});

test('actual Windows handle move rejects stale source and directory identity before mutation', {skip: windowsOnly, timeout: 60000}, async t => {
    const root = directory(t), value = record(root);
    for (const [patch, stage] of [[{fileId: {...value.fileId, ino: '0'}}, 'source-identity'], [{rootId: {...value.rootId, ino: '0'}}, 'directory-identity'], [{size: media.length + 1}, 'source-identity'], [{mtimeNs: '0'}, 'source-time']]) {
        await assert.rejects(moveWindows({...value, ...patch}), error => error.publicationStage === stage);
        assert.deepEqual(fs.readFileSync(path.join(root, value.from)), media);
        assert.ok(!fs.existsSync(path.join(root, value.to)));
    }
});

test('actual Windows full HTTP transfer uses the no-hardlink fallback and never overwrites a collision', {skip: windowsOnly, timeout: 60000}, async t => {
    const f = await fixture(t), root = directory(t), session = f.session(), source = await session.acquire();
    t.after(() => session.close()); fs.writeFileSync(path.join(root, 'Synthetic Movie.mkv'), 'keep');
    const result = await download({session, source, directory: root, publisher: createPublisher({link: unavailable})});
    assert.equal(result.fileName, 'Synthetic Movie (1).mkv');
    assert.equal(fs.readFileSync(path.join(root, 'Synthetic Movie.mkv'), 'utf8'), 'keep');
    assert.deepEqual(fs.readFileSync(path.join(root, result.fileName)), media);
    assert.equal(fs.readdirSync(root).length, 2);
});
