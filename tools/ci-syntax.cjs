'use strict';

const childProcess = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const listing = childProcess.spawnSync('git', ['ls-files', '-z', '--', 'src', 'tools', 'tests'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024
});
if (listing.error) throw listing.error;
if (listing.status !== 0) throw new Error('git ls-files failed with exit code ' + listing.status);

const files = listing.stdout.split('\0').filter(Boolean)
    .filter(file => /\.(?:js|cjs|mjs)$/i.test(file))
    .sort();
const failures = [];
for (const file of files) {
    const result = childProcess.spawnSync(process.execPath, ['--check', file], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024
    });
    if (result.error || result.status !== 0) {
        failures.push({file, details: (result.stderr || (result.error && result.error.message) || '').trim()});
    }
}

if (failures.length) {
    for (const failure of failures) process.stderr.write(failure.file + '\n' + failure.details + '\n');
    process.stderr.write('JavaScript syntax failed for ' + failures.length + ' of ' + files.length + ' tracked files.\n');
    process.exitCode = 1;
} else {
    process.stdout.write('JavaScript syntax passed for ' + files.length + ' tracked src/tools/tests files.\n');
}
