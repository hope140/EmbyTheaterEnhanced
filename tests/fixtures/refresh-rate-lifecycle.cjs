'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const {namedFunction} = require('./settings-menu-routes.cjs');

const root = path.resolve(__dirname, '../..');
const mainSource = fs.readFileSync(process.env.ETE_REFRESH_RATE_MAIN_SOURCE || path.join(root, 'src/electronapp/main.js'), 'utf8');
const playerSource = fs.readFileSync(process.env.ETE_REFRESH_RATE_PLAYER_SOURCE || path.join(root, 'src/electronapp/plugins/libmpv.js'), 'utf8');

class FakeScheduler {
    constructor(now = 1000) {
        this.now = now;
        this.nextId = 1;
        this.jobs = new Map();
    }

    setTimeout(callback, delay) {
        const id = this.nextId++;
        this.jobs.set(id, {at: this.now + Math.max(0, Number(delay) || 0), callback});
        return id;
    }

    clearTimeout(id) {
        this.jobs.delete(id);
    }

    advance(ms) {
        const target = this.now + ms;
        for (;;) {
            const next = [...this.jobs.entries()]
                .filter(([, job]) => job.at <= target)
                .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
            if (!next) break;
            const [id, job] = next;
            this.jobs.delete(id);
            this.now = job.at;
            job.callback();
        }
        this.now = target;
    }
}

function createProtocol(options = {}) {
    const scheduler = options.scheduler || new FakeScheduler();
    let handler;
    const children = [];
    const spawns = [];
    const replies = [];
    let callbackIndex = 0;
    const callbacks = options.callbacks || [];
    const runtime = {
        electron: {protocol: {registerStringProtocol: (_scheme, value) => {handler = value;}}},
        process: {platform: options.platform || 'win32', arch: 'x64'},
        __dirname: '/synthetic-app',
        setTimeout: scheduler.setTimeout.bind(scheduler),
        clearTimeout: scheduler.clearTimeout.bind(scheduler),
        Date: {now: () => scheduler.now},
        require(name) {
            if (options.onRequire) options.onRequire(name, scheduler);
            else if (options.requireAdvanceOn === name && options.requireAdvanceMs) scheduler.advance(options.requireAdvanceMs);
            if (name === 'path') return path;
            if (name !== 'child_process') throw new Error('Unexpected module: ' + name);
            return {spawn(file, args) {
                spawns.push({file, args: Array.from(args)});
                if (options.spawnError) throw options.spawnError;
                if (options.onSpawnClockAdvance) options.onSpawnClockAdvance(scheduler);
                else if (options.spawnAdvanceMs) scheduler.advance(options.spawnAdvanceMs);
                const childOptions = (options.children || [])[children.length] || {};
                const child = new EventEmitter();
                child.stdout = new EventEmitter();
                child.pid = childOptions.noPid ? undefined : childOptions.pid === undefined ? 7000 + children.length : childOptions.pid;
                child.killCalls = [];
                child.kill = signal => {
                    child.killCalls.push(signal);
                    if (childOptions.killError) throw childOptions.killError;
                    return childOptions.killResult === undefined ? true : childOptions.killResult;
                };
                children.push(child);
                return child;
            }};
        }
    };
    const register = vm.runInNewContext(namedFunction(mainSource, 'registerFreshRate') + '\nregisterFreshRate', runtime,
        {timeout: 1000, filename: 'src/electronapp/main.js'});
    const shutdown = register();
    return {
        scheduler, children, spawns, replies, shutdown,
        invoke(action, callback) {
            const index = callbackIndex++;
            handler({url: 'electronrefreshrate://' + action}, value => {
                replies.push({index, value});
                const failure = callbacks[index];
                if (failure) throw failure;
                if (callback) callback(value);
            });
        }
    };
}

function createRefreshRateRequests() {
    const scheduler = new FakeScheduler();
    const requests = [];
    class FakeXHR {
        constructor() {
            this.openCalls = [];
            this.sendCalls = 0;
            this.abortCalls = 0;
            this.response = '';
            this.abortListener = null;
            Object.defineProperty(this, 'onabort', {
                get: () => this.currentAbortListener,
                set: listener => {
                    this.currentAbortListener = listener;
                    if (listener) this.abortListener = listener;
                }
            });
            requests.push(this);
        }
        open(method, url) { this.openCalls.push({method, url}); }
        send() { this.sendCalls++; }
        abort() {
            this.abortCalls++;
            if (this.abortListener) this.abortListener({type: 'abort'});
        }
    }
    const requestHelperStart = playerSource.indexOf('function requestRefreshRate(');
    const definitions = [
        requestHelperStart < 0 ? null : namedFunction(playerSource, 'requestRefreshRate'),
        namedFunction(playerSource, 'getRefreshRateList'),
        namedFunction(playerSource, 'getRefreshRate'),
        namedFunction(playerSource, 'setRefreshRate')
    ].filter(Boolean);
    const context = {
        Promise,
        XMLHttpRequest: FakeXHR,
        setTimeout: scheduler.setTimeout.bind(scheduler),
        clearTimeout: scheduler.clearTimeout.bind(scheduler),
        Date: {now: () => scheduler.now}
    };
    vm.runInNewContext(definitions.join('\n') + '\nthis.refreshRateApi = {getRefreshRateList, getRefreshRate, setRefreshRate};',
        context, {timeout: 1000, filename: 'src/electronapp/plugins/libmpv.js'});
    return {scheduler, requests, api: context.refreshRateApi};
}

async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
}

module.exports = {FakeScheduler, createProtocol, createRefreshRateRequests, flushPromises};
