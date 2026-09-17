'use strict';

const fs = require('fs');
const path = require('path');

// These inputs remain in the immutable Carnival archive inventory for
// provenance, but are deliberately absent from every Enhanced runtime.
const RETIRED_RUNTIME_PATHS = Object.freeze([
  'electronapp/libmpv/x64/mpv-win32-x64.node'
]);

function runtimeFile(root, relativePath) {
  if (typeof root !== 'string' || !root || typeof relativePath !== 'string' ||
      !relativePath || relativePath.includes('\\') || relativePath.startsWith('/') ||
      relativePath.split('/').includes('..') || relativePath.split('/').includes('.')) {
    throw new Error('Invalid runtime exclusion path.');
  }
  const runtimeRoot = path.resolve(root);
  const target = path.resolve(runtimeRoot, ...relativePath.split('/'));
  if (!target.startsWith(runtimeRoot + path.sep)) throw new Error('Runtime exclusion escaped its root.');
  return target;
}

function verify(root) {
  const present = RETIRED_RUNTIME_PATHS.filter(relativePath => fs.existsSync(runtimeFile(root, relativePath)));
  return {
    schemaVersion: 1,
    status: present.length === 0 ? 'passed' : 'failed',
    excludedPaths: [...RETIRED_RUNTIME_PATHS],
    presentPaths: present
  };
}

function remove(root) {
  const removed = [];
  for (const relativePath of RETIRED_RUNTIME_PATHS) {
    const target = runtimeFile(root, relativePath);
    if (!fs.existsSync(target)) continue;
    if (!fs.statSync(target).isFile()) throw new Error('Runtime exclusion target is not a file: ' + relativePath);
    fs.rmSync(target);
    removed.push(relativePath);
  }
  const result = verify(root);
  if (result.status !== 'passed') throw new Error('Runtime exclusion failed: ' + result.presentPaths.join(','));
  return Object.assign(result, {removedPaths: removed});
}

if (require.main === module) {
  const [command, root] = process.argv.slice(2);
  if (!command || !root || !['remove', 'verify'].includes(command)) {
    throw new Error('Usage: runtime-exclusions.cjs <remove|verify> <runtime>');
  }
  const result = command === 'remove' ? remove(path.resolve(root)) : verify(path.resolve(root));
  process.stdout.write(JSON.stringify(result) + '\n');
  if (result.status !== 'passed') process.exitCode = 1;
}

module.exports = {RETIRED_RUNTIME_PATHS, remove, runtimeFile, verify};
