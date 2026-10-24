'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {createRequire} = require('node:module'), {EventEmitter} = require('node:events');
const fixture = require('./helpers/range-fixture-root.cjs');

test('fixture port preflight parses read-only excluded ranges and selects identity before binding', () => {
    assert.deepEqual(fixture.excludedRanges('Start Port End Port\r\n 49600 49699\r\n 50000 50059 *\r\n'), [{start: 49600, end: 49699}, {start: 50000, end: 50059}]);
    assert.throws(() => fixture.excludedRanges(' 65535 65536'), /invalid-Windows/);
    const root = path.resolve('fixture-root'), port = fixture.guardPort(path.join(root, 'cache'));
    const selected = fixture.selectRoot(root, ['cache'], [{start: port, end: port}]);
    assert.notEqual(selected, root);
    assert.notEqual(fixture.guardPort(path.join(selected, 'cache')), port);
    const occupied = new Set([fixture.guardPort(path.join(root, 'prefix'))]);
    const multiple = fixture.selectRoot(root, ['prefix', 'next-episode-prefix-v1'], [], occupied);
    assert(['prefix', 'next-episode-prefix-v1'].every(relative => !occupied.has(fixture.guardPort(path.join(multiple, relative)))));
    assert.throws(() => fixture.selectRoot(root, ['cache'], [{start: 1, end: 65535}]), /no-admissible/);
});

test('fixture prediction matches unchanged product guard and a real bind error is never retried (transport contract)', async () => {
    const file = path.resolve(__dirname, '../src/electronapp/enhanced/playback-range-store.js'), real = createRequire(file);
    const module = {exports: {}}, calls = [], servers = [];
    class Server extends EventEmitter {
        listen(options, callback) {calls.push(options); queueMicrotask(() => this.failure ? this.emit('error', Object.assign(Error('denied'), {code: 'EACCES'})) : callback());}
        unref() {} close(callback) {callback();}
    }
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {module, Buffer, process, require: name => name === 'node:net' ? {createServer() {const server = new Server(); servers.push(server); return server;}} : real(name)}, {filename: file});
    const root = path.resolve('fixture-root'), guard = await module.exports.acquireGuard(root);
    assert.equal(calls[0].port, fixture.guardPort(root)); assert.equal(calls[0].host, '127.0.0.1');
    assert.equal(calls[0].exclusive, true); await guard.close();
    const prior = calls.length, next = module.exports.acquireGuard(root); servers.at(-1).failure = true;
    await assert.rejects(next, {code: 'EACCES'}); assert.equal(calls.length, prior + 1);
});

test('range fixtures contain no non-native temporary canonicalization', () => {
    const files = fs.readdirSync(__dirname).filter(name => /^playback-(?:range|prefix|buffer-disk)/.test(name) && name.endsWith('.test.cjs'));
    files.push('ci-playback-range-smoke.test.cjs', 'helpers/range-runtime-v3-fixture.cjs');
    for (const name of files) {
        const source = fs.readFileSync(path.join(__dirname, name), 'utf8');
        assert.doesNotMatch(source, /realpathSync\((?:await )?(?:fs|fsp)\.mkdtemp|await (?:fs|fsp)\.realpath\(await (?:fs|fsp)\.mkdtemp/, name);
    }
});

test('temporary fixture root is native physical identity; Windows probes use show-only APIs', () => {
    const root = fixture.temporaryRoot('ete-range-root-test-', ['cache']);
    try {assert.equal(root, fs.realpathSync.native(root)); assert.equal(fs.lstatSync(root).isSymbolicLink(), false);}
    finally {fs.rmSync(root, {recursive: true, force: true});}
    const source = fs.readFileSync(path.join(__dirname, 'helpers/range-fixture-root.cjs'), 'utf8');
    assert.match(source, /'ipv4', 'show', 'excludedportrange', 'protocol=tcp'/);
    assert.match(source, /'netstat.exe', \['-ano', '-p', 'tcp'\]/);
    assert.doesNotMatch(source, /['"](?:add|delete|set|reset)['"]|execFileSync\([^\n]*(?:powershell|cmd\.exe)|listen\(/);
});
