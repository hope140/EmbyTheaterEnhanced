'use strict';
// Exact frozen input plus generated app/ordinary CSS output. No product execution.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const web = require('../tools/web-snapshot-input.cjs');
const overlays = require('../tools/prepare-web-overlays.cjs');
const contract = require('../tools/build-input-contract.cjs');
const exclusions = require('../tools/runtime-exclusions.cjs');
const root = path.resolve(__dirname, '..');
const historical=JSON.parse(fs.readFileSync(path.join(root,'vendor/snapshot-history/web-snapshot-v1-manifest.json')));
assert.equal(historical.files.find(x=>x.path==='www/modules/CustomCssJS.js').sha256,'2177de28dcc4e715f07c63329dc361c5b4ddd37eb7e59f273830b22acea37912');
assert.equal(fs.existsSync(path.join(root,web.WEB_ROOT,'modules/CustomCssJS.js')),false);
assert.equal(contract.INPUT_PATHS.includes('tools/patch-custom-css-js.cjs'), false);
assert.equal(fs.existsSync(path.join(root, 'tools/patch-custom-css-js.cjs')), false);
assert.equal(overlays.WEB_OVERLAY_CONTRACT.some(item => item.id === 'custom-css-js'), false);
fs.mkdirSync(path.join(root, 'dist'), {recursive: true});
const runtime = fs.mkdtempSync(path.join(root, 'dist', 'custom-css-material-'));
try {
    const report = web.assemble(root, runtime);
    assert.equal(report.fileCount, 713);
    assert.equal(report.runtimeFileCount, 713);
    assert.deepEqual(report.excludedFiles.map(item=>item.path), []);
    overlays.apply(root, runtime);
    assert.equal(overlays.inspect(root, runtime).status, 'passed');
    assert.equal(exclusions.verify(runtime).status, 'passed');
    assert.equal(fs.existsSync(path.join(runtime, 'electronapp/www/modules/CustomCssJS.js')), false);
    assert.equal(fs.existsSync(path.join(runtime, 'electronapp/www/modules/themes/logo.png')), false);
    const app = fs.readFileSync(path.join(runtime, 'electronapp/www/app.js'), 'utf8');
    assert.equal(app.includes('CustomCssJS'), false);
    assert.ok(app.includes('self.ApiClient.getUrl("Branding/Css")'));
    assert.ok(app.includes('./modules/confirmstillplaying/plugin.js'));
    assert.ok(fs.existsSync(path.join(runtime, 'electronapp/www/modules/layout.css')));
    assert.ok(fs.existsSync(path.join(runtime, 'electronapp/www/modules/themes/darkgradient/theme.css')));
    console.log('CustomCssJS retired: historical identities retained without the old source body, no runtime module/registration; ordinary CSS and app overlay identities verified.');
} finally { fs.rmSync(runtime, {recursive: true}); }
