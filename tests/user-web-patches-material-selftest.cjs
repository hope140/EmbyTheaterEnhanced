'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const userWeb = require('../tools/patch-user-web.cjs');
const lifecycle = require('../tools/patch-apiclient-lifecycle.cjs');
const overlays = require('../tools/prepare-web-overlays.cjs');
const read = name => fs.readFileSync(path.join(__dirname, '../vendor/web-snapshot', name));

for (const [id, patcher, basePath, archivePath] of [
    ['apiclient', userWeb.patchApiClient, 'www/modules/emby-apiclient/apiclient.js', 'user-patches/apiclient.js'],
    ['toast-css', userWeb.patchToastCss, 'www/modules/toast/toast.css', 'user-patches/toast.css']
]) {
    test(id + ' delta reconstructs exact historical bytes and preserves the final output hash', () => {
        const base = read(basePath), historical = read(archivePath);
        const generated = patcher(base.toString('utf8'));
        assert.deepEqual(Buffer.from(generated), historical, 'includes BOM and mixed/newline conventions');
        const output = id === 'apiclient' ? lifecycle.patchApiClient(generated) : generated;
        const priorOutput = id === 'apiclient' ? lifecycle.patchApiClient(historical.toString('utf8')) : historical;
        assert.deepEqual(Buffer.from(output), Buffer.from(priorOutput));
        assert.equal(overlays.sha256(Buffer.from(output)), overlays.WEB_OVERLAY_CONTRACT.find(item => item.id === id).expectedOutputSha256);
    });

    for (const [mutation, mutate] of [
        ['changed body', source => source + '/* changed */'],
        ['wrong newline', source => source.replace(/\r\n/g, '\n')],
        ['duplicate body', source => source + source],
        ['already patched', source => patcher(source)]
    ]) {
        test(id + ' refuses ' + mutation, () => {
            assert.throws(() => patcher(mutate(read(basePath).toString('utf8'))), /hash mismatch/);
        });
    }
}

test('ApiClient user changes stay within openWebSocket and reportPlaybackProgress', () => {
    function omitChangedMethods(source) {
        let remaining = source.replace(/\r\n/g, '\n');
        for (const name of ['openWebSocket', 'reportPlaybackProgress']) {
            const marker = '            key: "' + name + '",\n';
            assert.equal(remaining.split(marker).length, 2);
            const begin = remaining.indexOf(marker) + marker.length;
            const end = remaining.indexOf('\n            },\n          },', begin);
            assert.ok(end > begin);
            remaining = remaining.slice(0, begin) + '[user delta method]' + remaining.slice(end);
        }
        return remaining;
    }
    const base = read('www/modules/emby-apiclient/apiclient.js').toString('utf8');
    assert.equal(omitChangedMethods(userWeb.patchApiClient(base)), omitChangedMethods(base));
});

test('toast keeps every other CSS byte after the historical LF conversion', () => {
    const base = read('www/modules/toast/toast.css').toString('utf8').replace(/\r\n/g, '\n');
    const removed = '[class*="accent-"].noScrollY.transparentDocument .toast-group {\n' +
        '  position: relative;\n  transform: translate(-50%, -50%);\n  top: 15%;\n  left: 50%;\n}\n';
    assert.equal(base.split(removed).length, 2);
    const output = userWeb.patchToastCss(read('www/modules/toast/toast.css').toString('utf8'));
    assert.equal(output, base.replace(removed, ''));
});
