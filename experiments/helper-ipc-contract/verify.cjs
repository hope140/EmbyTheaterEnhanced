'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { CASES, runFaultInjection } = require('./fault-injection.cjs');

const root = __dirname;
const evidenceDirectory = path.join(root, 'evidence');

function writeJson(name, value) {
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  fs.writeFileSync(path.join(evidenceDirectory, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function pick(results, names) {
  return results.filter(item => names.includes(item.name));
}

function requiredGroupStatus(results, names) {
  const selected = pick(results, names);
  const selectedNames = selected.map(item => item.name);
  return selected.length === names.length && new Set(selectedNames).size === names.length &&
    names.every(name => selectedNames.includes(name)) && selected.every(item => item.status === 'PASS')
    ? 'PASS'
    : 'FAIL';
}

async function main() {
  const fault = await runFaultInjection();
  const byName = new Map(fault.results.map(item => [item.name, item]));
  const expectedNames = CASES.map(([name]) => name);
  const actualNames = fault.results.map(item => item.name);
  const duplicateNames = actualNames.filter((name, index) => actualNames.indexOf(name) !== index);
  const missingNames = expectedNames.filter(name => !actualNames.includes(name));
  const unexpectedNames = actualNames.filter(name => !expectedNames.includes(name));
  const matrixComplete = duplicateNames.length === 0 && missingNames.length === 0 && unexpectedNames.length === 0 &&
    actualNames.length === expectedNames.length;
  const requiredInvariants = {
    'INV-01': byName.get('stale generation response')?.status === 'PASS' && byName.get('event storm from stale generation')?.status === 'PASS' &&
      byName.get('critical Play A -> B late completion')?.status === 'PASS' && byName.get('resolved callback after generation change')?.status === 'PASS',
    'INV-02': byName.get('stale helper instance response')?.status === 'PASS' && byName.get('old helper event after recreate')?.status === 'PASS' &&
      byName.get('helper identity reuse rejected')?.status === 'PASS',
    'INV-03': byName.get('timeout then response')?.status === 'PASS',
    'INV-04': byName.get('cancel then response')?.status === 'PASS',
    'INV-05': byName.get('duplicate response')?.status === 'PASS' && byName.get('helper crash with pending requests')?.status === 'PASS',
    'INV-06': byName.get('helper crash with pending requests')?.status === 'PASS' && byName.get('transport write failure')?.status === 'PASS' &&
      byName.get('scheduled late response after helper crash')?.status === 'PASS',
    'INV-07': byName.get('helper recreate')?.status === 'PASS' && byName.get('helper identity reuse rejected')?.status === 'PASS',
    'INV-08': byName.get('malformed message')?.status === 'PASS' && byName.get('malformed and oversized framing')?.status === 'PASS' &&
      byName.get('framing receive buffer limit')?.status === 'PASS' && byName.get('framing failure closes helper boundary')?.status === 'PASS',
    'INV-09': byName.get('unknown requestId')?.status === 'PASS',
    'INV-10': byName.get('rapid Play A -> B -> C')?.status === 'PASS',
    'INV-11': byName.get('Stop during pending load')?.status === 'PASS',
    'INV-12': byName.get('destroy/recreate shared transport')?.status === 'PASS' && byName.get('helper identity reuse rejected')?.status === 'PASS'
  };
  const allRequiredInvariantsPass = Object.values(requiredInvariants).every(Boolean);

  const protocolMatrix = {
    status: fault.failed === 0 && matrixComplete && allRequiredInvariantsPass ? 'PASS' : 'FAIL',
    identityDecision: {
      helperInstanceId: 'REQUIRED',
      generationId: 'REQUIRED_FOR_MEDIA_SCOPED_MESSAGES',
      requestId: 'REQUIRED_FOR_RESPONSE_BEARING_REQUESTS',
      playerInstanceId: 'NOT_REQUIRED_ON_WIRE'
    },
    messageTaxonomy: ['COMMAND', 'REQUEST', 'RESPONSE', 'EVENT', 'LIFECYCLE', 'ERROR'],
    framing: {
      selectedResearchModel: 'uint32be-length-prefixed-utf8-json',
      partialRead: byName.get('partial and concatenated framing')?.status,
      concatenatedFrames: byName.get('partial and concatenated framing')?.status,
      malformedFrame: byName.get('malformed and oversized framing')?.status,
      messageSizeLimit: '64 KiB default; oversize closes the identity boundary'
    },
    commandAcknowledgement: {
      ipcAccepted: 'local write/submission only',
      mpvCommandSubmitted: 'request/response only when a caller requires native submission result',
      operationCompleted: 'generation-scoped property or lifecycle event; never inferred from submission'
    },
    securityBoundary: {
      transport: 'private inherited pipes',
      listener: false,
      publicEndpoint: false,
      shellForwarding: false,
      filesystemRpc: false
    },
    backpressure: {
      staleEventRetentionBounded: byName.get('event storm from stale generation')?.status,
      diagnosticRetentionBounded: byName.get('event storm from stale generation')?.status,
      commandPathAfterStorm: byName.get('event storm from stale generation')?.status,
      scope: 'bounded model retention and synchronous dispatch; not a native pipe throughput benchmark'
    },
    matrixCoverage: {
      status: matrixComplete ? 'PASS' : 'FAIL',
      expected: expectedNames.length,
      actual: actualNames.length,
      missingNames,
      unexpectedNames,
      duplicateNames
    }
  };

  const raceNames = [
    'rapid Play A -> B -> C',
    'Stop during pending load',
    'NextTrack late event race',
    'critical Play A -> B late completion',
    'resolved callback after generation change',
    'destroy/recreate shared transport',
    'event storm from stale generation'
  ];
  const lifecycleNames = [
    'timeout then response',
    'cancel then response',
    'response just before deadline',
    'response exactly at deadline',
    'never responds',
    'helper crash with pending requests',
    'helper recreate',
    'old helper event after recreate',
    'destroy during pending request',
    'transport write failure',
    'synchronous response state machine',
    'scheduled late response after helper crash',
    'scheduled late response after generation change',
    'helper identity reuse rejected',
    'framing failure closes helper boundary'
  ];

  writeJson('protocol-matrix.json', protocolMatrix);
  writeJson('fault-injection-results.json', fault);
  writeJson('race-results.json', {
    status: requiredGroupStatus(fault.results, raceNames),
    results: pick(fault.results, raceNames)
  });
  writeJson('lifecycle-results.json', {
    status: requiredGroupStatus(fault.results, lifecycleNames),
    invariants: requiredInvariants,
    results: pick(fault.results, lifecycleNames)
  });

  const failedInvariants = Object.entries(requiredInvariants).filter(([, passed]) => !passed).map(([id]) => id);
  const summary = {
    status: fault.failed === 0 && allRequiredInvariantsPass && matrixComplete ? 'PASS' : 'FAIL',
    faultInjection: `${fault.passed}/${fault.total} PASS`,
    matrixComplete,
    invariants: requiredInvariants,
    failedInvariants
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = summary.status === 'PASS' ? 0 : 1;
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
