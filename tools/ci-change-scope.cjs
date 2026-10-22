'use strict';

const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// Audited prose only. New/unknown paths deliberately require full regression.
// In particular, build-input-contract notices, vendor, installer, native,
// source, test fixtures and dependency declarations are NOT documentation.
const DOC_PATHS = Object.freeze([
    'README.md', 'CHANGELOG.md', 'TODO.md',
    'docs/README.md', 'docs/USER_GUIDE.md', 'docs/KNOWN_ISSUES.md',
    'docs/CONTRIBUTING.md', 'docs/PUBLIC_CI.md', 'docs/PROJECT_STATUS.md',
    'docs/DEVELOPMENT_LOG.md', 'docs/ROADMAP.md', 'docs/NEXT_RELEASE_SCOPE.md',
    'docs/RELEASE_CONVENTIONS.md', 'docs/templates/RELEASE_TEMPLATE.md'
]);
const docs = new Set(DOC_PATHS);
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

function git(root, args) {
    const result = cp.spawnSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
    if (result.error || result.status !== 0) throw new Error('Git range is unavailable or incomplete.');
    return result.stdout;
}

function eventFromEnv(env = process.env) {
    return {eventName: env.CI_EVENT_NAME, pullRequestBase: env.CI_PULL_REQUEST_BASE,
        pullRequestHead: env.CI_PULL_REQUEST_HEAD, pushBefore: env.CI_PUSH_BEFORE, pushHead: env.CI_PUSH_HEAD};
}

function resolveRange(root, event) {
    let base;
    let head;
    if (event.eventName === 'pull_request') {
        base = event.pullRequestBase;
        head = event.pullRequestHead;
    } else if (event.eventName === 'push') {
        base = event.pushBefore;
        head = event.pushHead;
    } else {
        throw new Error('Unknown event requires full regression.');
    }
    if (![base, head].every(value => SHA.test(value || '') && !/^0+$/.test(value))) {
        throw new Error('Missing, zero or invalid range SHA requires full regression.');
    }
    if (git(root, ['rev-parse', '--is-shallow-repository']).trim() !== 'false') {
        throw new Error('Shallow history requires full regression.');
    }
    for (const sha of [base, head]) git(root, ['cat-file', '-e', sha + '^{commit}']);
    const checkout = git(root, ['rev-parse', 'HEAD']).trim();
    if (event.eventName === 'push' && checkout !== head.toLowerCase()) {
        throw new Error('Push checkout does not match event head.');
    }
    // PR checkout may be GitHub's synthetic merge commit; use the event head
    // for the contribution and require it to be included in the tested checkout.
    git(root, ['merge-base', '--is-ancestor', head, checkout]);
    return {base, head};
}

function parseChanges(output) {
    if (!output || !output.endsWith('\0')) throw new Error('Empty or truncated change list.');
    const fields = output.slice(0, -1).split('\0');
    const changes = [];
    while (fields.length) {
        const status = fields.shift();
        if (!/^(?:[AMD]|[RC]\d{1,3})$/.test(status)) throw new Error('Unknown change status.');
        const paths = fields.splice(0, /^[RC]/.test(status) ? 2 : 1);
        if (paths.length !== (/^[RC]/.test(status) ? 2 : 1) || paths.some(file =>
            !file || file.startsWith('/') || file.includes('\\') || file.split('/').some(part => !part || part === '.' || part === '..'))) {
            throw new Error('Invalid or truncated change paths.');
        }
        changes.push({status, paths});
    }
    return changes;
}

function classify(root, event) {
    try {
        const range = resolveRange(root, event);
        // Both rename endpoints are checked. Explicit SHAs cover the entire
        // PR/push, even when its last commit only edits documentation.
        const changes = parseChanges(git(root, ['diff', '--no-ext-diff', '--no-textconv', '--name-status', '-z', '--find-renames', range.base, range.head, '--']));
        let docsOnly = changes.every(change => change.paths.every(file => docs.has(file)));
        if (docsOnly) {
            const paths = [...new Set(changes.flatMap(change => change.paths))];
            for (const sha of [range.base, range.head]) {
                const entries = git(root, ['ls-tree', '-z', sha, '--', ...paths]).split('\0').filter(Boolean);
                if (entries.some(entry => !/^100(?:644|755) blob [0-9a-f]+\t/.test(entry))) docsOnly = false;
            }
        }
        return {...range, changes, mode: docsOnly ? 'docs' : 'full',
            reason: docsOnly ? 'audited-documentation-only' : 'non-documentation-path'};
    } catch (error) {
        return {mode: 'full', reason: error.message};
    }
}

function main() {
    if (process.argv[2] === 'summary') {
        const mode = process.env.CI_SCOPE_MODE === 'docs' ? 'docs' : 'full';
        const summary = mode === 'docs'
            ? 'Route: audited documentation only.\n\nDocumentation checks: ' + process.env.CI_DOCS_OUTCOME + '.\n\nPublic offline regression: **NOT EXECUTED** (documentation route).\n'
            : 'Route: full public offline regression.\n\nPublic offline regression: ' + process.env.CI_TEST_OUTCOME + '.\n';
        if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
        process.stdout.write(summary);
        return;
    }
    const result = classify(path.resolve(process.argv[2] || path.join(__dirname, '..')), eventFromEnv());
    process.stdout.write(JSON.stringify(result) + '\n');
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'mode=' + result.mode + '\n');
}

module.exports = {DOC_PATHS, git, eventFromEnv, resolveRange, parseChanges, classify};
if (require.main === module) main();
