'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const {harness, storage} = require('./helpers/api-client-amd.cjs');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const item = {Id: '123', ParentId: '456', ServerId: 'synthetic-server', Type: 'Movie', Name: 'Synthetic item'};

function clientFor(address, version, frozen = false) {
    const overrides = frozen ? {'apiclient.js': read('vendor/web-snapshot/www/modules/emby-apiclient/apiclient.js')} :
        process.env.ETE_DELETE_API_SOURCE ? {'apiclient.js': fs.readFileSync(process.env.ETE_DELETE_API_SOURCE, 'utf8')} : {};
    const h = harness(fetch, {}, overrides);
    const Api = h.load('apiclient.js').default;
    const client = new Api(storage(), {isSupported: () => false}, address, 'Synthetic client', 'test', 'Synthetic device', 'synthetic-device', 1);
    client.enableAutomaticNetworking = false;
    client.setSystemInfo({Id: item.ServerId, Version: version});
    assert.equal(client.serverVersion(), version);
    const messages = [];
    h.load('events.js').default.on(client, 'message', (event, message) => messages.push(message));
    return {client, messages};
}

function deleteUi(client, cancel = false) {
    const alerts = [], confirmations = [], navigations = [];
    const exports = {};
    const dependencies = [exports, {default: {getApiClient: () => client}},
        {default: {showItem: (...args) => navigations.push(args)}}, {default: {}},
        {default: {translate: key => key}}, {default: options => {
            confirmations.push(options);
            return cancel ? Promise.reject(new Error('synthetic cancelled')) : Promise.resolve();
        }}, {default: text => {alerts.push(text); return Promise.resolve();}}];
    vm.runInNewContext(read('vendor/web-snapshot/www/modules/common/deletehelper.js'), {
        define: (names, factory) => factory(...dependencies), console: {log() {}}
    });
    return {run: () => exports.default.deleteItem({item, navigate: true}), alerts, confirmations, navigations};
}

async function service(t, status = 204) {
    const requests = [];
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        requests.push({method: req.method, path: url.pathname});
        if (req.method === 'GET' && url.pathname === '/emby/Items/123/DeleteInfo') {
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({Paths: []}));
        } else if ((req.method === 'POST' && url.pathname === '/emby/Items/123/Delete') ||
                   (req.method === 'DELETE' && url.pathname === '/emby/Items/123')) {
            res.writeHead(status); res.end();
        } else {res.writeHead(404); res.end();}
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    return {requests, address: `http://127.0.0.1:${server.address().port}`};
}

for (const [version, method, endpoint] of [
    ['4.7.0.32', 'DELETE', '/emby/Items/123'],
    ['4.7.0.33', 'POST', '/emby/Items/123/Delete'],
    ['4.10.0.0', 'POST', '/emby/Items/123/Delete']
]) {
    test(`actual delete UI matches frozen Web request and success event on ${version}`, async t => {
        const mock = await service(t);
        const outcomes = [];
        for (const frozen of [true, false]) {
            const {client, messages} = clientFor(mock.address, version, frozen);
            const ui = deleteUi(client);
            await ui.run();
            assert.equal(ui.confirmations.length, 1);
            assert.equal(ui.confirmations[0].primary, 'cancel');
            assert.deepEqual(ui.alerts, []);
            assert.equal(ui.navigations.length, 1);
            assert.deepEqual(ui.navigations[0], [item.ParentId, item.ServerId]);
            assert.equal(messages.length, 1);
            const message = JSON.parse(JSON.stringify(messages[0]));
            assert.deepEqual(message, {MessageType: 'LibraryChanged', Data: {
                ItemsAdded: [], ItemsRemoved: [item.Id], ItemsUpdated: [],
                FoldersRemovedFrom: [item.ParentId], IsLocalEvent: true
            }});
            outcomes.push(message);
        }
        assert.deepEqual(outcomes[0], outcomes[1]);
        assert.deepEqual(mock.requests, Array.from({length: 2}, () => [
            {method: 'GET', path: '/emby/Items/123/DeleteInfo'}, {method, path: endpoint}
        ]).flat());
    });
}

for (const status of [403, 500]) {
    test(`real HTTP ${status} stays rejected and never publishes deletion or navigates`, async t => {
        const mock = await service(t, status);
        const {client, messages} = clientFor(mock.address, '4.10.0.0');
        const sentinel = Promise.resolve('synthetic cached views');
        client._userViewsPromise = sentinel;
        const ui = deleteUi(client);
        await assert.rejects(ui.run(), error => error.status === status);
        assert.deepEqual(mock.requests, [
            {method: 'GET', path: '/emby/Items/123/DeleteInfo'},
            {method: 'POST', path: '/emby/Items/123/Delete'}
        ]);
        assert.deepEqual(ui.alerts, ['ErrorDeletingItem']);
        assert.deepEqual(messages, []);
        assert.deepEqual(ui.navigations, []);
        assert.strictEqual(client._userViewsPromise, sentinel);
    });
}

test('cancelled original confirmation sends no deletion request', async t => {
    const mock = await service(t);
    const {client, messages} = clientFor(mock.address, '4.10.0.0');
    const ui = deleteUi(client, true);
    await assert.rejects(ui.run(), /synthetic cancelled/);
    assert.deepEqual(mock.requests, [{method: 'GET', path: '/emby/Items/123/DeleteInfo'}]);
    assert.deepEqual(messages, []);
    assert.deepEqual(ui.alerts, []);
});

test('single deletion invalidates view cache and batch deletion retains its endpoint', async () => {
    const {client, messages} = clientFor('http://synthetic.invalid', '4.10.0.0');
    const requests = [];
    client.ajax = options => {requests.push(options); return Promise.resolve('synthetic success');};
    client._userViewsPromise = Promise.resolve('synthetic cached views');
    assert.equal(await client.deleteItem(item), 'synthetic success');
    assert.equal(client._userViewsPromise, null);
    await client.deleteItems([item, {...item, Id: '789'}]);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].type, 'POST');
    assert.equal(new URL(requests[1].url).pathname, '/emby/Items/Delete');
    assert.equal(new URL(requests[1].url).searchParams.get('Ids'), '123,789');
    assert.equal(messages.length, 2);
});
