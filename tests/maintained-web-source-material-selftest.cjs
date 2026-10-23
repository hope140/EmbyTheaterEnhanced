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
    ['modules/toast/toast.css', '654aeb05c1b89ca625cc6bd9145f1966a780c0e80fe1197f619800c5f1894743']
]) {
    test(relative + ' retains the accepted pre-extraction runtime bytes', () => {
        const source = read('src/electronapp/www/' + relative);
        assert.equal(sha(source), expected);
    });
}

test('maintained toast retains all other CSS and the historical LF convention', () => {
    const base = read('vendor/web-snapshot/www/modules/toast/toast.css').toString('utf8').replace(/\r\n/g, '\n');
    const removed = '[class*="accent-"].noScrollY.transparentDocument .toast-group {\n' +
        '  position: relative;\n  transform: translate(-50%, -50%);\n  top: 15%;\n  left: 50%;\n}\n';
    assert.equal(base.split(removed).length, 2);
    const maintained = read('src/electronapp/www/modules/toast/toast.css');
    assert.equal(maintained.toString('utf8'), base.replace(removed, ''));
    assert.deepEqual(maintained, read('vendor/web-snapshot/user-patches/toast.css'));
});
