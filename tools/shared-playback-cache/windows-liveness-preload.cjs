'use strict';
const {contextBridge, ipcRenderer} = require('electron');
const LABELS = new Set(['entered', 'returned', 'settled', 'rejected']);
contextBridge.exposeInMainWorld('ownedLiveness', Object.freeze({
  echo(seq) {
    if (!Number.isInteger(seq) || seq < 1 || seq > 4) throw Error('invalid-sequence');
    return ipcRenderer.invoke('ete-owned-liveness-echo', seq);
  },
  report(label) {
    if (!LABELS.has(label)) throw Error('invalid-observation');
    ipcRenderer.send('ete-owned-liveness-report', label);
  }
}));
