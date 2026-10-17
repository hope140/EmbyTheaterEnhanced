'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const {namedFunction} = require('./fixtures/settings-menu-routes.cjs');
const {FakeScheduler} = require('./fixtures/refresh-rate-lifecycle.cjs');
const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src/electronapp/main.js'), 'utf8');
const player = fs.readFileSync(path.join(root, 'src/electronapp/plugins/libmpv.js'), 'utf8');
const device = String.raw`\\.\DISPLAY1`;

function protocol(options = {}) {
    let handler, child;
    const clock = new FakeScheduler();
    const spawns = [], replies = [];
    vm.runInNewContext(namedFunction(main, 'registerFreshRate') + '\nregisterFreshRate();', {
        electron: {protocol: {registerStringProtocol: (_name, value) => {handler = value;}}},
        process: {platform: options.platform || 'win32', arch: 'x64'}, __dirname: '/synthetic-app',
        Date: {now: () => clock.now}, setTimeout: clock.setTimeout.bind(clock), clearTimeout: clock.clearTimeout.bind(clock),
        require: name => {
            if (name === 'path') return path;
            assert.equal(name, 'child_process');
            return {spawn: (file, args) => {
                spawns.push({file, args: Array.from(args)});
                if (options.spawnError) throw options.spawnError;
                child = new EventEmitter(); child.stdout = new EventEmitter(); return child;
            }};
        }
    }, {timeout: 1000});
    return {
        spawns, replies,
        invoke(action) {handler({url: 'electronrefreshrate://' + action}, value => {replies.push(value); if (options.callbackError) throw options.callbackError;});},
        get child() {return child;}
    };
}

for (const [action, args] of [
    ['list_possible', ['list_possible', device]],
    ['current', ['current', device]],
    ['change?rate=59.94', ['change', device, '59.94']]
]) {
    test('refresh protocol preserves fixed utility and arguments for ' + action, () => {
        const fixture = protocol(); fixture.invoke(action);
        assert.equal(fixture.spawns.length, 1);
        assert.equal(fixture.spawns[0].file, path.join('/synthetic-app', 'libmpv', 'x64', 'refreshrate.exe'));
        assert.deepEqual(fixture.spawns[0].args, args);
        fixture.child.stdout.emit('data', Buffer.from('59.'));
        fixture.child.stdout.emit('data', Buffer.from('94 Hz'));
        fixture.child.emit('close', 0); fixture.child.emit('close', 0);
        assert.deepEqual(fixture.replies, ['59.94 Hz']);
    });
}

test('unknown refresh action completes empty without starting the utility', () => {
    const fixture = protocol(); fixture.invoke('unknown');
    assert.deepEqual(fixture.spawns, []); assert.deepEqual(fixture.replies, ['']);
});
test('synchronous refresh spawn failure completes empty once', () => {
    const fixture = protocol({spawnError: new Error('synthetic spawn failure')});
    assert.doesNotThrow(() => fixture.invoke('current'));
    assert.deepEqual(fixture.replies, ['']);
});
test('refresh child error followed by close completes only once with empty output', () => {
    const fixture = protocol(); fixture.invoke('current');
    fixture.child.stdout.emit('data', Buffer.from('partial'));
    assert.doesNotThrow(() => fixture.child.emit('error', new Error('synthetic ENOENT')));
    fixture.child.emit('close', -1);
    assert.deepEqual(fixture.replies, ['']);
});
test('refresh completion closes before invoking the original callback', () => {
    const error = new Error('synthetic callback failure');
    const fixture = protocol({callbackError: error}); fixture.invoke('current');
    assert.throws(() => fixture.child.emit('close', 0), value => value === error);
    assert.doesNotThrow(() => fixture.child.emit('close', 0));
    assert.equal(fixture.replies.length, 1);
});
test('non-Windows refresh request keeps the empty non-spawning path', () => {
    const fixture = protocol({platform: 'linux'}); fixture.invoke('current');
    assert.deepEqual(fixture.spawns, []); assert.deepEqual(fixture.replies, ['']);
});

for (const name of ['getRefreshRate', 'setRefreshRate']) {
    function request() {
        let xhr;
        const clock = new FakeScheduler();
        const call = name === 'getRefreshRate' ? '()' : '(60)';
        const promise = vm.runInNewContext(namedFunction(player, 'requestRefreshRate') + '\n' + namedFunction(player, name) + '\n' + name + call, {
            Promise,
            Date: {now: () => clock.now}, setTimeout: clock.setTimeout.bind(clock), clearTimeout: clock.clearTimeout.bind(clock),
            XMLHttpRequest: class {
                constructor() {xhr = this;}
                open(method, url) {this.method = method; this.url = url;}
                send() {}
            }
        }, {timeout: 1000});
        assert.equal(xhr.method, 'POST');
        assert.equal(xhr.url, name === 'getRefreshRate' ? 'electronrefreshrate://current' : 'electronrefreshrate://change?rate=60');
        return {promise, xhr};
    }
    for (const [response, expected] of [['60 Hz', '60'], ['', undefined], ['synthetic failure without digits', undefined]]) {
        test(name + ' settles original response shape: ' + (response || 'empty'), async () => {
            const fixture = request();
            let settled = false, value;
            fixture.promise.then(result => {settled = true; value = result;});
            fixture.xhr.response = response;
            assert.doesNotThrow(() => fixture.xhr.onload.call(fixture.xhr));
            await Promise.resolve(); await Promise.resolve();
            assert.equal(settled, true); assert.equal(value, expected);
        });
    }
    test(name + ' preserves XHR network rejection', async () => {
        const fixture = request(), error = new Error('synthetic XHR error');
        const rejected = assert.rejects(fixture.promise, value => value === error);
        fixture.xhr.onerror(error); await rejected;
    });
}
