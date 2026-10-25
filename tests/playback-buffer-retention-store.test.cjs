'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const crypto = require('node:crypto'), {spawnSync} = require('node:child_process');
const {Store} = require('../tools/playback-buffer-retention-store.cjs');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function identity(source, core = 'core-a') {
    return {kind: 'owned-raw-avi-pcm48k-v1', sourceSha256: sha(source), sourceBytes: 1024, coreSha256: sha(core)};
}
function setup(t) {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-retention-store-test-'));
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    return {parent, root: path.join(parent, 'store')};
}
function writeClip(parent, name, payload = 'tiny synthetic storage fixture; not a decoded media claim') {
    const file = path.join(parent, name); fs.writeFileSync(file, payload, {flag: 'w'}); return file;
}
async function stored(store, identityValue, parent, clipName = 'excerpt.avi', start = 1, end = 2) {
    const token = store.beginActual(identityValue, 1), clip = writeClip(parent, clipName);
    const result = await store.commit(token, clip, {sourceStart: start, sourceEnd: end, localStart: 0});
    assert.equal(result.stored, true, JSON.stringify(result)); return {clip, result};
}
function open(root, create = false) {return Store.open({enabled: true, root, create});}
async function assertRejectedOrMiss(operation) {
    const result = await Promise.resolve().then(operation).then(value => value, error => ({stored: false, error}));
    assert.equal(result.stored, false);
    return result;
}
function delayedRename(fromDirectory, toDirectory) {
    const original = fs.promises.rename; let used = false, enter;
    const entered = new Promise(resolve => {enter = resolve;}); let unblock;
    const blocked = new Promise(resolve => {unblock = resolve;});
    fs.promises.rename = async (from, to) => {
        if (!used && path.dirname(path.resolve(from)) === fromDirectory && path.dirname(path.resolve(to)) === toDirectory) {
            used = true; enter({from, to}); await blocked;
        }
        return original.call(fs.promises, from, to);
    };
    const waitEntered = async () => {
        let timer;
        try {return await Promise.race([entered, new Promise((_, reject) => {timer = setTimeout(() => reject(Error('test-rename-not-reached')), 2000);})]);}
        finally {clearTimeout(timer);}
    };
    return {waitEntered, release: () => unblock(), restore: () => {unblock(); fs.promises.rename = original;}};
}

test('default-off open returns null without creating or touching the requested store path', t => {
    const {root} = setup(t);
    assert.equal(Store.open({enabled: false, root, create: true}), null);
    assert.equal(fs.existsSync(root), false);
});

test('fresh owner storage adopts the closed export by same-filesystem rename, survives close, and reopens in another Node process', async t => {
    const {parent, root} = setup(t), id = identity('source-one'), clipBytes = Buffer.from('synthetic-byte-fixture-only');
    const exportPath = path.join(parent, 'excerpt.avi'); fs.writeFileSync(exportPath, clipBytes);
    const originalStat = fs.statSync(exportPath);
    const store = open(root, true);
    const token = store.beginActual(id, 1);
    const result = await store.commit(token, exportPath, {sourceStart: 1, sourceEnd: 2, localStart: 0});
    assert.equal(result.stored, true);
    const lease = store.acquire(id, 1.5);
    assert(lease && path.isAbsolute(lease.path)); assert.deepEqual(lease.window, {sourceStart: 1, sourceEnd: 2, localStart: 0});
    const storedStat = fs.statSync(lease.path);
    assert.equal(storedStat.ino, originalStat.ino, 'adoption preserves the file inode');
    assert.equal(storedStat.nlink, 1, 'the adopted window has one name, avoiding a shared writable inode');
    assert.equal(fs.existsSync(exportPath), false, 'adoption consumes the export alias and leaves no shared writable name');
    assert.deepEqual(fs.readFileSync(lease.path), clipBytes);
    assert.equal(await lease.release(), undefined);
    store.close();

    const script = [
        "const {Store}=require('./tools/playback-buffer-retention-store.cjs');",
        'const root=process.argv[1], identity=JSON.parse(process.argv[2]);',
        'const store=Store.open({enabled:true,root,create:false});',
        'const lease=store.acquire(identity,1.5);',
        "if(!lease||!require('node:fs').existsSync(lease.path)) process.exit(3);",
        'Promise.resolve(lease.release()).then(()=>{store.close();process.stdout.write(JSON.stringify({reopened:true,window:lease.window}));});'
    ].join('');
    const resultChild = spawnSync(process.execPath, ['-e', script, root, JSON.stringify(id)], {
        cwd: path.resolve(__dirname, '..'), encoding: 'utf8', shell: false, windowsHide: true, timeout: 10000,
        env: require('../tools/ci-playback-range-smoke.cjs').cleanEnvironment(process.env), maxBuffer: 65536
    });
    assert.ifError(resultChild.error); assert.equal(resultChild.status, 0, resultChild.stderr);
    assert.deepEqual(JSON.parse(resultChild.stdout), {reopened: true, window: {sourceStart: 1, sourceEnd: 2, localStart: 0}});
});

test('published media is not restatted after manifest rename, so post-publish cleanup cannot delete it', async t => {
    const {parent, root} = setup(t), id = identity('source-one'), store = open(root, true);
    const bytes = Buffer.from('candidate media whose stat must finish before publication'), exportPath = writeClip(parent, 'candidate.avi', bytes);
    const candidate = path.join(root, 'window-' + sha(bytes) + '.avi'), last = path.join(root, 'last.json');
    const originalStat = fs.statSync, originalRename = fs.renameSync; let published = false, candidateStatAfterPublish = false;
    fs.renameSync = function(from, to) {const result = originalRename.call(fs, from, to); if (path.resolve(to) === last) published = true; return result;};
    fs.statSync = function(file, ...args) {
        if (published && path.resolve(String(file)) === candidate) {candidateStatAfterPublish = true; throw Error('post-publish-candidate-stat');}
        return originalStat.call(fs, file, ...args);
    };
    let result;
    try {const token = store.beginActual(id, 1); result = await store.commit(token, exportPath, {sourceStart: 1, sourceEnd: 2, localStart: 0});}
    finally {fs.statSync = originalStat; fs.renameSync = originalRename;}
    assert.equal(result.stored, true); assert.equal(candidateStatAfterPublish, false);
    assert.equal(fs.existsSync(candidate), true); assert.equal(fs.existsSync(last), true);
    const lease = store.acquire(id, 1.5); assert(lease); await lease.release(); store.close();
});

test('query/preparation with another identity preserves stored media; only different actual playback changes ownership', async t => {
    const {parent, root} = setup(t), id = identity('source-one'), other = identity('source-two');
    const store = open(root, true); const {clip} = await stored(store, id, parent);
    const first = store.acquire(id, 1.5); assert(first); await first.release();
    assert.equal(store.acquire(other, 1.5), null, 'a miss does not mutate or clear the prior identity');
    const stillThere = store.acquire(id, 1.5); assert(stillThere); await stillThere.release();

    const sameIdentityToken = store.beginActual(id, 2);
    assert(sameIdentityToken); const sameIdentity = store.acquire(id, 1.5); assert(sameIdentity); await sameIdentity.release();
    const held = store.acquire(id, 1.5); assert(held);
    store.beginActual(other, 3);
    assert(fs.existsSync(held.path), 'a different actual identity defers deletion while a lease holds the media');
    assert.equal(store.acquire(id, 1.5), null);
    const otherToken = store.beginActual(other, 4);
    const competingClip = writeClip(parent, 'other.avi');
    assert.equal((await store.commit(otherToken, competingClip, {sourceStart: 2, sourceEnd: 3, localStart: 0})).stored, false,
        'any live lease blocks replacing the single current item');
    await held.release();
    assert.equal(fs.existsSync(clip), false, 'successful adoption consumes the export alias');
    const replacement = await store.commit(otherToken, competingClip, {sourceStart: 2, sourceEnd: 3, localStart: 0});
    assert.equal(replacement.stored, true);
    assert.equal(store.acquire(id, 1.5), null); const current = store.acquire(other, 2.5); assert(current); await current.release();
    store.close();
});

test('commit windows and ownership inputs are bounded, exact, and source isolated', async t => {
    const {parent, root} = setup(t), id = identity('source-one'), foreign = identity('source-foreign');
    const store = open(root, true); const clip = writeClip(parent, 'excerpt.avi');
    assert.throws(() => store.beginActual({...id, url: 'http://invalid/'}, 1));
    assert.throws(() => store.beginActual(id, 0)); assert.throws(() => store.beginActual(id, 1.5));
    const token = store.beginActual(id, 1);
    for (const window of [
        {sourceStart: -1, sourceEnd: 1, localStart: 0}, {sourceStart: 1, sourceEnd: 1, localStart: 0},
        {sourceStart: 1, sourceEnd: 4, localStart: 0}, {sourceStart: 7, sourceEnd: 9, localStart: 0},
        {sourceStart: 1, sourceEnd: 2, localStart: NaN}, {sourceStart: 1, sourceEnd: 2, localStart: -1}
    ]) await assertRejectedOrMiss(() => store.commit(token, clip, window));
    assert.equal(store.acquire(foreign, 1.5), null);
    assert.equal(store.acquire(id, 8), null);
    await assertRejectedOrMiss(() => store.commit(token, path.join(parent, 'outside-missing.avi'), {sourceStart: 1, sourceEnd: 2, localStart: 0}));
    store.close();
});

test('active writer and stale writer markers fail closed without replacement or owner mutation', t => {
    const {root} = setup(t), store = open(root, true);
    assert.throws(() => open(root, false), 'a second writer cannot open an active owner');
    store.close();
    const lock = path.join(root, '.writer'), stale = 'stale marker; never inspect a PID'; fs.writeFileSync(lock, stale, {flag: 'wx'});
    assert.throws(() => open(root, false), 'a stale exclusive lock is not reclaimed');
    assert.equal(fs.readFileSync(lock, 'utf8'), stale);
});

test('close refuses replaced owner or lock entities without deleting the replacement owner files', t => {
    for (const which of ['owner', 'writer']) {
        const {root} = setup(t), store = open(root, true), owner = path.join(root, 'owner'), lock = path.join(root, '.writer');
        const replacement = 'new external owner entity\n';
        if (which === 'owner') fs.writeFileSync(owner, replacement);
        else {fs.unlinkSync(lock); fs.writeFileSync(lock, replacement, {flag: 'wx'});}
        assert.throws(() => store.close(), `${which} replacement must prevent cleanup by the stale owner`);
        if (which === 'owner') assert.equal(fs.readFileSync(owner, 'utf8'), replacement);
        else assert.equal(fs.readFileSync(lock, 'utf8'), replacement);
    }
});

test('physical-root namespace and owner markers prevent copying or claiming another store', async t => {
    const {parent, root} = setup(t), id = identity('source-one'), store = open(root, true);
    await stored(store, id, parent); store.close();
    const copiedRoot = path.join(parent, 'copied-store'); fs.mkdirSync(copiedRoot);
    for (const name of fs.readdirSync(root)) fs.copyFileSync(path.join(root, name), path.join(copiedRoot, name));
    assert.throws(() => open(copiedRoot, false), 'manifest namespace is bound to its original physical root');
    assert.equal(fs.readFileSync(path.join(copiedRoot, 'last.json'), 'utf8').includes('sourceSha256'), true);

    const ownerRoot = path.join(parent, 'foreign-owner'); fs.mkdirSync(ownerRoot); fs.writeFileSync(path.join(ownerRoot, 'owner'), 'foreign owner\n');
    assert.throws(() => open(ownerRoot, false), 'a foreign owner marker cannot be adopted');
    const unknownRoot = path.join(parent, 'unknown-member'); fs.mkdirSync(unknownRoot); fs.writeFileSync(path.join(unknownRoot, 'owner'), 'ETE owned synthetic retained window v1\n');
    fs.writeFileSync(path.join(unknownRoot, 'unowned.bin'), 'do not adopt or delete');
    assert.throws(() => open(unknownRoot, false), 'unknown owner contents must fail closed');
    assert.equal(fs.readFileSync(path.join(unknownRoot, 'unowned.bin'), 'utf8'), 'do not adopt or delete');
});

test('leases and pending commits prevent synchronous close; release is idempotent', async t => {
    const {parent, root} = setup(t), id = identity('source-one'), store = open(root, true);
    const {clip} = await stored(store, id, parent), lease = store.acquire(id, 1.5); assert(lease);
    assert.throws(() => store.close());
    assert.equal(await lease.release(), undefined); assert.equal(await lease.release(), undefined);
    const token = store.beginActual(id, 2), secondClip = writeClip(parent, 'different.avi', 'different bytes mean an asynchronous hardlink');
    const pending = store.commit(token, secondClip, {sourceStart: 3, sourceEnd: 4, localStart: 0});
    assert.throws(() => store.close());
    const result = await pending; assert.equal(result.stored, true);
    store.close();
});

test('a pre-existing next.json is preserved when this commit cannot claim the atomic staging name', async t => {
    const {parent, root} = setup(t), id = identity('source-one'), store = open(root, true), token = store.beginActual(id, 1);
    const next = path.join(root, 'next.json'), marker = 'foreign pre-existing staged manifest\n'; fs.writeFileSync(next, marker, {flag: 'wx'});
    const exportPath = writeClip(parent, 'next-conflict.avi');
    await assertRejectedOrMiss(() => store.commit(token, exportPath, {sourceStart: 1, sourceEnd: 2, localStart: 0}));
    assert.equal(fs.readFileSync(next, 'utf8'), marker, 'failure cleanup must not remove a file this attempt did not create');
    store.close();
});

test('retired-file unlink failure remains retryable through the same lease release', async t => {
    const {parent, root} = setup(t), id = identity('source-one'), other = identity('source-two'), store = open(root, true);
    await stored(store, id, parent); const lease = store.acquire(id, 1.5); assert(lease);
    store.beginActual(other, 2);
    const original = fs.unlinkSync; let failed = false;
    fs.unlinkSync = function(file) {if (!failed && path.resolve(file) === path.resolve(lease.path)) {failed = true; throw Error('synthetic-unlink-failure');} return original.call(fs, file);};
    try {
        assert.throws(() => lease.release(), /synthetic-unlink-failure/);
        assert.equal(fs.existsSync(lease.path), true);
        lease.release();
        assert.equal(fs.existsSync(lease.path), false, 'a later idempotent release retries outstanding retirement cleanup');
    } finally {fs.unlinkSync = original;}
    store.close();
});

test('failed identity invalidation keeps acquire blocked, refuses commit, and close retries before reopen', async t => {
    const {parent, root} = setup(t), id = identity('source-one'), other = identity('source-two'), store = open(root, true);
    await stored(store, id, parent); const old = store.acquire(id, 1.5); assert(old); const oldPath = old.path; await old.release();
    const last = path.join(root, 'last.json'), original = fs.unlinkSync; let failed = false;
    fs.unlinkSync = function(file) {if (!failed && path.resolve(file) === last) {failed = true; throw Error('synthetic-invalidate-unlink-failure');} return original.call(fs, file);};
    try {assert.throws(() => store.beginActual(other, 2), /synthetic-invalidate-unlink-failure/);}
    finally {fs.unlinkSync = original;}
    assert.equal(fs.existsSync(last), true, 'failed invalidation retains the original manifest for retry');
    assert.equal(store.acquire(id, 1.5), null, 'old identity is not reusable while invalidation is pending');
    const blockedToken = store.active, exportPath = writeClip(parent, 'blocked-by-invalidation.avi');
    const blocked = await store.commit(blockedToken, exportPath, {sourceStart: 2, sourceEnd: 3, localStart: 0});
    assert.equal(blocked.stored, false); assert.equal(blocked.reason, 'invalidation-pending');
    assert.equal(fs.existsSync(exportPath), true, 'blocked commit did not adopt its export');
    store.close();
    assert.equal(fs.existsSync(last), false); assert.equal(fs.existsSync(oldPath), false);
    const reopened = open(root, false); assert.equal(reopened.acquire(id, 1.5), null); reopened.close();
});

test('published replacement reports cleanupPending after old-file unlink failure and close retries cleanup', async t => {
    const {parent, root} = setup(t), id = identity('source-one'), store = open(root, true);
    await stored(store, id, parent, 'old.avi', 1, 2);
    const oldLease = store.acquire(id, 1.5); assert(oldLease); const oldPath = oldLease.path; await oldLease.release();
    const token = store.beginActual(id, 2), replacement = writeClip(parent, 'replacement.avi', 'replacement synthetic bytes');
    const original = fs.unlinkSync; let failed = false;
    fs.unlinkSync = function(file) {if (!failed && path.resolve(file) === path.resolve(oldPath)) {failed = true; throw Error('synthetic-old-window-unlink-failure');} return original.call(fs, file);};
    let result;
    try {result = await store.commit(token, replacement, {sourceStart: 3, sourceEnd: 4, localStart: 0});}
    finally {fs.unlinkSync = original;}
    assert.equal(result.stored, true, 'manifest publication is already committed');
    assert.equal(result.cleanupPending, true);
    assert.equal(fs.existsSync(oldPath), true);
    const current = store.acquire(id, 3.5); assert(current); await current.release();
    store.close();
    assert.equal(fs.existsSync(oldPath), false, 'close retries deferred orphan cleanup');
});

test('a newer actual playback invalidates an in-flight rename adoption before manifest publication', async t => {
    const {parent, root} = setup(t), id = identity('source-one'), other = identity('source-two'), store = open(root, true);
    const clip = writeClip(parent, 'export-being-adopted.avi', Buffer.alloc(4096, 7)), gate = delayedRename(parent, root);
    try {
        const token = store.beginActual(id, 1), pending = store.commit(token, clip, {sourceStart: 1, sourceEnd: 2, localStart: 0});
        await gate.waitEntered(); store.beginActual(other, 2); gate.release();
        const result = await pending;
        assert.equal(result.stored, false); assert.equal(store.acquire(id, 1.5), null); assert.equal(store.acquire(other, 1.5), null);
        assert.equal(fs.existsSync(path.join(root, 'last.json')), false, 'obsolete adoption is never published');
    } finally {gate.restore();}
    store.close();
});

test('a lease acquired during awaited rename blocks replacement of the old published window', async t => {
    const {parent, root} = setup(t), id = identity('source-one'), store = open(root, true);
    await stored(store, id, parent, 'old-window.avi', 1, 2);
    const old = store.acquire(id, 1.5); assert(old); const oldPath = old.path; await old.release();
    const gate = delayedRename(parent, root), newExport = writeClip(parent, 'new-window.avi', 'new window content');
    try {
        const token = store.beginActual(id, 2), pending = store.commit(token, newExport, {sourceStart: 3, sourceEnd: 4, localStart: 0});
        await gate.waitEntered();
        const duringCommit = store.acquire(id, 1.5); assert(duringCommit, 'the old manifest remains readable while adoption is pending');
        gate.release();
        const result = await pending;
        assert.equal(result.stored, false, 'commit must recheck lease count after its awaited rename');
        assert.equal(fs.existsSync(oldPath), true);
        assert.equal(store.acquire(id, 3.5), null, 'the competing new window was not published');
        await duringCommit.release();
        const stillCurrent = store.acquire(id, 1.5); assert(stillCurrent); await stillCurrent.release();
    } finally {gate.restore();}
    store.close();
});

test('close checks live leases and busy work before owner validation, preserving its lock handle', async t => {
    const ownerText = 'ETE owned synthetic retained window v1\n';
    {
        const {parent, root} = setup(t), id = identity('lease-owner'), store = open(root, true);
        await stored(store, id, parent); const lease = store.acquire(id, 1.5); assert(lease);
        const owner = path.join(root, 'owner'); fs.writeFileSync(owner, 'foreign owner during lease\n');
        assert.throws(() => store.close(), /retention-live-reader-or-work/);
        fs.writeFileSync(owner, ownerText); await lease.release();
        store.close(); assert.equal(fs.existsSync(path.join(root, '.writer')), false, 'the original lock handle remained usable after the gated close');
    }
    {
        const {parent, root} = setup(t), id = identity('busy-owner'), store = open(root, true);
        const exportPath = writeClip(parent, 'busy-export.avi', 'pending rename while owner changes'), gate = delayedRename(parent, root);
        try {
            const pending = store.commit(store.beginActual(id, 1), exportPath, {sourceStart: 1, sourceEnd: 2, localStart: 0});
            await gate.waitEntered();
            const owner = path.join(root, 'owner'); fs.writeFileSync(owner, 'foreign owner during commit\n');
            assert.throws(() => store.close(), /retention-live-reader-or-work/);
            fs.writeFileSync(owner, ownerText); gate.release();
            assert.equal((await pending).stored, true);
            store.close(); assert.equal(fs.existsSync(path.join(root, '.writer')), false, 'busy close did not close or discard the owned lock handle');
        } finally {gate.restore();}
    }
});

test('symlink or nonregular paths, foreign sibling paths, oversize clips, tampered media, and foreign identity never become reusable', async t => {
    const {parent, root} = setup(t), id = identity('source-one'), store = open(root, true), token = store.beginActual(id, 1);
    const outside = path.join(parent, 'outside.avi'); fs.writeFileSync(outside, 'outside');
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-retention-outside-'));
    t.after(() => fs.rmSync(elsewhere, {recursive: true, force: true}));
    const externalClip = path.join(elsewhere, 'clip.avi'); fs.writeFileSync(externalClip, 'external');
    const link = path.join(parent, 'symlink.avi'); let pathFixture;
    try {fs.symlinkSync(outside, link); pathFixture = 'symlink';}
    catch (error) {
        if (process.platform !== 'win32' || !['EPERM', 'EACCES'].includes(error.code)) throw error;
        fs.mkdirSync(link); pathFixture = 'nonregular-directory';
        t.diagnostic('Windows denied symlink creation with EPERM/EACCES; this test uses a nonregular directory path and does not change system permissions.');
    }
    if (process.platform === 'linux') t.diagnostic('Linux exercised a real filesystem symlink.');
    else if (pathFixture === 'symlink') t.diagnostic(`${process.platform} exercised a real filesystem symlink.`);
    else t.diagnostic('Windows exercised only the nonregular directory path because symlink creation was denied.');
    for (const invalid of [externalClip, link]) await assertRejectedOrMiss(() => store.commit(token, invalid, {sourceStart: 1, sourceEnd: 2, localStart: 0}));
    const huge = path.join(parent, 'too-large.avi'); fs.writeFileSync(huge, Buffer.alloc(34 * 1024 * 1024 + 1));
    await assertRejectedOrMiss(() => store.commit(token, huge, {sourceStart: 1, sourceEnd: 2, localStart: 0}));
    const aliased = writeClip(parent, 'aliased.avi', 'cannot adopt a shared inode'), alias = path.join(parent, 'aliased-copy.avi'); fs.linkSync(aliased, alias);
    await assertRejectedOrMiss(() => store.commit(token, aliased, {sourceStart: 1, sourceEnd: 2, localStart: 0}));
    assert.equal(fs.existsSync(aliased), true); assert.equal(fs.existsSync(alias), true);
    const valid = writeClip(parent, 'valid.avi'); assert.equal((await store.commit(token, valid, {sourceStart: 1, sourceEnd: 2, localStart: 0})).stored, true);
    assert.equal(store.acquire(foreignIdentity(id), 1.5), null);
    const lease = store.acquire(id, 1.5); assert(lease); await lease.release();
    fs.writeFileSync(lease.path, 'tampered');
    store.close();
    assert.throws(() => open(root, false), 'a content hash mismatch must reject the owner or remain a safe miss');
});

function foreignIdentity(id) {return {...id, coreSha256: sha('different-core')};}
