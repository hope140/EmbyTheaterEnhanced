'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const plan = require('../tools/ci-build-input-plan.cjs');
const root = path.resolve(__dirname, '..');
function values() {
    const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    return {host: read(plan.AUTHORITIES[0]), electron: read(plan.AUTHORITIES[1]),
        inherited: read(plan.AUTHORITIES[2]), native: read(plan.AUTHORITIES[3]),
        tools: read(plan.AUTHORITIES[4]), lock: read(plan.AUTHORITIES[5]), evidence: read(plan.AUTHORITIES[6])};
}
test('clean CI acquisition plan binds all archives and original toolchains without old inputs', () => {
    const result = plan.planFrom(values());
    assert.equal(result.files.length, 22);
    assert.equal(new Set(result.files.map(file => file.destination)).size, 22);
    assert.equal(result.files.filter(file => file.id.startsWith('msys2-')).length, 17);
    assert.equal(result.files.find(file => file.id === 'innounp').url.includes('07ee3b1a05a26fa27a0efe110fe78dfa72c06c71'), true);
    assert.doesNotMatch(JSON.stringify(result), /vendor\/(?:carnival|patch)/);
    assert.equal(result.officialElectronSource.commit, 'e897adda583b2339f077cb67113e71326a806de0');
});
test('CI toolchain authority disagreement fails before acquisition', () => {
    const inputs = values(); inputs.tools.inno.sha256 = '0'.repeat(64);
    assert.throws(() => plan.planFrom(inputs), /authorities disagree/);
});
test('CI input destination and URL cannot escape the checkout or add URL credentials', () => {
    for (const destination of ['../out', '.work/../out', '.work//out', '.work/\\out', 'C:/out', 'src/file']) {
        assert.throws(() => plan.item('fixture', 'https://example.com/f', 'f', 1, 'a'.repeat(64), destination));
    }
    for (const url of ['http://example.com/f', 'https://user:password@example.com/f']) {
        assert.throws(() => plan.item('fixture', url, 'f', 1, 'a'.repeat(64), '.work/f'));
    }
});
test('existing CI cache is rehashed and a same-size replacement is rejected', t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-ci-input-'));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const file = path.join(directory, 'archive'); fs.writeFileSync(file, 'good');
    const expected = {id: 'fixture', size: 4, sha256: crypto.createHash('sha256').update('good').digest('hex')};
    assert.equal(plan.verifyFile(file, expected).size, 4);
    fs.writeFileSync(file, 'evil');
    assert.throws(() => plan.verifyFile(file, expected), /SHA256 mismatch/);
    fs.writeFileSync(file, 'short');
    assert.throws(() => plan.verifyFile(file, expected), /size or type mismatch/);
});
