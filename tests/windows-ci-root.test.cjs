'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync, spawnSync} = require('node:child_process');
const {rootRequest} = require('../tools/shared-playback-cache/windows-ci-root.cjs');
const smoke = require('../tools/shared-playback-cache/windows-smoke.cjs');
const liveness = require('../tools/shared-playback-cache/windows-liveness.cjs');

test('every Windows coordinator binds the structured root helper into its tool identity', () => {
  const helper = 'tools/shared-playback-cache/windows-ci-root.cjs';
  assert.ok(smoke.TOOL_FILES.includes(helper));
  assert.ok(liveness.FILES.includes(helper));
  assert.ok(require('../tools/shared-playback-cache/app-performance-runner.cjs').TOOL_FILES.includes('tools/shared-playback-cache/' + path.basename(helper)));
});

test('owned-root helper keeps preflight diagnostics off stdout and emits one exact JSON response', () => {
  const directory = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-shared-app-test-')));
  const stdout = [], stderr = [];
  try {
    const result = rootRequest('performance', 'entry', {
      temporaryRoot(prefix, relatives) {
        assert.equal(prefix, 'ete-shared-app-');
        assert.equal(relatives.length, 2);
        console.log(JSON.stringify({type: 'range-fixture-port-preflight', readOnly: true, bindRetries: 0}));
        return directory;
      },
      writeOut: value => stdout.push(value), writeErr: value => stderr.push(value),
    });
    assert.deepEqual(result, {schema: 1, kind: 'performance', path: directory});
    assert.equal(stdout.length, 1);
    assert.deepEqual(JSON.parse(stdout[0]), result);
    assert.match(stderr.join(''), /range-fixture-port-preflight/);
    assert.equal(stdout.join('').includes('range-fixture-port-preflight'), false);
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
});

test('invalid owned-root paths and requests fail without producing a success record', () => {
  const output = [];
  assert.throws(() => rootRequest('performance', 'entry', {
    temporaryRoot: () => `${os.tmpdir()}\nSHOULD_NOT_BE_A_PATH`, writeOut: value => output.push(value), writeErr() {},
  }), /windows-ci-root-path-invalid/);
  assert.equal(output.length, 0);
  assert.throws(() => rootRequest('performance', 'all', {writeErr() {}}), /windows-ci-root-request-invalid/);
  assert.throws(() => rootRequest('smoke', 'entry', {writeErr() {}}), /windows-ci-root-request-invalid/);
});

test('CLI stdout is one structured record and PowerShell consumes it without line selection or trimming', () => {
  const tool = path.join(__dirname, '../tools/shared-playback-cache/windows-ci-root.cjs');
  const result = execFileSync(process.execPath, [tool, 'performance', 'entry'], {encoding: 'utf8'});
  const lines = result.trimEnd().split(/\r?\n/);
  assert.equal(lines.length, 1);
  const record = JSON.parse(lines[0]);
  try {
    assert.equal(record.schema, 1);
    assert.equal(record.kind, 'performance');
    assert.equal(path.isAbsolute(record.path), true);
    assert.equal(fs.statSync(record.path).isDirectory(), true);
  } finally {fs.rmSync(record.path, {recursive: true, force: true});}

  const script = fs.readFileSync(path.join(__dirname, '../tools/shared-playback-cache/windows-ci.ps1'), 'utf8');
  assert.match(script, /function Get-OwnedFixtureRoot/);
  assert.match(script, /ConvertFrom-Json -InputObject \$line -AsHashtable/);
  assert.match(script, /StandardError\.ReadToEndAsync\(\)/);
  assert.match(script, /StandardOutput\.BaseStream\.Read/);
  assert.match(script, /\$utf8Strict\.GetString\(\$stdoutBytes\.ToArray\(\)\)/);
  assert.match(script, /\$stdoutBytes\.Length \+ \$count -gt 8192/);
  assert.match(script, /\$stdout\.EndsWith\("`n"/);
  assert.match(script, /\$line\[0\] -eq \[char\]0xFEFF/);
  assert.match(script, /\$line\.Contains\("`n"\)/);
  assert.match(script, /\$stdoutBytes\.Length \+ \$count -gt 8192/);
  assert.match(script, /\$resolved -ine \$path/);
  assert.doesNotMatch(script, /Select-Object\s+-Last\s+1|\$ownedRoot\.Trim\(\)|\$ownerRoot\.Trim\(\)/);
  const parse = execFileSync('pwsh', ['-NoProfile', '-Command', '$tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile(' +
    "'" + path.join(__dirname, '../tools/shared-playback-cache/windows-ci.ps1').replaceAll("'", "''") +
    "',[ref]$tokens,[ref]$errors) | Out-Null; if ($errors.Count) { $errors | Out-String | Write-Error; exit 1 }"], {encoding: 'utf8'});
  assert.equal(parse, '');
});

test('the extracted PowerShell consumer accepts only clean structured helper stdout', {timeout: 15000}, () => {
  const temp = fs.realpathSync.native(os.tmpdir());
  const consumerDir = fs.mkdtempSync(path.join(temp, 'ete-root-consumer-'));
  const scriptFile = path.join(consumerDir, 'consumer.ps1');
  const fakeHelper = path.join(consumerDir, 'windows-ci-root.cjs');
  const goodRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(temp, 'ete-shared-app-consumer-')));
  const badRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(temp, 'wrong-prefix-consumer-')));
  const tempAlias = path.join(temp, 'ete-root-temp-alias-' + process.pid);
  if (process.platform !== 'win32') fs.symlinkSync(temp, tempAlias, 'dir');
  try {
    const productionScript = path.join(__dirname, '../tools/shared-playback-cache/windows-ci.ps1');
    const quotePs = value => "'" + value.replaceAll("'", "''") + "'";
    const extract = "$tokens=$null; $errors=$null; $ast=[System.Management.Automation.Language.Parser]::ParseFile(" +
      quotePs(productionScript) + ",[ref]$tokens,[ref]$errors); if($errors.Count){exit 3}; " +
      "$fn=$ast.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Get-OwnedFixtureRoot'},$true); " +
      "if($null -eq $fn){exit 4}; [Console]::Out.Write($fn.Extent.Text)";
    const functionSource = execFileSync('pwsh', ['-NoProfile', '-Command', extract], {encoding: 'utf8'});
    assert.match(functionSource, /function Get-OwnedFixtureRoot/);
    const harness = functionSource + "\nfunction Resolve-Path { param($LiteralPath, $ErrorAction); $item=Get-Item -LiteralPath $LiteralPath -ErrorAction Stop; " +
      "$target=$item.ResolveLinkTarget($true); $resolved=if($target){$target.FullName}else{$item.FullName}; " +
      "[pscustomobject]@{ProviderPath=$resolved.ToUpperInvariant()} }; " +
      "$ErrorActionPreference='Stop'; try { $value=Get-OwnedFixtureRoot 'performance' 'entry'; if($value -isnot [string] -or $value -cne $env:FAKE_EXPECTED_ROOT){throw 'control-result-invalid'}; [Console]::Out.WriteLine('ROOT_ACCEPTED'); exit 0 } catch { [Console]::Error.WriteLine('ROOT_REJECTED'); exit 7 }\n";
    fs.writeFileSync(scriptFile, harness, {mode: 0o600});
    fs.writeFileSync(fakeHelper, "'use strict';\nprocess.stdout.write(Buffer.from(process.env.FAKE_STDOUT_B64, 'base64'));\nif (process.env.FAKE_STDERR) process.stderr.write(process.env.FAKE_STDERR + '\\n');\n", {mode: 0o600});

    const launch = (output, {newline = true, stderr = 'safe-preflight-diagnostic'} = {}) => {
      const bytes = Buffer.from(output + (newline ? '\n' : ''), 'utf8');
      return spawnSync('pwsh', ['-NoProfile', '-File', scriptFile], {
      encoding: 'utf8', timeout: 10000,
        env: {...process.env,
          ...(process.platform === 'win32' ? {} : {TMPDIR: tempAlias}),
          FAKE_STDOUT_B64: bytes.toString('base64'), FAKE_STDERR: stderr, FAKE_EXPECTED_ROOT: goodRoot},
      });
    };
    const valid = JSON.stringify({schema: 1, kind: 'performance', path: goodRoot});
    const accepted = launch(valid);
    assert.equal(accepted.status, 0);
    assert.match(accepted.stdout, /ROOT_ACCEPTED/);
    assert.match(accepted.stdout, /safe-preflight-diagnostic/);
    assert.doesNotMatch(accepted.stdout + accepted.stderr, /ete-shared-app-consumer-/);

    const rejected = [
      ["diagnostic\n" + valid, true],
      [valid + "\nextra", true],
      ['\ufeff' + valid, true],
      [valid, false],
      [JSON.stringify({schema: 1, kind: 'performance', path: goodRoot, unexpected: true}), true],
      [JSON.stringify({schema: '1', kind: 'performance', path: goodRoot}), true],
      [JSON.stringify({schema: true, kind: 'performance', path: goodRoot}), true],
      [JSON.stringify({schema: 1, kind: 'performance', path: badRoot}), true],
      ['x'.repeat(8193), true],
    ];
    for (const [index, [stdout, newline]] of rejected.entries()) {
      const result = launch(stdout, {newline});
      assert.equal(result.status, 7, `structured rejection case ${index + 1}`);
      assert.match(result.stderr, /ROOT_REJECTED/);
      assert.doesNotMatch(result.stdout + result.stderr, /ete-shared-app-consumer-|wrong-prefix-consumer-/);
    }
  } finally {
    fs.rmSync(consumerDir, {recursive: true, force: true});
    fs.rmSync(goodRoot, {recursive: true, force: true});
    fs.rmSync(badRoot, {recursive: true, force: true});
    fs.rmSync(tempAlias, {force: true});
  }
});
