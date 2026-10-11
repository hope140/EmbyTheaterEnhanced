'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const buildInputs = require('../tools/build-input-contract.cjs');

const root = path.resolve(__dirname, '..');
const installerPath = path.join(root, 'installer', 'EmbyTheaterEnhanced.iss');
const guardPath = path.join(root, 'installer', 'installer-guard.iss');

function section(source, name) {
    const lines = source.split(/\r?\n/);
    const start = lines.findIndex(line => new RegExp('^\\s*\\[' + name + '\\]\\s*$').test(line));
    assert.notEqual(start, -1, 'missing [' + name + '] section');
    const body = [];
    for (let i = start + 1; i < lines.length && !/^\s*\[[^\]]+\]\s*$/.test(lines[i]); i++) body.push(lines[i]);
    return body;
}

function keyedEntries(lines, allowedLanguages, label) {
    const result = new Map();
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(';')) continue;
        const match = /^([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(trimmed);
        if (!match) continue;
        assert.ok(allowedLanguages.includes(match[1]), label + ' contains unexpected language ' + match[1]);
        const id = match[2];
        const byLanguage = result.get(id) || new Map();
        assert.equal(byLanguage.has(match[1]), false, label + ' duplicates ' + match[1] + '.' + id);
        byLanguage.set(match[1], match[3]);
        result.set(id, byLanguage);
    }
    return result;
}

function placeholders(value) {
    return (value.match(/%(?:\d+|[nN])/g) || []).sort();
}

function assertLanguagePairs(entries, label) {
    assert.ok(entries.size > 0, label + ' must define entries for both languages');
    for (const [id, values] of entries) {
        assert.deepEqual([...values.keys()].sort(), ['chinesesimplified', 'english'], label + ' pair missing for ' + id);
        assert.deepEqual(placeholders(values.get('chinesesimplified')), placeholders(values.get('english')),
            label + ' placeholder mismatch for ' + id);
    }
}

test('installer offers the explicit English preference identity and Simplified Chinese with Windows language preference', () => {
    const source = fs.readFileSync(installerPath, 'utf8');
    const setup = section(source, 'Setup').join('\n');
    const languages = section(source, 'Languages');
    const languageNames = languages.map(line => /^\s*Name\s*:\s*"([^"]+)"/i.exec(line.trim())).filter(Boolean).map(match => match[1]);

    assert.deepEqual(languageNames.sort(), ['chinesesimplified', 'english']);
    assert.match(source, /^\s*Name\s*:\s*"chinesesimplified"\s*;\s*MessagesFile\s*:\s*"languages\\ChineseSimplified\.isl"/im);
    assert.match(setup, /^\s*UsePreviousLanguage\s*=\s*yes\s*$/im);
    assert.match(setup, /^\s*LanguageDetectionMethod\s*=\s*uilanguage\s*$/im);
    assert.match(setup, /^\s*ShowLanguageDialog\s*=\s*yes\s*$/im);
    assert.match(setup, /^\s*DisableDirPage\s*=\s*no\s*$/im);
    assert.match(setup, /^\s*UsePreviousAppDir\s*=\s*yes\s*$/im);
    assert.equal(languageNames.includes('default'), false,
        'the legacy English-only record must fall back to Windows UI language');
    assert.match(source, /^\s*#include\s+"installer-guard\.iss"\s*$/im);
});

test('custom and native installer messages keep paired placeholders across both languages', () => {
    const source = fs.readFileSync(installerPath, 'utf8');
    const customMessages = keyedEntries(section(source, 'CustomMessages'), ['english', 'chinesesimplified'], '[CustomMessages]');
    assertLanguagePairs(customMessages, '[CustomMessages]');
    for (const id of ['ClientRunning', 'ProcessCheckFailed', 'FileBusy', 'InstalledRecordInvalid',
        'RecoveryAdvice', 'DesktopShortcut', 'LaunchApp']) {
        assert.ok(customMessages.has(id), '[CustomMessages] must provide both languages for ' + id);
    }
    const nativeMessages = keyedEntries(section(source, 'Messages'), ['english', 'chinesesimplified'], '[Messages]');
    for (const id of ['WelcomeLabel2', 'ConfirmUninstall', 'UninstalledAll']) {
        assert.ok(nativeMessages.has(id), '[Messages] must preserve the native ' + id + ' text in both languages');
    }
    assertLanguagePairs(nativeMessages, '[Messages]');
    assert.match(source, /Personal settings/i);
    assert.match(source, /DeviceId/i);
    assert.match(source, /个人设置、登录数据和设备标识/);
});

test('installer language, guard, license and source files are committed build inputs and contain no replacement characters', () => {
    const installer = fs.readFileSync(installerPath, 'utf8');
    const guard = fs.readFileSync(guardPath, 'utf8');
    const chineseLanguage = fs.readFileSync(path.join(root, 'installer/languages/ChineseSimplified.isl'), 'utf8');
    const probe = fs.readFileSync(path.join(root, 'tests', 'fixtures', 'installer-guard-probe.iss'), 'utf8');
    const inputPaths = [
        'installer/EmbyTheaterEnhanced.iss',
        'installer/installer-guard.iss',
        'installer/languages/ChineseSimplified.isl',
        'installer/languages/LICENSE.txt',
        'installer/languages/SOURCE.md',
        'installer/languages/SHA256SUMS.txt'
    ];

    for (const inputPath of inputPaths) {
        assert.ok(fs.existsSync(path.join(root, ...inputPath.split('/'))), 'missing committed installer input ' + inputPath);
        assert.ok(buildInputs.INPUT_PATHS.includes(inputPath), 'build input contract omits ' + inputPath);
    }
    assert.doesNotMatch(installer + '\n' + guard + '\n' + chineseLanguage, /\uFFFD/, 'installer source contains a Unicode replacement character');
    assert.match(probe, /^\s*PrivilegesRequired\s*=\s*lowest\s*$/im);
    assert.match(probe, /^\s*Uninstallable\s*=\s*no\s*$/im);
    assert.match(probe, /GuardResult\s*:=\s*GuardTarget\(TargetDir\)/i);
    assert.match(probe, /IsAbsoluteTargetDir\(TargetDir\)/i);
    assert.match(probe, /Result\s*:=\s*False\s*;/i);
    for (const forbiddenSection of ['Files', 'Registry', 'Run']) {
        assert.doesNotMatch(probe, new RegExp('^\\s*\\[' + forbiddenSection + '\\]\\s*$', 'im'),
            'probe fixture must not perform installation writes through [' + forbiddenSection + ']');
    }
    assert.match(guard, /function\s+CheckTargetProcesses\s*\(/i);
    assert.match(guard, /function\s+CheckTargetFiles\s*\(/i);
    assert.match(guard, /function\s+GuardTarget\s*\(/i);
});
