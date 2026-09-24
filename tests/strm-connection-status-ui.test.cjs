'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/electronapp/plugins/mpvplayer/strm.js'), 'utf8');

function createPage(responses) {
    let View;
    const cards = Array.from({length: 3}, () => ({textContent: '', role: '', setAttribute(name, value) {
        if (name === 'role') this.role = value;
    }}));
    const connection = {textContent: '', role: '', setAttribute(name, value) {
        if (name === 'role') this.role = value;
    }};
    const button = {disabled: false};
    const view = {
        querySelector(selector) {
            if (selector === '.connectionState') return connection;
            if (selector === '.btnTestConnection') return button;
            throw new Error('unexpected selector: ' + selector);
        },
        querySelectorAll(selector) {
            if (selector === '.ete-strm-rule-connection') return cards;
            throw new Error('unexpected selector: ' + selector);
        }
    };
    function BaseView() {}
    vm.runInNewContext(source, {
        define(_dependencies, factory) { View = factory({}, BaseView, null, null, null, null, null, {}); },
        window: {ipc: {invoke: async () => responses.shift()}}
    }, {filename: 'strm.js'});
    const page = Object.create(View.prototype);
    page.view = view;
    page.connectionStatus = 'unknown';
    page.connectionRevision = -1;
    page.connectionRequestSequence = 0;
    return {page, cards, connection, button};
}

test('connection test success refreshes every visible rule card immediately', async () => {
    const {page, cards, connection, button} = createPage([
        {status: 'ok', reason: 'connected', connectionStatus: 'connected', connectionRevision: 1}
    ]);
    await page.testConnection();
    assert.equal(connection.textContent, 'CloudDrive2 最近测试：已连接');
    assert.deepEqual(cards.map(card => card.textContent), Array(3).fill('CloudDrive2 最近测试：已连接'));
    assert.equal(button.disabled, false);
});

test('reconnect failure refreshes all cards and an older response cannot restore connected', async () => {
    const {page, cards, connection} = createPage([
        {status: 'ok', reason: 'connected', connectionStatus: 'connected', connectionRevision: 1},
        {status: 'connection_failed', reason: 'connection_failed', connectionStatus: 'failed', connectionRevision: 2}
    ]);
    await page.testConnection();
    await page.testConnection();
    assert.equal(connection.textContent, 'CloudDrive2 最近测试：连接失败');
    assert.equal(connection.role, 'alert');
    assert.deepEqual(cards.map(card => card.textContent), Array(3).fill('CloudDrive2 最近测试：连接失败'));
    assert.equal(page.applyConnectionSnapshot({connectionStatus: 'connected', connectionRevision: 1}), false);
    assert.deepEqual(cards.map(card => card.textContent), Array(3).fill('CloudDrive2 最近测试：连接失败'));
});

test('a late failed status read cannot erase a newer successful connection test', async () => {
    let rejectOldRead;
    const oldRead = new Promise((_resolve, reject) => { rejectOldRead = reject; });
    const {page, cards, connection} = createPage([
        oldRead,
        {status: 'ok', reason: 'connected', connectionStatus: 'connected', connectionRevision: 1}
    ]);
    const pending = page.refreshConnectionStatus();
    await page.testConnection();
    rejectOldRead(new Error('synthetic old read failure'));
    await pending;
    assert.equal(connection.textContent, 'CloudDrive2 最近测试：已连接');
    assert.deepEqual(cards.map(card => card.textContent), Array(3).fill('CloudDrive2 最近测试：已连接'));
});
