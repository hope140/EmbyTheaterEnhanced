'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

test('CD2 cold/warm observer black-box contract', () => {
  const root = path.join(__dirname, '..');
  const script = path.join(__dirname, 'cd2-cold-warm-observer-selftest.ps1');
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const powershell = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const result = spawnSync(powershell, [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
  ], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120000,
    windowsHide: true,
  });
  assert.equal(result.error, undefined, result.error && result.error.message);
  assert.equal(result.status, 0, `${result.stdout || ''}${result.stderr || ''}`);
  assert.match(result.stdout, /cd2 cold\/warm observer self-test: PASS/);
});
