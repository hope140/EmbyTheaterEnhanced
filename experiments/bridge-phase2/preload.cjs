'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// Harness exposes a fixed status stream only. No native loader or generic IPC.
contextBridge.exposeInMainWorld('spike', { onStatus: callback => {
  ipcRenderer.on('spike-status', (_event, value) => callback(value));
} });
