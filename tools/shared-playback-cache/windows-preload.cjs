'use strict';
// Owned harness shell only. No general-purpose renderer filesystem/IPC access.
const {contextBridge, ipcRenderer} = require('electron');
const INVOKE = new Set(['enhanced-native-helper-call', 'enhanced-cd2-resolve', 'enhanced-strm-config-get']);
const NOTIFY = new Set(['enhanced-native-helper-notify', 'enhanced-cd2-cancel', 'enhanced-diagnostics-log']);
let listener;
contextBridge.exposeInMainWorld('prefixHarness', {
  source(member) {if (member !== 'www/modules/alameda/alameda.js') throw Error('harness-source-forbidden'); return ipcRenderer.sendSync('shared-cache-harness-alameda');},
  report(value) {ipcRenderer.send('shared-cache-harness-report', value);},
  invoke(channel, payload) {if (!INVOKE.has(channel)) return Promise.reject(Error('harness-channel-forbidden')); return ipcRenderer.invoke(channel, payload);},
  send(channel, payload) {if (!NOTIFY.has(channel)) throw Error('harness-channel-forbidden'); ipcRenderer.send(channel, payload);},
  listen(callback) {if (listener) ipcRenderer.removeListener('enhanced-native-helper-event', listener);
    listener = (_event, value) => callback(value); ipcRenderer.on('enhanced-native-helper-event', listener);},
  unlisten() {if (listener) ipcRenderer.removeListener('enhanced-native-helper-event', listener); listener = null;}
});
