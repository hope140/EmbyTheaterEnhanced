'use strict';
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const appUrl = pathToFileURL(path.resolve(__dirname, '../../src/electronapp/www/index.html')).href;

// Existing positive IPC fixtures must model Electron's main-frame identity.
function eventFor(sender) {
    if (!sender.mainFrame) sender.mainFrame = {url: appUrl};
    return {sender, senderFrame: sender.mainFrame};
}
module.exports = {appUrl, eventFor};
