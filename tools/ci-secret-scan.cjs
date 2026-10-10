'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const RULES = Object.freeze([
    {id: 'private-key-pem', expression: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g},
    {id: 'aws-access-key', expression: /\bAKIA[0-9A-Z]{16}\b/g},
    {id: 'github-token', expression: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/g},
    {id: 'openai-api-key', expression: /\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b/g}
]);
const TEXT_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.json', '.ps1', '.psm1', '.md', '.yml', '.yaml']);

function listTrackedFiles(root) {
    const result = childProcess.spawnSync('git', ['ls-files', '-z', '--', 'src', 'tools', 'tests', '.github', 'docs/PUBLIC_CI.md'], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('git ls-files failed with exit code ' + result.status);
    return result.stdout.split('\0').filter(Boolean)
        .filter(file => TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()))
        .sort();
}

function scanFiles(root, files) {
    const findings = [];
    for (const relativePath of files) {
        const content = fs.readFileSync(path.join(root, relativePath), 'utf8');
        for (const rule of RULES) {
            rule.expression.lastIndex = 0;
            if (rule.expression.test(content)) findings.push({path: relativePath, rule: rule.id});
        }
    }
    return findings;
}

function main() {
    const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
    const files = listTrackedFiles(root);
    const findings = scanFiles(root, files);
    if (findings.length) {
        for (const finding of findings) process.stderr.write(finding.path + ': ' + finding.rule + '\n');
        process.stderr.write('Finite credential-pattern scan found ' + findings.length + ' match(es); matched contents are suppressed.\n');
        process.exitCode = 1;
    } else {
        process.stdout.write('Finite credential-pattern scan passed for ' + files.length + ' tracked text files in maintained source, CI workflow, and PUBLIC_CI documentation paths. This is not a complete secret scan.\n');
    }
}

module.exports = {RULES, listTrackedFiles, scanFiles};

if (require.main === module) {
    try { main(); }
    catch (error) {
        process.stderr.write('Credential-pattern scan failed: ' + error.message + '\n');
        process.exitCode = 1;
    }
}
