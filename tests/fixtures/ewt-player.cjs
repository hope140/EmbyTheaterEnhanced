'use strict';

// Synthetic native IPC only: no process, network, credentials or actual media.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const nativeClient = require('../../src/electronapp/native-helper/client');

function decorate(player, events) {
    const commands = [], pending = [], diagnostics = [];
    const ipc = new EventEmitter();
    let generation = 0, message, factory, paused = false, failSeek = false;
    const windowEvents = new EventTarget();
    const dispatch = type => windowEvents.dispatchEvent(new Event(type));
    ipc.send = (channel, data) => { if (channel === 'enhanced-diagnostics-log') diagnostics.push(data); };
    ipc.invoke = async (_channel, request) => {
        if (request.operation === 'create') return {status: 'ok', mode: 'native-helper', endpointId: 'fixture-endpoint'};
        if (request.operation === 'begin-generation') return {status: 'ok', generationId: ++generation};
        if (request.operation === 'command') {
            commands.push(request.payload);
            const data = request.payload.data;
            if (Array.isArray(data) && data[0] === 'loadfile') queueMicrotask(() => dispatch('core-playing'));
            if (Array.isArray(data) && data[0] === 'seek') {
                if (failSeek) return {status: 'error', reason: 'fixture-private-token-must-not-be-logged'};
                return new Promise(resolve => pending.push(() => resolve({status: 'accepted'})));
            }
        }
        return {status: 'ok'};
    };
    const document = {
        querySelector: () => null,
        body: {firstChild: null, insertBefore(node) { node.parentNode = this; }, removeChild() {}},
        createElement: () => ({style: {}, classList: {add() {}, remove() {}}})
    };
    const context = {
        define: (_deps, callback) => { factory = callback; },
        window: {platform: 'win32', ipc}, document,
        addEventListener: windowEvents.addEventListener.bind(windowEvents),
        removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
        dispatchEvent: windowEvents.dispatchEvent.bind(windowEvents),
        Event, CustomEvent: class extends Event { constructor(name, options) { super(name); this.detail = options && options.detail; } },
        AbortController, setTimeout, clearTimeout, console: {log() {}}
    };
    const source = process.env.ETE_EWT_LIBMPV_SOURCE || path.join(__dirname, '../../src/electronapp/plugins/libmpv.js');
    vm.runInNewContext(fs.readFileSync(source, 'utf8'), context, {filename: 'libmpv.js'});
    const Player = factory({}, {getSubtitleUrl() { return ''; }}, {mapPath: (_player, file) => file}, events,
        {showVideoOsd: async () => {}, setTransparency() {}}, {get() {}, set() {}}, {getSubtitleAppearanceSettings: () => ({})},
        (_deps, callback) => callback(), {},
        {resolveAsync: async info => ({type: 'native', source: info.nativeSource})}, null, null, null,
        {install() {}, createNative: () => ({
            cancel() {}, playbackStarted() {}, playbackReady() {}, playbackFailed() {}, loadingToken: () => null,
            isActive: () => false, admit: () => false, replacement() {}
        })},
        {create: async options => {
            const bridge = await nativeClient.create(options);
            bridge.endpoint.addEventListener('message', event => { message = event.data; });
            return bridge;
        }});
    Player.call(player);
    function property(name, value, eventGeneration = generation) {
        if (name === 'pause') paused = value;
        ipc.emit(nativeClient.EVENT_CHANNEL, {}, {type: 'property_change', generationId: eventGeneration, data: {name, value}});
    }
    return {
        commands, diagnostics, property,
        restart: (seconds, eventGeneration = generation) => property('playback-restart', seconds, eventGeneration),
        acknowledge: (index = 0) => { const resolve = pending.splice(index, 1)[0]; if (!resolve) throw Error('No pending fixture Seek'); resolve(); },
        failSeek: () => { failSeek = true; },
        generation: () => generation, paused: () => paused, lastMessage: () => message
    };
}

module.exports = {decorate};
