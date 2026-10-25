'use strict';
// Explicit preparation only: never launches Electron, imports a profile, or
// enables the existing setting. Repeated/existing destinations are rejected.
const path = require('node:path');
const trial = require('../../src/electronapp/enhanced/shared-playback-cache/trial');
const args = process.argv.slice(2);
try {
  if (args.length !== 2 || args[0] !== '--out' || !path.isAbsolute(args[1])) throw Error();
  trial.createProfile({root: args[1]});
  process.stdout.write('Owned isolated shared-cache trial profile prepared; no app launched or setting enabled.\n');
} catch {
  process.stderr.write('shared-cache-trial-profile-prepare-rejected\n');
  process.exitCode = 1;
}
