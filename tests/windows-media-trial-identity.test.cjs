'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const identity = require('../tools/windows-media-trial-identity.cjs');
function fixture(existing) {
    const written = [], expected = identity.details(path.resolve('runtime'), path.resolve('private'));
    let readback = existing || expected;
    const options = {runtime: path.resolve('runtime'), privateRoot: path.resolve('private'), appData: path.resolve('appdata'),
        fs: {existsSync: () => !!existing, lstatSync: () => ({isFile: () => true, isSymbolicLink: () => false}), mkdirSync() {}},
        shell: {readShortcutLink() { return readback; }, writeShortcutLink(file, operation, value) { written.push({file, operation, value}); return true; }}};
    return {options, expected, written, readback(value) {readback = value;}};
}
test('trial identity uses its own start menu name and matches the running AppUserModelId', () => {
    const f=fixture(), result=identity.register(f.options);
    assert.equal(result.created,true);assert.equal(result.verified,true);assert.equal(f.written.length,1);
    assert.equal(path.basename(f.written[0].file),identity.SHORTCUT_NAME);
    assert.equal(f.written[0].value.appUserModelId,identity.APP_ID);
    assert.match(f.written[0].value.args,/--user-data-dir=/);
});
test('registration reuses the same owned shortcut and refuses to overwrite another target', () => {
    const expected=identity.details(path.resolve('runtime'),path.resolve('private'));
    const f=fixture(expected);assert.equal(identity.register(f.options).created,false);assert.equal(f.written.length,0);
    const g=fixture({...expected,target:path.resolve('another.exe')});
    assert.throws(()=>identity.register(g.options),/another target/);assert.equal(g.written.length,0);
});
test('mismatched identity readback and unsafe paths do not report registration success', () => {
    const f=fixture();f.readback({...f.expected,appUserModelId:'other'});
    assert.throws(()=>identity.register(f.options),/readback failed/);
    const g=fixture();g.options.runtime='relative';assert.throws(()=>identity.register(g.options),/Absolute identity paths/);
});
