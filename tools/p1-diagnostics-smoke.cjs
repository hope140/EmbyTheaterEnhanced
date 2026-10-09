'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {fileURLToPath, pathToFileURL} = require('node:url');
const {app} = require('electron');

const runtime = process.env.ETE_TEST_RUNTIME;
const evidence = process.env.ETE_TEST_EVIDENCE;
if (!runtime || !evidence) throw new Error('ETE_TEST_RUNTIME and ETE_TEST_EVIDENCE are required');

// Electron uses Windows Known Folders for appData. Environment overrides alone
// do not isolate the product bootstrap/logger/device identity directory.
const isolatedAppData = path.resolve(evidence, 'appdata');
const isolatedUserData = path.resolve(evidence, 'profile');
fs.mkdirSync(isolatedAppData, {recursive: true});
fs.mkdirSync(isolatedUserData, {recursive: true});
app.setPath('appData', isolatedAppData);
app.setPath('userData', isolatedUserData);
if (app.getPath('appData') !== isolatedAppData || app.getPath('userData') !== isolatedUserData) {
    throw new Error('P1 profile isolation failed before product bootstrap');
}

const appRoot = path.resolve(runtime, 'electronapp');
const metadata = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
const provenance = JSON.parse(fs.readFileSync(path.join(runtime, 'runtime-provenance.json'), 'utf8'));
const expectedIndex = path.resolve(appRoot, 'www', 'index.html');
const expectedIndexUrl = pathToFileURL(expectedIndex);
const sourceUrl = pathToFileURL(path.resolve(appRoot, 'plugins', 'libmpv.js')).href;
const injectedWindows = new WeakSet();
let markerWritten = false;

function samePath(left, right) {
    const a = path.resolve(left);
    const b = path.resolve(right);
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function isApplicationDocument(window) {
    try {
        const actual = new URL(window.webContents.getURL());
        if (actual.protocol !== expectedIndexUrl.protocol) return false;
        return samePath(fileURLToPath(actual), fileURLToPath(expectedIndexUrl));
    } catch (_) {
        return false;
    }
}

function writeInjectionMarker(result) {
    if (markerWritten) return;
    markerWritten = true;
    try {
        fs.writeFileSync(path.join(evidence, 'p1-diagnostics-injection.json'), JSON.stringify({
            appDataIsolated: app.getPath('appData') === isolatedAppData,
            userDataIsolated: app.getPath('userData') === isolatedUserData,
            aboutVersionMatched: result.aboutVersionMatched === true,
            aboutSourceCommitMatched: result.aboutSourceCommitMatched === true,
            applicationDocumentMatched: result.applicationDocumentMatched === true,
            applicationWindowInjected: result.applicationWindowInjected === true,
            auxiliaryWindowInjected: false,
            errorEventDispatched: result.errorEventDispatched === true,
            promiseRejectionEventDispatched: result.promiseRejectionEventDispatched === true
        }) + '\n', 'utf8');
    } catch (_) { /* Evidence marker failure cannot replace or hide the smoke result. */ }
}

function installBeforeSmoke() {
    app.on('browser-window-created', (_event, window) => {
        if (!window || !window.webContents || typeof window.webContents.on !== 'function') return;
        window.webContents.on('did-finish-load', async () => {
            if (!isApplicationDocument(window) || injectedWindows.has(window)) return;
            injectedWindows.add(window);
            const payload = {
                canary: 'P1_PRIVATE_CANARY',
                sourceUrl,
                remoteUrl: 'https://P1_PRIVATE_CANARY.invalid/private/path.js?token=P1_PRIVATE_CANARY',
                privatePath: 'C:\\P1_PRIVATE_CANARY\\fixture\\private.js'
            };
            const script = `(() => {
                const input = ${JSON.stringify(payload)};
                const error = new ReferenceError(input.canary + ' is not defined');
                error.stack = [
                    'ReferenceError: ' + input.canary + ' is not defined',
                    '    at ' + input.canary + ' (' + input.sourceUrl + ':123:4)',
                    '    at ' + input.canary + '.remote (' + input.remoteUrl + ':44:2)',
                    '    at ' + input.canary + '.private (' + input.privatePath + ':77:3)'
                ].join('\\n');
                const errorEvent = new ErrorEvent('error', {
                    message: error.message,
                    filename: input.sourceUrl,
                    lineno: 123,
                    colno: 4,
                    error: error,
                    cancelable: true
                });
                const promise = new Promise(function () {});
                const rejectionEvent = new PromiseRejectionEvent('unhandledrejection', {
                    promise: promise,
                    reason: error,
                    cancelable: true
                });
                return {
                    applicationDocumentMatched: true,
                    applicationWindowInjected: true,
                    errorEventDispatched: window.dispatchEvent(errorEvent) === true,
                    promiseRejectionEventDispatched: window.dispatchEvent(rejectionEvent) === true
                };
            })()`;
            let result = {};
            try {
                result = await window.webContents.executeJavaScript(script);
                const info = await window.webContents.executeJavaScript("window.ipc.invoke('enhanced-maintenance-info').then(function (result) { return {appVersion: result.info && result.info.appVersion, sourceCommit: result.info && result.info.sourceCommit}; })");
                result.aboutVersionMatched = info && info.appVersion === metadata.version;
                result.aboutSourceCommitMatched = info && info.sourceCommit === provenance.sourceCommit;
            } catch (_) { }
            writeInjectionMarker(result || {});
        });
    });
}

installBeforeSmoke();
require('./smoke-electron.cjs');
