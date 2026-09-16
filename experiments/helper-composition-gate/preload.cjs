'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const allowedEvents = new Set([
  'ready', 'metrics', 'mousemove', 'hover', 'button', 'slider',
  'keydown', 'focus', 'blur'
]);

contextBridge.exposeInMainWorld('compositionGate', {
  onState(callback) {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('composition-gate-state', (_event, value) => callback(value));
  },
  setInteractive(value) {
    ipcRenderer.send('composition-gate-interactive', value === true);
  },
  report(type, detail = {}) {
    if (!allowedEvents.has(type)) return;
    ipcRenderer.send('composition-gate-event', { type, detail });
  },
  security: Object.freeze({
    sandboxed: process.sandboxed === true
  })
});
