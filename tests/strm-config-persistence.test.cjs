'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createStore} = require('../src/electronapp/enhanced/strm-config-store');

function fixture(t) {
    const rootDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-config-write-')));
    t.after(() => fs.rmSync(rootDir, {recursive: true, force: true}));
    return {rootDir, environment: {}};
}

const rule = {id: 'auto-one', sourcePrefix: '/media/example', cloudPrefix: '/cloud/example'};

for (const failure of ['write', 'rename']) {
    test('failed token ' + failure + ' removes its temporary secret and preserves the saved token', t => {
        const options = fixture(t);
        let fail = false;
        const fileSystem = Object.assign({}, fs, {
            writeFileSync(file, data, settings) {
                if (fail && failure === 'write') {
                    fs.writeFileSync(file, String(data).slice(0, 20), settings);
                    throw Error('synthetic-partial-write');
                }
                return fs.writeFileSync(file, data, settings);
            },
            renameSync(source, destination) {
                if (fail && failure === 'rename') throw Error('synthetic-rename');
                return fs.renameSync(source, destination);
            }
        });
        const store = createStore({...options, fs: fileSystem});
        store.setToken('synthetic-saved-token');
        const before = fs.readFileSync(store.getConfigPaths().secretsPath);
        const foreign = path.join(options.rootDir, 'strm-resolver-secrets.json.tmp-unowned');
        fs.writeFileSync(foreign, 'unrelated-file');
        const names = fs.readdirSync(options.rootDir).sort();
        fail = true;
        assert.throws(() => store.setToken('synthetic-replacement-token'), /synthetic-/);
        assert.deepEqual(fs.readdirSync(options.rootDir).sort(), names);
        assert.equal(fs.readFileSync(foreign, 'utf8'), 'unrelated-file');
        assert.deepEqual(fs.readFileSync(store.getConfigPaths().secretsPath), before);
        assert.equal(store.getRuntimeConfig().token, 'synthetic-saved-token');
        assert.equal(createStore(options).getRuntimeConfig().token, 'synthetic-saved-token');
    });
}

test('temporary creation collision preserves the existing file and does not commit', t => {
    const options = fixture(t);
    let collisionPath;
    const fileSystem = Object.assign({}, fs, {
        openSync(file, flags, mode) {
            assert.equal(flags, 'wx');
            collisionPath = file;
            fs.writeFileSync(file, 'unowned-collision');
            return fs.openSync(file, flags, mode);
        }
    });
    const store = createStore({...options, fs: fileSystem});
    assert.throws(() => store.setToken('synthetic-new-token'), {code: 'EEXIST'});
    assert.equal(fs.readFileSync(collisionPath, 'utf8'), 'unowned-collision');
    assert.equal(fs.existsSync(store.getConfigPaths().secretsPath), false);
    assert.equal(store.getPublicConfig().cd2.tokenConfigured, false);
});

test('failed secret cleanup retains the original save error and closes the descriptor', t => {
    const options = fixture(t);
    let descriptor;
    const failure = Error('synthetic-original-failure');
    const fileSystem = Object.assign({}, fs, {
        openSync(...args) { descriptor = fs.openSync(...args); return descriptor; },
        renameSync() { throw failure; },
        unlinkSync() { throw Error('synthetic-cleanup-failure'); }
    });
    const store = createStore({...options, fs: fileSystem});
    assert.throws(() => store.setToken('synthetic-token'), error => error === failure);
    assert.throws(() => fs.fstatSync(descriptor), {code: 'EBADF'});
    assert.equal(store.getRuntimeConfig().token, '');
});

test('failed rename cleanup preserves a replacement at the temporary path', t => {
    const options = fixture(t);
    let replaced;
    const fileSystem = Object.assign({}, fs, {
        renameSync(source) {
            fs.renameSync(source, source + '.moved');
            fs.writeFileSync(source, 'unowned-replacement');
            replaced = source;
            throw Error('synthetic-replacement');
        }
    });
    const store = createStore({...options, fs: fileSystem});
    assert.throws(() => store.setToken('synthetic-token'), /synthetic-replacement/);
    assert.equal(fs.readFileSync(replaced, 'utf8'), 'unowned-replacement');
    assert.equal(fs.existsSync(store.getConfigPaths().secretsPath), false);
});

for (const operation of ['disable', 'restore', 'discovery']) {
    test('failed ' + operation + ' persists neither memory nor disk; a retry survives restart', t => {
        const options = fixture(t);
        let fail = false;
        const fileSystem = Object.assign({}, fs, {
            renameSync(source, destination) {
                if (fail) throw Error('synthetic-rename');
                return fs.renameSync(source, destination);
            }
        });
        const store = createStore({...options, fs: fileSystem});
        store.applyDiscovery([rule]);
        if (operation === 'restore') store.disableRule(rule.id);
        const beforePublic = store.getPublicConfig();
        const beforeRuntime = store.getRuntimeConfig();
        const beforeFile = fs.readFileSync(store.getConfigPaths().configPath);
        const change = () => operation === 'disable' ? store.disableRule(rule.id)
            : operation === 'restore' ? store.restoreAutoRule(rule.id)
                : store.applyDiscovery([
                    {...rule, cloudPrefix: '/changed'},
                    {id: 'auto-two', sourcePrefix: '/media/second', cloudPrefix: '/cloud/second'}
                ]);
        fail = true;
        assert.throws(change, /synthetic-rename/);
        assert.deepEqual(store.getPublicConfig(), beforePublic);
        assert.deepEqual(store.getRuntimeConfig(), beforeRuntime);
        assert.deepEqual(fs.readFileSync(store.getConfigPaths().configPath), beforeFile);
        fail = false;
        const result = change();
        assert.notDeepEqual(result, beforePublic);
        assert.deepEqual(createStore(options).getPublicConfig(), result);
        assert.deepEqual(fs.readdirSync(options.rootDir), ['strm-resolver.json']);
    });
}
