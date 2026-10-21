'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const patch = require('../tools/patch-plugin-settings.cjs');

const root = path.resolve(__dirname, '..');
test('actual generated app and view-manager patches install alias before plugin template parsing', () => {
    const app = fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/app.js'), 'utf8');
    const viewManager = fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/modules/viewmanager/viewmanager.js'), 'utf8');
    const patchedApp = patch.patchApp(app);
    const patchedViewManager = patch.patchViewManager(viewManager);
    assert.match(patchedApp, /define\("emby-dialogclosebutton", \[\], getDynamicImport\("\.\/\.\.\/enhanced\/plugin-ui\/dialogclosebutton\.js"\)\)/);
    const loaderStart = patchedViewManager.indexOf('function eteLoad');
    const dependency = patchedViewManager.indexOf("require(['emby-dialogclosebutton'])", loaderStart);
    const prepareCall = patchedViewManager.indexOf('return etePrepareNewPage();', dependency);
    const parseFunction = patchedViewManager.indexOf('function etePrepareNewPage()', loaderStart);
    const parseCall = patchedViewManager.indexOf('normalizeNewView(options, options.isPluginPage)', parseFunction);
    assert.ok(loaderStart >= 0 && dependency > loaderStart);
    assert.ok(parseFunction > loaderStart && parseCall > parseFunction);
    assert.ok(prepareCall > dependency);
});
