'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const {
    classifyDocumentUrl,
    createWindowOwnership
} = require('../tools/runtime-window-ownership.cjs');

const expectedApplicationPath = path.resolve(__dirname, '..', 'electronapp/www/index.html');

function fakeWindow(rawUrl) {
    let destroyed = false;
    const calls = [];
    return {
        webContents: {
            getURL() {
                return rawUrl;
            },
            executeJavaScript(source) {
                calls.push(source);
                return Promise.resolve();
            }
        },
        isDestroyed() {
            return destroyed;
        },
        destroy() {
            destroyed = true;
        },
        probeCalls: calls
    };
}

function applicationUrl(query = '', hash = '') {
    return pathToFileURL(expectedApplicationPath).href + query + hash;
}

test('classifies the packaged application index by file identity, ignoring query and hash', () => {
    const result = classifyDocumentUrl(
        applicationUrl('?profile=acceptance&token=should-not-be-recorded', '#home'),
        expectedApplicationPath
    );

    assert.deepEqual(result, {
        role: 'application',
        reason: 'packaged-application-index',
        urlClass: 'file-application-index'
    });
    assert.equal(JSON.stringify(result).includes('should-not-be-recorded'), false);
});

test('classifies non-application documents as auxiliary without retaining complete URLs', () => {
    const cases = [
        {
            name: 'other file document',
            rawUrl: pathToFileURL(path.resolve('electronapp/www/other.html')).href,
            expected: {role: 'auxiliary', reason: 'file-document-not-application', urlClass: 'file-other'}
        },
        {
            name: 'native helper data document',
            rawUrl: 'data:text/html,<video%20data-secret="private-token">',
            expected: {role: 'auxiliary', reason: 'non-file-document', urlClass: 'data-document'}
        },
        {
            name: 'http document',
            rawUrl: 'https://server.example.test/index.html?token=private-token',
            expected: {role: 'auxiliary', reason: 'non-file-document', urlClass: 'non-file-document'}
        }
    ];

    for (const item of cases) {
        assert.deepEqual(classifyDocumentUrl(item.rawUrl, expectedApplicationPath), item.expected, item.name);
        assert.equal(JSON.stringify(item.expected).includes('private-token'), false, item.name);
    }
});

test('binds the application window once and never probes a later auxiliary window', () => {
    const ownership = createWindowOwnership({expectedApplicationPath});
    const applicationWindow = fakeWindow(applicationUrl());
    const auxiliaryWindow = fakeWindow('data:text/html,<video>');
    const injected = [];

    const applicationDecision = ownership.handleLoaded(applicationWindow);
    assert.equal(applicationDecision.role, 'application');
    assert.equal(applicationDecision.shouldStartProbe, true);
    if (applicationDecision.shouldStartProbe) {
        applicationWindow.webContents.executeJavaScript('pipeline fixture');
        injected.push(applicationWindow);
    }

    const auxiliaryDecision = ownership.handleLoaded(auxiliaryWindow);
    assert.equal(auxiliaryDecision.role, 'auxiliary');
    assert.equal(auxiliaryDecision.shouldStartProbe, false);
    if (auxiliaryDecision.shouldStartProbe) auxiliaryWindow.webContents.executeJavaScript('must never run');

    assert.equal(ownership.getApplicationWindow(), applicationWindow);
    assert.deepEqual(injected, [applicationWindow]);
    assert.equal(applicationWindow.probeCalls.length, 1);
    assert.equal(auxiliaryWindow.probeCalls.length, 0);

    const snapshot = ownership.snapshot();
    assert.equal(snapshot.applicationWindowSelected, true);
    assert.equal(snapshot.applicationWindowCount, 1);
    assert.equal(snapshot.applicationProbeCount, 1);
    assert.equal(snapshot.auxiliaryWindowCount, 1);
    assert.equal(JSON.stringify(snapshot).includes('data:text/html'), false);
});

test('does not replace a live application with another application-shaped or auxiliary window', () => {
    const ownership = createWindowOwnership({expectedApplicationPath});
    const firstApplication = fakeWindow(applicationUrl());
    const secondApplication = fakeWindow(applicationUrl('?window=second'));
    const auxiliaryWindow = fakeWindow('file:///C:/native-helper/surface.html');

    assert.equal(ownership.handleLoaded(firstApplication).shouldStartProbe, true);
    const secondDecision = ownership.handleLoaded(secondApplication);
    assert.equal(secondDecision.role, 'auxiliary');
    assert.equal(secondDecision.shouldStartProbe, false);
    assert.equal(secondDecision.classification.reason, 'application-already-bound');
    assert.equal(ownership.handleLoaded(auxiliaryWindow).role, 'auxiliary');
    assert.equal(ownership.getApplicationWindow(), firstApplication);
    assert.equal(ownership.snapshot().applicationProbeCount, 1);
});

test('allows a new valid application only after the bound application is destroyed', () => {
    const ownership = createWindowOwnership({expectedApplicationPath});
    const firstApplication = fakeWindow(applicationUrl());
    const replacementApplication = fakeWindow(applicationUrl('#replacement'));

    assert.equal(ownership.handleLoaded(firstApplication).shouldStartProbe, true);
    firstApplication.destroy();

    const replacementDecision = ownership.handleLoaded(replacementApplication);
    assert.equal(replacementDecision.role, 'application');
    assert.equal(replacementDecision.shouldStartProbe, true);
    assert.equal(ownership.getApplicationWindow(), replacementApplication);
    assert.equal(ownership.snapshot().applicationProbeCount, 2);
});

test('records only bounded classification evidence for missing or invalid URLs', () => {
    const ownership = createWindowOwnership({expectedApplicationPath});
    const missingUrlWindow = fakeWindow('');
    const invalidUrlWindow = fakeWindow('not a URL with secret=private-token');

    assert.equal(ownership.handleLoaded(missingUrlWindow).role, 'auxiliary');
    assert.equal(ownership.handleLoaded(invalidUrlWindow).role, 'auxiliary');

    const snapshot = ownership.snapshot();
    assert.equal(snapshot.auxiliaryWindowCount, 2);
    assert.deepEqual(snapshot.classifications, [
        {role: 'auxiliary', reason: 'url-empty', urlClass: 'empty'},
        {role: 'auxiliary', reason: 'url-invalid', urlClass: 'invalid'}
    ]);
    assert.equal(JSON.stringify(snapshot).includes('private-token'), false);
    assert.equal(JSON.stringify(snapshot).includes('not a URL'), false);
});
