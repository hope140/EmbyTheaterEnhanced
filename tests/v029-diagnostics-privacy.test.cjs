'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const diagnostics = require('../src/electronapp/enhanced/diagnostics');

const root = path.resolve(__dirname, '..');
const basicValue = Buffer.from('synthetic-user:synthetic-private-password').toString('base64');
const cookieValue = 'synthetic-secondary-cookie-v029';
const privateMediaPath = 'C:\\Users\\SyntheticFixture\\Movies\\Private Synthetic Title.mkv';

function powershellProbe(text, options = {}) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-v029-privacy-'));
    try {
        const input = path.join(temp, 'input.json');
        const script = path.join(temp, 'probe.ps1');
        fs.writeFileSync(input, JSON.stringify(options.inputObject || {userNote: text}));
        // Only synthetic values are read. The probe emits sanitized text and gate results.
        fs.writeFileSync(script, [
            'param([string]$Root, [string]$InputFile, [string]$OutputFile)',
            ". (Join-Path $Root 'tools/diagnostics-common.ps1')",
            '$inputValue = [IO.File]::ReadAllText($InputFile) | ConvertFrom-Json',
            options.rawGate ? '[IO.File]::WriteAllText($OutputFile, [IO.File]::ReadAllText($InputFile))' : 'Write-JsonFile $OutputFile $inputValue',
            '$safe = [IO.File]::ReadAllText($OutputFile) | ConvertFrom-Json',
            '$failures = @(Test-SnapshotRedaction -File $OutputFile)',
            '[ordered]@{text=$safe.userNote;gateFailures=$failures} | ConvertTo-Json -Compress'
        ].join('\r\n'));
        const result = spawnSync(options.shell || 'powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
            root, input, path.join(temp, 'safe.json')], {encoding: 'utf8', windowsHide: true, timeout: 30000});
        assert.equal(result.error, undefined, 'PowerShell privacy probe could not run');
        assert.equal(result.status, 0, 'PowerShell privacy probe failed');
        return JSON.parse(result.stdout.trim());
    } finally {
        fs.rmSync(temp, {recursive: true, force: true});
    }
}

test('diagnostic structured keys redact synthetic contemporary API-key values', () => {
    const secret = 'sk-proj-synthetic-only-privacy-v029';
    const result = JSON.stringify(diagnostics.sanitizeRecord({details: {'api_key': secret, 'client-secret': secret,
        Authorization: `Basic ${basicValue}`, Cookie: `first=synthetic; second=${cookieValue}`}}));
    assert.equal(result.includes(secret), false, 'structured API key escaped sanitization');
    assert.equal(result.includes(basicValue), false, 'structured Authorization escaped sanitization');
    assert.equal(result.includes(cookieValue), false, 'structured Cookie escaped sanitization');
});

test('diagnostic URL query and private media paths stay summarized', () => {
    const result = JSON.stringify(diagnostics.sanitizeRecord({details: {
        directUrl: 'https://synthetic.115.test/private-title.mkv?sign=synthetic-signed-secret-v029',
        path: 'C:\\Users\\SyntheticFixture\\Movies\\Private Synthetic Title.mkv',
        note: 'https://synthetic.emby.test/Videos/item/stream?X-Emby-Token=synthetic-key-v029'
    }}));
    for (const raw of ['synthetic-signed-secret-v029', 'synthetic-key-v029', 'Private Synthetic Title', 'private-title']) {
        assert.equal(result.includes(raw), false, 'URL/path content escaped sanitization');
    }
});

for (const mediaPath of [privateMediaPath, '\\\\SyntheticNAS\\Movies\\Private Synthetic Title.mkv',
    '/mnt/synthetic media/Private Synthetic Title.mkv']) {
    test(`free-text ${mediaPath.startsWith('/') ? 'POSIX' : mediaPath.startsWith('\\\\') ? 'UNC' : 'drive'} path with spaces preserves later lines`, () => {
        const input = `opening ${mediaPath}\r\nafter=useful-status`;
        const client = diagnostics.sanitizeRecord({details: {message: input}}).details.message;
        const problem = powershellProbe(input);
        for (const safe of [client, problem.text]) {
            assert.equal(safe.includes('Synthetic Title'), false, 'private media title escaped path sanitization');
            assert.equal(safe.includes('SyntheticFixture'), false, 'private path owner escaped path sanitization');
            assert.equal(safe.includes('SyntheticNAS'), false, 'private UNC host escaped path sanitization');
            assert.equal(safe.includes('\r\nafter=useful-status'), true);
        }
        assert.deepEqual(problem.gateFailures, []);
    });
}

test('client free text removes the complete Basic Authorization value', () => {
    const result = JSON.stringify(diagnostics.sanitizeRecord({details: {message: `Authorization: Basic ${basicValue}`}}));
    assert.equal(result.includes(basicValue), false, 'Basic credential escaped client free-text sanitization');
});

test('client free text removes every value in a Cookie header', () => {
    const result = JSON.stringify(diagnostics.sanitizeRecord({details: {message: `Cookie: first=synthetic; second=${cookieValue}`}}));
    assert.equal(result.includes(cookieValue), false, 'secondary Cookie escaped client free-text sanitization');
});

test('problem-report note removes the complete Basic Authorization value before its gate', () => {
    const result = powershellProbe(`Authorization: Basic ${basicValue}`);
    assert.equal(result.text.includes(basicValue), false, 'Basic credential escaped problem-report note sanitization');
    assert.deepEqual(result.gateFailures, []);
});

test('problem-report note removes every Cookie value before its gate', () => {
    const result = powershellProbe(`Cookie: first=synthetic; second=${cookieValue}`);
    assert.equal(result.text.includes(cookieValue), false, 'secondary Cookie escaped problem-report note sanitization');
    assert.deepEqual(result.gateFailures, []);
});

const headerCases = [
    ['Authorization', `Basic   ${basicValue}`],
    ['pRoXy-AuThOrIzAtIoN', 'SyntheticScheme synthetic-proxy-credential'],
    ['CoOkIe', `first=synthetic; second=${cookieValue}; third=synthetic-third`],
    ['SeT-CoOkIe', 'session=synthetic-set-cookie; Path=/; HttpOnly; Secure']
];

for (const [header, value] of headerCases) {
    test(`${header} free text preserves later diagnostic lines in both serializers`, () => {
        const input = `before=okay\r\n${header}: ${value}\r\nafter=useful-status`;
        const client = diagnostics.sanitizeRecord({details: {message: input}}).details.message;
        assert.equal(client, `before=okay\r\n${header}: [REDACTED]\r\nafter=useful-status`);
        const problem = powershellProbe(input);
        assert.equal(problem.text, `before=okay\r\n${header}: [redacted]\r\nafter=useful-status`);
        assert.deepEqual(problem.gateFailures, []);
    });
}

test('final snapshot gate rejects raw or partially redacted auth and cookie headers', () => {
    for (const [header, value] of headerCases) {
        for (const text of [`${header}: ${value}`, `${header}: [redacted] ${value}`]) {
            const result = powershellProbe(text, {rawGate: true});
            assert.equal(result.gateFailures.some(code => code.startsWith('header_value:')), true,
                'header gate accepted a raw value or placeholder followed by credentials');
        }
    }
});

test('final snapshot gate admits only complete placeholders after header whitespace', () => {
    for (const whitespace of ['', ' ', '   ', '\t', ' \t  ']) {
        for (const header of ['Authorization', 'Proxy-Authorization', 'Cookie', 'Set-Cookie']) {
            assert.deepEqual(powershellProbe(`${header}:${whitespace}[redacted]`, {rawGate: true}).gateFailures, []);
            assert.equal(powershellProbe(`${header}:${whitespace}[redacted] synthetic-tail`, {rawGate: true})
                .gateFailures.some(code => code.startsWith('header_value:')), true);
        }
    }
});

test('PowerShell 7 applies the same multiline header and refusal contract', () => {
    const text = `Proxy-Authorization: SyntheticScheme synthetic-proxy-credential\nSet-Cookie: first=synthetic; second=${cookieValue}\nafter=useful-status`;
    const result = powershellProbe(text, {shell: 'pwsh.exe'});
    assert.equal(result.text, 'Proxy-Authorization: [redacted]\nSet-Cookie: [redacted]\nafter=useful-status');
    assert.deepEqual(result.gateFailures, []);
    assert.equal(powershellProbe(`Cookie: [redacted] second=${cookieValue}`, {shell: 'pwsh.exe', rawGate: true})
        .gateFailures.some(code => code.startsWith('header_value:')), true);
});

test('final snapshot gate rejects Proxy-Authorization and Set-Cookie JSON keys', () => {
    for (const header of ['Proxy-Authorization', 'proxy_authorization', 'Set-Cookie', 'set_cookie']) {
        const result = powershellProbe('', {rawGate: true, inputObject: {userNote: '', [header]: 'synthetic-header-secret'}});
        assert.equal(result.gateFailures.some(code => code.startsWith('sensitive_json_key:')), true,
            'sensitive header key escaped the final gate');
    }
});

test('actual issue snapshot and collector ZIP contain only sanitized synthetic secrets and media paths', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-v029-zip-'));
    try {
        const logs = path.join(temp, 'logs');
        const install = path.join(temp, 'synthetic-install');
        const output = path.join(temp, 'output');
        for (const directory of [logs, install, output]) fs.mkdirSync(directory);
        const capture = new Date().toISOString();
        fs.writeFileSync(path.join(logs, 'ete-client.jsonl'), JSON.stringify({timestamp: capture,
            category: 'fixture', event: 'privacy', details: {
                message: `Authorization: Basic ${basicValue}\nCookie: first=synthetic; second=${cookieValue}\nopening ${privateMediaPath}\nafter=useful-status`
            }}) + '\n');
        const script = path.join(temp, 'zip-probe.ps1');
        fs.writeFileSync(script, [
            'param([string]$Root,[string]$Logs,[string]$Install,[string]$Output,[string]$Capture)',
            "$note = ([IO.File]::ReadAllText((Join-Path $Logs 'ete-client.jsonl')) | ConvertFrom-Json).details.message",
            "$raw = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'tools/report-playback-issue.ps1') -LogRoot $Logs -InstallRoot $Install -OutputRoot $Output -CaptureTime $Capture -IssueType other -UserNote $note -SkipWindowsEvents",
            "if ($LASTEXITCODE -ne 0) { throw 'Synthetic collector failed.' }",
            '$result = ($raw -join "`n") | ConvertFrom-Json',
            'Add-Type -AssemblyName System.IO.Compression.FileSystem',
            '$zip = [IO.Compression.ZipFile]::OpenRead((Join-Path $Output ([string]$result.zip)))',
            'try {',
            "  $entry = @($zip.Entries | Where-Object {$_.FullName -match 'logs[/\\\\]client.jsonl$'})[0]",
            "  if (-not $entry) { throw 'Synthetic ZIP log missing.' }",
            '  $reader = New-Object IO.StreamReader($entry.Open())',
            '  try { $text = $reader.ReadToEnd() } finally { $reader.Dispose() }',
            '  $snapshot = [IO.File]::ReadAllText((Join-Path $Output ([string]$result.snapshot)))',
            '  [ordered]@{text=($text + "`n" + $snapshot);redactionPassed=$result.redactionPassed;entryCount=$zip.Entries.Count} | ConvertTo-Json -Compress',
            '} finally { $zip.Dispose() }'
        ].join('\r\n'));
        const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
            root, logs, install, output, capture], {encoding: 'utf8', windowsHide: true, timeout: 60000});
        assert.equal(result.error, undefined, 'Synthetic ZIP probe could not run');
        assert.equal(result.status, 0, 'Synthetic ZIP probe failed');
        const receipt = JSON.parse(result.stdout.trim());
        assert.equal(receipt.redactionPassed, true);
        assert.equal(receipt.entryCount > 0, true);
        assert.equal(receipt.text.includes(basicValue), false, 'Basic credential remained in actual ZIP');
        assert.equal(receipt.text.includes(cookieValue), false, 'secondary Cookie remained in actual ZIP');
        assert.equal(receipt.text.includes('Synthetic Title'), false, 'private media title remained in actual ZIP');
        assert.equal(receipt.text.includes('after=useful-status'), true);
    } finally {
        fs.rmSync(temp, {recursive: true, force: true});
    }
});
