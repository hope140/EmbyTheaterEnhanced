'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appHostSource = fs.readFileSync(path.join(__dirname, '../src/electronapp/apphost.js'), 'utf8');

function createAppHost() {
    let appHost;
    const requests = [];
    const context = {
        define(_dependencies, factory) {
            appHost = factory({trigger() {}});
        },
        document: {addEventListener() {}},
        navigator: {},
        XMLHttpRequest: class {
            open(method, url, asynchronous) {
                requests.push({method, url, asynchronous});
            }
            send() {}
        }
    };
    context.self = context;
    context.window = context;
    vm.runInNewContext(appHostSource, context, {filename: 'apphost.js'});
    return {appHost, requests};
}

test('AppHost no longer advertises or exposes legacy system actions', () => {
    const {appHost} = createAppHost();
    for (const action of ['sleep', 'shutdown', 'restart']) {
        assert.equal(appHost.supports(action), false, action + ' must not be advertised');
        assert.equal(Object.prototype.hasOwnProperty.call(appHost, action), false,
            action + ' must not have a call entry');
    }
    assert.equal(appHost.supports('windowstate'), true);
    assert.equal(appHost.supports('exit'), true);
});

test('AppHost preserves its normal window-state and exit command entries', () => {
    const {appHost, requests} = createAppHost();
    appHost.setWindowState('Maximized');
    appHost.exit();
    assert.deepEqual(requests, [
        {method: 'GET', url: 'electronapphost://windowstate-Maximized', asynchronous: true},
        {method: 'GET', url: 'electronapphost://exit', asynchronous: true}
    ]);
});
