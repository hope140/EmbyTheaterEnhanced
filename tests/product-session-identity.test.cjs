'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const productIdentity = require('../src/electronapp/product-identity');

const repoRoot = path.resolve(__dirname, '..');

function fakeApp() {
    const calls = [];
    return {
        calls,
        setName(value) {
            calls.push(value);
        }
    };
}

test('product identity prefers runtime productName', () => {
    const app = fakeApp();
    const metadata = {
        name: 'internal-name',
        productName: 'Emby Theater Enhanced'
    };

    assert.equal(productIdentity.getProductIdentity(metadata), 'Emby Theater Enhanced');
    assert.equal(productIdentity.setAppName(app, metadata), 'Emby Theater Enhanced');
    assert.deepEqual(app.calls, ['Emby Theater Enhanced']);
});

test('product identity falls back to runtime package name', () => {
    const app = fakeApp();
    const metadata = {name: 'internal-name'};

    assert.equal(productIdentity.getProductIdentity(metadata), 'internal-name');
    assert.equal(productIdentity.setAppName(app, metadata), 'internal-name');
    assert.deepEqual(app.calls, ['internal-name']);
    assert.equal(productIdentity.getProductIdentity({name: 'internal-name', productName: ''}), 'internal-name');
});

test('production and acceptance share one identity helper before product startup', () => {
    const main = fs.readFileSync(path.join(repoRoot, 'src/electronapp/main.js'), 'utf8');
    const acceptance = fs.readFileSync(path.join(repoRoot, 'tools/acceptance-electron.cjs'), 'utf8');
    const build = fs.readFileSync(path.join(repoRoot, 'tools/build.ps1'), 'utf8');
    const identityCall = main.indexOf('productIdentity.setAppName(app, productMetadata);');
    const loadStartInfoDefinition = main.indexOf('function loadStartInfo()');
    const loadStartInfoCall = main.indexOf('loadStartInfo().then(');
    const browserWindowCreation = main.indexOf('new BrowserWindow(');

    assert.match(main, /require\('\.\/package\.json'\)/);
    assert.match(main, /require\('\.\/product-identity'\)/);
    assert.ok(identityCall >= 0, 'production startup must set the runtime product identity');
    assert.ok(identityCall < main.indexOf('appBootstrap.bootstrap('), 'identity must be set before bootstrap');
    assert.ok(identityCall < main.indexOf('deviceIdentity.getOrCreateDeviceId('), 'identity must be set before device identity initialization');
    assert.ok(identityCall < loadStartInfoDefinition, 'identity must be set before loadStartInfo is defined');
    assert.ok(identityCall < loadStartInfoCall, 'identity must be set before loadStartInfo runs');
    assert.ok(identityCall < browserWindowCreation, 'identity must be set before BrowserWindow creation');
    assert.match(main, /name:\s*app\.name/);
    assert.match(main, /deviceName:\s*os\.hostname\(\)/);
    assert.match(main, /deviceId:\s*persistentDeviceId/);
    assert.doesNotMatch(main, /deviceId:\s*os\.hostname\(\)/);
    assert.doesNotMatch(main, /app\.setName\(['"]Emby Theater Enhanced['"]\)/);

    assert.match(acceptance, /require\(path\.join\(runtime,'electronapp\/product-identity\.js'\)\)/);
    assert.match(acceptance, /productIdentity\.setAppName\(app,metadata\)/);
    assert.ok(
        acceptance.indexOf('productIdentity.setAppName(app,metadata)') < acceptance.indexOf("require(path.join(runtime,'electronapp/main.js'))"),
        'acceptance must set the shared identity before loading production startup'
    );
    assert.doesNotMatch(acceptance, /app\.setName\(metadata\.productName\s*\|\|\s*metadata\.name\)/);

    assert.match(build, /\$package\.name\s*=\s*'emby-theater-enhanced'/);
    assert.match(build, /\$package\.productName\s*=\s*'Emby Theater Enhanced'/);
});

test('product identity fails closed for unusable inputs', () => {
    assert.throws(() => productIdentity.setAppName(null, {name: 'internal-name'}), /app\.setName is required/);
    assert.throws(() => productIdentity.setAppName(fakeApp(), {}), /requires productName or name/);
});
