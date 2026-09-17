'use strict';

const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function run(root, args) {
  return childProcess.execFileSync('git', ['-C', root].concat(args), {encoding: null, windowsHide: true, maxBuffer: 16 * 1024 * 1024});
}

function materialize(rootArg, commit, sourcePath, outputPath) {
  const root = path.resolve(rootArg);
  if (!/^[0-9a-f]{40}$/i.test(commit || '')) throw new Error('Invalid source commit.');
  if (sourcePath !== 'native/mpv-helper/ete-mpv-helper.cpp') throw new Error('Unexpected native helper source path.');
  const objectId = run(root, ['rev-parse', commit + ':' + sourcePath]).toString('utf8').trim();
  if (!/^[0-9a-f]{40,64}$/i.test(objectId)) throw new Error('Invalid native helper blob id.');
  const bytes = run(root, ['cat-file', 'blob', objectId]);
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, bytes);
  return {objectId, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), size: bytes.length};
}

if (require.main === module) {
  const [root, commit, sourcePath, outputPath] = process.argv.slice(2);
  if (!root || !commit || !sourcePath || !outputPath) throw new Error('Usage: materialize-native-helper-source.cjs <root> <commit> <sourcePath> <output>');
  process.stdout.write(JSON.stringify(materialize(root, commit, sourcePath, outputPath)) + '\n');
}

module.exports = {materialize};
