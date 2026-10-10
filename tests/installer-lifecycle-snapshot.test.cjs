'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {snapshot} = require('../tools/installer-lifecycle-snapshot.cjs');

test('four lifecycle fixture snapshots preserve profile identity and detect changed payload', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-installer-evidence-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const options = {installRoot: path.join(root, 'app'), profileRoot: path.join(root, 'profile'), isolatedEnvironment: true};
  assert.equal(snapshot({...options, phase: 'before'}).install.exists, false);
  fs.mkdirSync(options.installRoot);
  fs.mkdirSync(path.join(options.profileRoot, 'config'), {recursive: true});
  fs.writeFileSync(path.join(options.profileRoot, 'config/device-identity.json'), '{"id":"synthetic-private-canary"}');
  fs.writeFileSync(path.join(options.installRoot, 'app.txt'), 'v1');
  const clean = snapshot({...options, phase: 'clean'});
  fs.writeFileSync(path.join(options.installRoot, 'app.txt'), 'v2');
  const upgrade = snapshot({...options, phase: 'upgrade'});
  assert.notEqual(clean.install.treeHash, upgrade.install.treeHash);
  assert.deepEqual(clean.profile, upgrade.profile);
  fs.renameSync(options.installRoot, path.join(root, 'removed-app'));
  const uninstall = snapshot({...options, phase: 'uninstall'});
  assert.equal(uninstall.install.exists, false);
  fs.renameSync(path.join(root, 'removed-app'), options.installRoot);
  const reinstall = snapshot({...options, phase: 'reinstall'});
  assert.deepEqual(upgrade.install, reinstall.install);
  assert.deepEqual(clean.deviceIdentity, reinstall.deviceIdentity);
  assert.equal(reinstall.lifecycleAcceptance, 'NOT_EXECUTED');
  assert.doesNotMatch(JSON.stringify(reinstall), /synthetic-private-canary|device-identity|profileRoot/);
  assert.throws(() => snapshot({...options, phase: 'upgrade', isolatedEnvironment: false}));
  assert.throws(() => snapshot({...options, phase: 'unknown'}));
  assert.throws(() => snapshot({...options, phase: 'clean', profileRoot: '.'}));
});

test('collector refuses output overwrite without leaking raw filesystem errors', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-installer-output-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const output = path.join(root, 'evidence.json');
  fs.writeFileSync(output, 'keep');
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../tools/installer-lifecycle-snapshot.cjs'),
    'before', path.join(root, 'app'), path.join(root, 'profile'), output, '--isolated-environment'], {encoding: 'utf8'});
  assert.equal(result.status, 1);
  assert.equal(fs.readFileSync(output, 'utf8'), 'keep');
  assert.ok(!result.stderr.includes(root));
});
