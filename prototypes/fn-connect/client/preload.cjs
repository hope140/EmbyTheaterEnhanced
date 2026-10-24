'use strict';
const {contextBridge, ipcRenderer} = require('electron');
const actions = new Set(['defaults', 'add', 'target', 'verify', 'remove', 'fixture-media']);
contextBridge.exposeInMainWorld('fnExperiment', Object.freeze({
    security: Object.freeze({sandboxed: process.sandboxed === true, contextIsolated: process.contextIsolated === true}),
    action(name, payload) {
        if (!actions.has(name)) return Promise.resolve({error: 'INVALID_ACTION'});
        return ipcRenderer.invoke('fn-experiment-action', name, payload);
    },
    onState(listener) {
        ipcRenderer.on('fn-experiment-state', (_event, state) => listener(state));
    }
}));
