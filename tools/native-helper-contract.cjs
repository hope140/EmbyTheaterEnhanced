'use strict';

const path = require('node:path');
const trackedFileHash = require('./tracked-file-hash.cjs');

const CONTRACT_PATHS = Object.freeze([
  'vendor/native-helper-manifest.json',
  'tools/build-native-helper.ps1',
  'tools/materialize-native-helper-source.cjs',
  'tools/native-helper-provenance.cjs',
  'tools/native-helper-contract.cjs',
  'tools/tracked-file-hash.cjs'
]);

function inspect(rootArg) {
  const root = path.resolve(rootArg);
  return {
    source: 'sourceCommit HEAD canonical Git blobs',
    files: CONTRACT_PATHS.map(file => ({path: file, sha256: trackedFileHash.hashTrackedTextFile(root, file).toLowerCase()}))
  };
}

if (require.main === module) {
  const root = process.argv[2];
  if (!root) throw new Error('Usage: native-helper-contract.cjs <root>');
  process.stdout.write(JSON.stringify(inspect(root)) + '\n');
}

module.exports = {CONTRACT_PATHS, inspect};
