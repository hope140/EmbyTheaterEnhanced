'use strict';

const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/electronapp/plugins/mpvplayer/downloads.js'), 'utf8');
class Element {
    constructor() {this.children = []; this.listeners = {}; this.value = '';}
    set textContent(value) {this.value = value; this.children = [];}
    get textContent() {return this.value;}
    appendChild(child) {this.children.push(child);}
    addEventListener(name, listener) {this.listeners[name] = listener;}
    click() {return this.listeners.click.call(this);}
}
function fixture(downloads) {
    const elements = {}, timers = new Set(); let View;
    const view = {querySelector(selector) {return elements[selector] ||= new Element();}};
    function BaseView() {}
    BaseView.prototype.onPause = BaseView.prototype.onResume = function () {};
    vm.runInNewContext(source, {
        define(_deps, factory) {View = factory(BaseView, downloads);},
        document: {createElement() {return new Element();}},
        setInterval(fn) {timers.add(fn); return fn;}, clearInterval(fn) {timers.delete(fn);}
    });
    return {controller: new View(view), elements, timers};
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const snapshot = directory => ({status: 'ok', directory, tasks: [{id: 'task', title: '<img src=x onerror=alert(1)>', state: 'failed', reason: 'network', bytes: 10, total: 20, directory: '/original'}]});

test('download settings render text, change default without rewriting task directory, and retry exact task', async () => {
    let directory = '/default'; const retries = [];
    const f = fixture({status: async () => snapshot(directory), directory: async () => {directory = '/new'; return {status: 'ok'};}, retry: async id => retries.push(id), message: () => '未完成'});
    await f.controller.onResume();
    assert.equal(f.elements['.downloadTasks'].children[0].children[0].textContent, '<img src=x onerror=alert(1)>');
    assert.equal(f.elements['.downloadTasks'].children[0].children[0].children.length, 0);
    await f.elements['.btnDownloadDirectory'].click(); await tick();
    assert.equal(f.elements['.downloadDirectory'].textContent, '/new');
    assert.equal(f.elements['.downloadTasks'].children[0].children[2].textContent, '/original');
    await f.elements['.downloadTasks'].children[0].children.at(-1).click(); await tick();
    assert.deepEqual(retries, ['task']);
    f.controller.destroy(); assert.equal(f.timers.size, 0);
});

test('older refresh, paused-page response and retired directory dialog cannot repaint settings', async () => {
    const pending = []; let finishDirectory;
    const f = fixture({status: () => new Promise(resolve => pending.push(resolve)), directory: () => new Promise(resolve => {finishDirectory = resolve;}), message: () => 'error'});
    const first = f.controller.onResume(), second = f.controller.refresh();
    pending[1](snapshot('/new')); await second;
    pending[0](snapshot('/old')); await first;
    assert.equal(f.elements['.downloadDirectory'].textContent, '/new');
    const late = f.controller.refresh(), dialog = f.elements['.btnDownloadDirectory'].click();
    f.controller.onPause();
    pending[2](snapshot('/late')); await late;
    finishDirectory({status: 'ok'}); await dialog;
    assert.equal(pending.length, 3);
    assert.equal(f.elements['.downloadDirectory'].textContent, '/new');
    assert.equal(f.timers.size, 0);
    f.controller.destroy();
});
