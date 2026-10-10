'use strict';

// Read-only evidence collector. It never installs, launches, stops or deletes anything.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const phases = ['before', 'clean', 'upgrade', 'uninstall', 'reinstall'];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function inventory(root) {
  if (!path.isAbsolute(root)) throw new Error('Absolute explicit fixture or VM paths required.');
  if (!fs.existsSync(root)) return {exists: false, files: 0, treeHash: null};
  const rows = [];
  function walk(current, relative) {
    const info = fs.lstatSync(current);
    if (info.isSymbolicLink()) throw new Error('Linked evidence inputs are not allowed.');
    if (info.isDirectory()) {
      for (const entry of fs.readdirSync(current).sort()) walk(path.join(current, entry), relative ? relative + '/' + entry : entry);
    } else if (info.isFile()) {
      rows.push([hash(relative), info.size, hash(fs.readFileSync(current))]);
    } else throw new Error('Unsupported evidence input.');
  }
  walk(root, '');
  return {exists: true, files: rows.length, treeHash: hash(JSON.stringify(rows))};
}

function snapshot(options) {
  if (!options || options.isolatedEnvironment !== true) throw new Error('Explicit isolated-environment acknowledgement required.');
  if (!phases.includes(options.phase)) throw new Error('Unknown lifecycle phase.');
  for (const key of ['installRoot', 'profileRoot']) {
    if (typeof options[key] !== 'string' || !path.isAbsolute(options[key])) throw new Error('Explicit absolute roots required.');
    // Reject redirected ancestors as well as the final path; never follow a junction into another profile.
    let current = path.resolve(options[key]);
    while (true) {
      if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Linked evidence inputs are not allowed.');
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return {schemaVersion: 1, phase: options.phase, evidenceLevel: 'STATIC_VERIFIED',
    install: inventory(options.installRoot), profile: inventory(options.profileRoot),
    deviceIdentity: inventory(path.join(options.profileRoot, 'config', 'device-identity.json')),
    lifecycleAcceptance: 'NOT_EXECUTED', shortcuts: 'UNKNOWN', registry: 'UNKNOWN', processes: 'UNKNOWN'};
}

if (require.main === module) {
  try {
    const [phase, installRoot, profileRoot, output, acknowledge] = process.argv.slice(2);
    if (!output || !path.isAbsolute(output)) throw new Error('Explicit absolute output required.');
    for (const root of [installRoot, profileRoot]) {
      if (!root) throw new Error('Explicit roots required.');
      const relative = path.relative(path.resolve(root), path.resolve(output));
      if (!relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep))) {
        throw new Error('Evidence output must be outside observed trees.');
      }
    }
    const data = snapshot({phase, installRoot, profileRoot, isolatedEnvironment: acknowledge === '--isolated-environment'});
    fs.writeFileSync(output, JSON.stringify(data, null, 2) + '\n', {flag: 'wx'});
    process.stdout.write('Read-only snapshot written; lifecycle acceptance remains NOT_EXECUTED.\n');
  } catch (_) {
    process.stderr.write('Snapshot failed: check explicit isolated paths, phase, links and exclusive output.\n');
    process.exitCode = 1;
  }
}
module.exports = {snapshot};
