'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const repo = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(repo, name));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

for (const [relative, expected] of [
    ['modules/emby-apiclient/apiclient.js', '6342a2c809b8cd4c0e1e3e35fc49f6af8a415e4f4f8f8f0363cb769e9a7ef95e'],
    ['modules/toast/toast.css', '654aeb05c1b89ca625cc6bd9145f1966a780c0e80fe1197f619800c5f1894743']
]) {
    test(relative + ' retains the accepted pre-extraction runtime bytes', () => {
        const source = read('src/electronapp/www/' + relative);
        assert.equal(sha(source), expected);
    });
}

test('maintained ApiClient changes only the approved lifecycle and progress methods', () => {
    function omitChangedMethods(source) {
        let remaining = source.replace(/\r\n/g, '\n');
        for (const name of ['logout', 'ensureWebSocket', 'openWebSocket', 'closeWebSocket', 'reportPlaybackProgress']) {
            const marker = '            key: "' + name + '",\n';
            assert.equal(remaining.split(marker).length, 2);
            const begin = remaining.indexOf(marker) + marker.length;
            const end = remaining.indexOf('\n            },\n          },', begin);
            assert.ok(end > begin);
            remaining = remaining.slice(0, begin) + '[maintained method]' + remaining.slice(end);
        }
        return remaining;
    }
    const base = read('vendor/web-snapshot/www/modules/emby-apiclient/apiclient.js').toString('utf8');
    const maintained = read('src/electronapp/www/modules/emby-apiclient/apiclient.js').toString('utf8');
    assert.equal(omitChangedMethods(maintained), omitChangedMethods(base));
    // The progress method remains exactly the user's historical fix, including the ensure order.
    function progress(source) {
        const normalized = source.replace(/\r\n/g, '\n');
        return normalized.slice(normalized.indexOf('            key: "reportPlaybackProgress",'),
            normalized.indexOf('            key: "reportOfflineActions",'));
    }
    assert.equal(progress(maintained), progress(read('vendor/web-snapshot/user-patches/apiclient.js').toString('utf8')));
});

test('maintained toast retains all other CSS and the historical LF convention', () => {
    const base = read('vendor/web-snapshot/www/modules/toast/toast.css').toString('utf8').replace(/\r\n/g, '\n');
    const removed = '[class*="accent-"].noScrollY.transparentDocument .toast-group {\n' +
        '  position: relative;\n  transform: translate(-50%, -50%);\n  top: 15%;\n  left: 50%;\n}\n';
    assert.equal(base.split(removed).length, 2);
    const maintained = read('src/electronapp/www/modules/toast/toast.css');
    assert.equal(maintained.toString('utf8'), base.replace(removed, ''));
    assert.deepEqual(maintained, read('vendor/web-snapshot/user-patches/toast.css'));
});
