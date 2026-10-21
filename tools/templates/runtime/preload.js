const { ipcRenderer } = require('electron');
window.ipc = ipcRenderer;
const fs = require('fs');
window.fs = fs;
const os = require('os');
window.dirName = os.tmpdir();
window.appdata = process.env.APPDATA;
