'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {materialize} = require('./materialize-native-helper-source.cjs');
const nativeHelperContract = require('./native-helper-contract.cjs');

function hashFile(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function exists(file) { try { return fs.statSync(file).isFile(); } catch (_) { return false; } }

function validate(rootArg, runtimeArg, sourceCommit) {
  const root = path.resolve(rootArg);
  const runtime = path.resolve(runtimeArg);
  const manifestPath = path.join(root, 'vendor', 'native-helper-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const recordPath = path.join(runtime, manifest.provenancePath);
  const errors = [];
  let record;
  try { record = JSON.parse(fs.readFileSync(recordPath, 'utf8')); }
  catch (_) { return {status: 'failed', errors: ['native-helper-provenance-missing-or-invalid'], record: null}; }
  if (record.schemaVersion !== 1 || record.protocolVersion !== manifest.protocolVersion) errors.push('native-helper-protocol-mismatch');
  if (record.sourceCommit !== String(sourceCommit).toLowerCase()) errors.push('native-helper-source-commit-mismatch');
  const temporary = path.join(root, '.work', 'native-helper-provenance-' + process.pid + '-' + Date.now() + '.cpp');
  try {
    const source = materialize(root, sourceCommit, manifest.sourcePath, temporary);
    if (!record.source || record.source.path !== manifest.sourcePath || record.source.gitBlobObjectId !== source.objectId || record.source.sha256 !== source.sha256 || record.source.size !== source.size) {
      errors.push('native-helper-source-identity-mismatch');
    }
  } catch (_) { errors.push('native-helper-source-materialization-failed'); }
  finally { try { fs.rmSync(temporary, {force: true}); } catch (_) { } }
  const header = path.join(root, manifest.clientHeader.path);
  if (!exists(header) || hashFile(header) !== manifest.clientHeader.sha256 || !record.clientHeader || record.clientHeader.sha256 !== manifest.clientHeader.sha256) errors.push('native-helper-header-mismatch');
  const libmpv = path.join(runtime, manifest.libmpv.runtimePath);
  if (!exists(libmpv) || hashFile(libmpv) !== manifest.libmpv.sha256 || !record.libmpv || record.libmpv.sha256 !== manifest.libmpv.sha256) errors.push('native-helper-libmpv-mismatch');
  const helper = path.join(runtime, manifest.runtimePath);
  if (!exists(helper) || !record.helper || record.helper.runtimePath !== manifest.runtimePath || record.helper.sha256 !== hashFile(helper) || record.helper.size !== fs.statSync(helper).size || record.helper.testing !== false) errors.push('native-helper-binary-mismatch');
  let expectedContract = null;
  try { expectedContract = nativeHelperContract.inspect(root); }
  catch (_) { errors.push('native-helper-build-contract-not-committed'); }
  if (!expectedContract || JSON.stringify(record.contract) !== JSON.stringify(expectedContract)) errors.push('native-helper-build-contract-mismatch');
  const expectedFlags = (manifest.compiler.flags || []).concat(manifest.compiler.linkerFlags || []);
  if (!record.compiler || record.compiler.sha256 !== manifest.compiler.sha256 || record.compiler.version !== manifest.compiler.version ||
      JSON.stringify(record.compiler.flags) !== JSON.stringify(expectedFlags)) errors.push('native-helper-compiler-mismatch');
  return {status: errors.length ? 'failed' : 'passed', errors, record};
}

if (require.main === module) {
  const [root, runtime, sourceCommit] = process.argv.slice(2);
  if (!root || !runtime || !sourceCommit) throw new Error('Usage: native-helper-provenance.cjs <root> <runtime> <sourceCommit>');
  const result = validate(root, runtime, sourceCommit);
  process.stdout.write(JSON.stringify(result) + '\n');
  if (result.status !== 'passed') process.exitCode = 1;
}

module.exports = {validate};
