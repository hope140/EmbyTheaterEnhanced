'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const KINDS = new Set(['performance', 'liveness', 'smoke']);
function rootRequest(kind, mode, {temporaryRoot, writeOut, writeErr} = {}) {
  if (!KINDS.has(kind) || (kind === 'performance' ? !['entry', 'matrix'].includes(mode) : mode !== undefined)) {
    throw Error('windows-ci-root-request-invalid');
  }
  const fixture = temporaryRoot || require('../../tests/helpers/range-fixture-root.cjs').temporaryRoot;
  const output = writeOut || (value => process.stdout.write(value));
  const error = writeErr || (value => process.stderr.write(value));
  const tempParent = fs.realpathSync.native(os.tmpdir());
  const prefixes = {performance: 'ete-shared-app-', liveness: 'ete-runtime-win-', smoke: 'ete-shared-win-'};
  const relatives = kind === 'performance'
    ? require('./app-performance-runner.cjs').cases(mode).map(row => `performance/profile-${row.index}/userdata/shared-playback-byte-cache-v2`)
    : kind === 'smoke' ? ['smoke/shared-profile/userdata/shared-playback-byte-cache-v2'] : [];

  // The port-preflight helper logs to console.log today. Preserve those diagnostics
  // on stderr while reserving stdout for exactly one machine-readable return value.
  const previousLog = console.log;
  let root;
  try {
    console.log = (...parts) => error(parts.map(part => typeof part === 'string' ? part : String(part)).join(' ') + '\n');
    root = fixture(prefixes[kind], relatives);
  } finally {
    console.log = previousLog;
  }
  if (typeof root !== 'string' || !root || root.trim() !== root || /[\r\n\0]/.test(root) || !path.isAbsolute(root)) {
    throw Error('windows-ci-root-path-invalid');
  }
  const canonical = fs.realpathSync.native(root);
  if (canonical !== root || path.dirname(canonical) !== tempParent || !path.basename(canonical).startsWith(prefixes[kind]) ||
      !fs.statSync(canonical).isDirectory()) {
    throw Error('windows-ci-root-path-invalid');
  }
  output(JSON.stringify({schema: 1, kind, path: canonical}) + '\n');
  return {schema: 1, kind, path: canonical};
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length < 1 || args.length > 2) throw Error('windows-ci-root-request-invalid');
    rootRequest(args[0], args[1]);
  } catch (error) {
    process.stderr.write((/^[a-z0-9-]{1,100}$/.test(error.message) ? error.message : 'windows-ci-root-failed') + '\n');
    process.exitCode = 1;
  }
}

module.exports = {rootRequest};
