'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {TextDecoder} = require('node:util');
const {DOC_PATHS, classify, eventFromEnv, git} = require('./ci-change-scope.cjs');
const {scanFiles} = require('./ci-secret-scan.cjs');

// File destinations only: no network requests or anchor validation. Ignore
// fenced examples and inline code. Support inline links/images and definitions.
function linkTargets(text) {
    const prose = text.replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1\s*$/gm, '')
        .replace(/`+[^`\n]*`+/g, '');
    const targets = [];
    for (const match of prose.matchAll(/\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+[^)]*)?\)|^ {0,3}\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/gm)) {
        targets.push(match[1] || match[2] || match[3] || match[4]);
    }
    return new Set(targets);
}

function checkTarget(root, file, target) {
    if (/^(?:https?:|mailto:|#)/i.test(target)) return;
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) throw new Error('Unsupported link scheme.');
    const local = decodeURIComponent(target.split(/[?#]/)[0]);
    const absolute = path.resolve(root, path.dirname(file), local);
    const relative = path.relative(root, absolute);
    if (!local || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || local.startsWith('/') || local.includes('\\')) {
        throw new Error('Local link escapes repository.');
    }
    if (!fs.existsSync(absolute)) throw new Error('Local link target is missing.');
}

function checkDocs(root, scope) {
    if (scope.mode !== 'docs') throw new Error('Documentation checker requires a complete documentation-only range.');
    try { git(root, ['diff', '--check', scope.base, scope.head, '--']); }
    catch { throw new Error('Patch whitespace check failed (source line contents suppressed).'); }
    const files = [...new Set(scope.changes.filter(change => change.status !== 'D').map(change => change.paths.at(-1)))];
    for (const file of files) {
        const absolute = path.join(root, file);
        if (!fs.lstatSync(absolute).isFile() || fs.lstatSync(absolute).isSymbolicLink()) throw new Error('Documentation must be a regular file.');
        const content = new TextDecoder('utf-8', {fatal: true}).decode(fs.readFileSync(absolute));
        if (content.includes('\0') || (content && !content.endsWith('\n'))) throw new Error(file + ': expected UTF-8 text with a final newline.');
        let previous = '';
        // Additions have no base blob. A missing historical blob for a modified
        // file is an error; classification already proved both commits exist.
        const change = scope.changes.find(item => item.paths.at(-1) === file);
        if (change.status !== 'A') previous = git(root, ['show', scope.base + ':' + change.paths[0]]);
        const oldTargets = linkTargets(previous);
        const movedDirectory = path.posix.dirname(change.paths[0]) !== path.posix.dirname(file);
        for (const target of linkTargets(content)) {
            if (!movedDirectory && oldTargets.has(target)) continue;
            try { checkTarget(root, file, target); }
            catch { throw new Error(file + ': new or changed local link is invalid.'); }
        }
    }
    // Detect links broken by a deletion/rename even in unchanged audited prose,
    // without turning unrelated pre-existing archive-link debt into this task.
    const removed = new Set(scope.changes.filter(change => change.status === 'D' || change.status.startsWith('R'))
        .map(change => change.paths[0]).filter(file => !fs.existsSync(path.join(root, file))));
    if (removed.size) {
        for (const file of DOC_PATHS.filter(file => fs.existsSync(path.join(root, file)))) {
            for (const target of linkTargets(fs.readFileSync(path.join(root, file), 'utf8'))) {
                if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) continue;
                const destination = path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURIComponent(target.split(/[?#]/)[0])));
                if (removed.has(destination)) throw new Error(file + ': local link points to a deleted or renamed document.');
            }
        }
    }
    const findings = scanFiles(root, files);
    if (findings.length) throw new Error('Finite credential-pattern check failed: ' + findings.map(item => item.path + ': ' + item.rule).join(', '));
    return files.length;
}

module.exports = {linkTargets, checkTarget, checkDocs};
if (require.main === module) {
    try {
        const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
        const count = checkDocs(root, classify(root, eventFromEnv()));
        process.stdout.write('Documentation checks passed: patch whitespace, UTF-8/final newline, new/changed local file links, finite credential patterns (' + count + ' surviving documents).\n');
    } catch (error) {
        process.stderr.write('Documentation checks failed: ' + error.message + '\n');
        process.exitCode = 1;
    }
}
