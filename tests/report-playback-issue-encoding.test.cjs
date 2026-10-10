'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const PS51 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

function executable(name) {
  const result = spawnSync('where.exe', [name], {encoding: 'utf8', windowsHide: true});
  return result.status === 0 ? result.stdout.split(/\r?\n/).find(Boolean) : null;
}

function runProbe(shell, mode, scriptPath, outputRoot) {
  const env = {
    ...process.env,
    ETE_ENCODING_MODE: mode,
    ETE_ENCODING_TARGET: scriptPath,
    ETE_ENCODING_OUTPUT: outputRoot,
    ETE_ENCODING_COLLECTOR: path.join(path.dirname(path.dirname(scriptPath)), 'encoding-collector-fixture.ps1'),
  };
  const command = String.raw`
$ErrorActionPreference = 'Stop'
$target = $env:ETE_ENCODING_TARGET
$mode = $env:ETE_ENCODING_MODE
if ($mode -eq 'parse-file') {
    $tokens = $null
    $errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($target, [ref]$tokens, [ref]$errors)
    if (@($errors).Count -gt 0) {
        [Console]::Error.WriteLine(($errors | ForEach-Object { '{0}:{1}:{2} {3}' -f $_.Extent.File, $_.Extent.StartLineNumber, $_.Extent.StartColumnNumber, $_.Message }) -join [Environment]::NewLine)
        exit 21
    }
    [Console]::WriteLine('PARSE_FILE=PASS')
    exit 0
}
if ($mode -eq 'parse-simulated-cp1252') {
    $bytes = [IO.File]::ReadAllBytes($target)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xef -and $bytes[1] -eq 0xbb -and $bytes[2] -eq 0xbf) {
        $text = (New-Object System.Text.UTF8Encoding($false, $true)).GetString($bytes, 3, $bytes.Length - 3)
        $sourceMode = 'SIMULATED_CP1252_BOM_UTF8_DECODED'
    } else {
        $text = [Text.Encoding]::GetEncoding(1252).GetString($bytes)
        $sourceMode = 'SIMULATED_CP1252_ANSI_DECODED'
    }
    $tokens = $null
    $errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseInput($text, [ref]$tokens, [ref]$errors)
    [Console]::WriteLine(('SOURCE_MODE=' + $sourceMode))
    if (@($errors).Count -gt 0) {
        [Console]::Error.WriteLine(($errors | ForEach-Object { '{0}:{1}:{2} {3}' -f $_.Extent.File, $_.Extent.StartLineNumber, $_.Extent.StartColumnNumber, $_.Message }) -join [Environment]::NewLine)
        exit 22
    }
    [Console]::WriteLine('PARSE_INPUT=PASS')
    exit 0
}
New-Item -ItemType Directory -Force -Path (Join-Path $env:ETE_ENCODING_OUTPUT 'logs'), (Join-Path $env:ETE_ENCODING_OUTPUT 'install') | Out-Null
& $target -OutputRoot $env:ETE_ENCODING_OUTPUT -LogRoot (Join-Path $env:ETE_ENCODING_OUTPUT 'logs') -InstallRoot (Join-Path $env:ETE_ENCODING_OUTPUT 'install') -IssueType 'other' -EmptyUserNote -TestCollectorPath $env:ETE_ENCODING_COLLECTOR -NoZip -SkipWindowsEvents
exit $LASTEXITCODE
`;
  const result = spawnSync(shell, ['-NoProfile', '-Command', command], {
    cwd: path.resolve(__dirname, '..'),
    env,
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true,
  });
  return {
    status: result.status,
    error: result.error && result.error.message,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

test('reporter script encoding stays valid in Windows PowerShell 5.1 and PowerShell 7', t => {
  assert.ok(fs.existsSync(PS51), `Windows PowerShell 5.1 was not found at ${PS51}`);
  const pwsh = executable('pwsh.exe') || executable('pwsh');
  assert.ok(pwsh, 'PowerShell 7 (pwsh) is required for the encoding regression check.');

  const root = path.resolve(__dirname, '..');
  const reporter = path.join(root, 'tools', 'report-playback-issue.ps1');
  const workRoot = path.join(root, '.work', 'ci028-encoding');
  fs.mkdirSync(workRoot, {recursive: true});
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-ci028-encoding-'));
  t.after(() => fs.rmSync(tempRoot, {recursive: true, force: true}));

  const original = spawnSync('git', ['show', 'aa86ddc6b0d5a911440ee6dff41ac20147e8f8e6:tools/report-playback-issue.ps1'], {
    cwd: root,
    encoding: 'buffer',
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(original.status, 0, 'Could not read the known no-BOM baseline blob.');
  assert.equal(original.stdout.subarray(0, 3).equals(UTF8_BOM), false, 'Baseline unexpectedly has a UTF-8 BOM.');

  function createVariant(name, content) {
    const tools = path.join(tempRoot, name, 'tools');
    fs.mkdirSync(tools, {recursive: true});
    const scriptPath = path.join(tools, 'report-playback-issue.ps1');
    fs.writeFileSync(scriptPath, content);
    fs.copyFileSync(path.join(root, 'tools', 'diagnostics-common.ps1'), path.join(tools, 'diagnostics-common.ps1'));
    fs.writeFileSync(path.join(path.dirname(tools), 'encoding-collector-fixture.ps1'), [
      'param([string]$OutputRoot, [string]$IssueCorrelationId)',
      "$bundle = 'encoding-fixture'",
      '$bundlePath = Join-Path $OutputRoot $bundle',
      'New-Item -ItemType Directory -Force -Path $bundlePath | Out-Null',
      "$manifest = [ordered]@{ issueCorrelationId = $IssueCorrelationId; redactionPassed = $true }",
      "[IO.File]::WriteAllText((Join-Path $bundlePath 'manifest.json'), ($manifest | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding($false)))",
      "[ordered]@{ status = 'READY'; bundle = $bundle; redactionPassed = $true; elapsedMs = 1 } | ConvertTo-Json -Compress",
      'exit 0',
    ].join('\n'), 'ascii');
    return scriptPath;
  }
  const legacyPath = createVariant('reporter-no-bom', original.stdout);
  const bomPath = createVariant('reporter-with-bom', Buffer.concat([UTF8_BOM, original.stdout]));

  const matrix = {};
  for (const [shellName, shell] of [['WindowsPowerShell51', PS51], ['PowerShell7', pwsh]]) {
    for (const [variantName, scriptPath] of [['gitBlobNoBom', legacyPath], ['bomAdded', bomPath]]) {
      const outputRoot = path.join(tempRoot, `${shellName}-${variantName}`);
      const parse = runProbe(shell, 'parse-file', scriptPath, outputRoot);
      const execute = runProbe(shell, 'execute', scriptPath, outputRoot);
      matrix[`${shellName}.${variantName}`] = {parseFile: parse, execute};
      assert.equal(parse.error, undefined, `${shellName}/${variantName} ParseFile launch failed.`);
      assert.equal(parse.status, 0, `${shellName}/${variantName} ParseFile failed: ${parse.stderr}${parse.stdout}`);
      assert.equal(execute.error, undefined, `${shellName}/${variantName} execution launch failed.`);
      assert.equal(execute.status, 0, `${shellName}/${variantName} execution failed: ${execute.stderr}${execute.stdout}`);
      assert.match(execute.stdout, /"status"\s*:\s*"READY"/, `${shellName}/${variantName} did not return READY.`);
    }
  }

  const simulatedAnsi = runProbe(PS51, 'parse-simulated-cp1252', legacyPath, tempRoot);
  const bomDecoded = runProbe(PS51, 'parse-simulated-cp1252', bomPath, tempRoot);
  matrix.simulatedCp1252 = {withoutBom: simulatedAnsi, withBom: bomDecoded};
  assert.equal(simulatedAnsi.status, 22, `SIMULATED CP1252 no-BOM ParseInput should fail: ${simulatedAnsi.stderr}${simulatedAnsi.stdout}`);
  assert.match(simulatedAnsi.stdout, /SIMULATED_CP1252_ANSI_DECODED/);
  assert.match(simulatedAnsi.stderr, /:147:35/, 'SIMULATED CP1252 failure moved away from the Hosted line/column regression.');
  assert.equal(bomDecoded.status, 0, `BOM UTF-8 decode should parse: ${bomDecoded.stderr}${bomDecoded.stdout}`);
  assert.match(bomDecoded.stdout, /SIMULATED_CP1252_BOM_UTF8_DECODED/);

  fs.writeFileSync(path.join(workRoot, 'matrix.json'), JSON.stringify(matrix, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(workRoot, 'baseline-no-bom.blob'), original.stdout);

  const current = fs.readFileSync(reporter);
  assert.ok(current.subarray(0, 3).equals(UTF8_BOM), 'Reporter script must have a UTF-8 BOM for Windows PowerShell 5.1 ANSI decoding.');
  const currentBody = current.subarray(3);
  const checkoutNewline = currentBody.includes(Buffer.from('\r\n')) ? '\r\n' : '\n';
  const baselineCheckoutBytes = Buffer.from(original.stdout.toString('utf8').replace(/\r\n|\r|\n/g, checkoutNewline), 'utf8');
  assert.deepEqual(currentBody, baselineCheckoutBytes, 'Reporter bytes changed beyond the UTF-8 BOM and Git checkout newline conversion.');
});
