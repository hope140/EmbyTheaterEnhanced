'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/public-ci.yml'), 'utf8').replace(/\r\n/g, '\n');
function jobBlock(name) {
    const start = workflow.indexOf('\njobs:\n');
    assert.notEqual(start, -1, 'workflow jobs must exist');
    const jobs = workflow.slice(start);
    const headers = [...jobs.matchAll(/^  ([a-zA-Z0-9_-]+):[ \t]*$/gm)];
    assert.equal(headers.filter(match => match[1] === name).length, 1, 'one job required: ' + name);
    const index = headers.findIndex(match => match[1] === name);
    return jobs.slice(headers[index].index, headers[index + 1]?.index ?? jobs.length);
}
const manual = jobBlock('manual-windows-test-package');
const benchmark = jobBlock('windows-build-input-benchmark');

// Evaluate only this workflow's simple AND/string/boolean route clauses.
// Unknown syntax fails rather than silently treating a broader route as safe.
function routes(job, event, ref, benchmarkMode) {
    const conditions = [...job.matchAll(/^    if: (.+)$/gm)];
    assert.equal(conditions.length, 1, 'one top-level job condition required');
    return conditions[0][1].split(/\s+&&\s+/).map(clause => {
        const compare = /^github\.(event_name|ref) (==|!=) '([^']+)'$/.exec(clause);
        if (compare) {
            const equal = (compare[1] === 'event_name' ? event : ref) === compare[3];
            return compare[2] === '==' ? equal : !equal;
        }
        assert.equal(clause, '!inputs.build_input_benchmark', 'unsupported route clause');
        return !benchmarkMode;
    }).every(Boolean);
}
function assertPinnedSource(job) {
    assert.match(job, /ref: \$\{\{ github\.sha \}\}/);
    assert.match(job, /persist-credentials: false/);
    assert.match(job, /^          fetch-depth: 0$/m);
    assert.match(job, /^          node-version: 24\.18\.1$/m);
    assert.doesNotMatch(job, /gh release|release\/|releases|git (?:push|tag)|npm publish/);
    const uses = [...job.matchAll(/uses: [^@\n]+@([^\s]+)/g)].map(match => match[1]);
    assert.equal(uses.length, 3);
    assert.ok(uses.every(ref => /^[0-9a-f]{40}$/.test(ref)));
    assert.deepEqual([...job.matchAll(/^        uses: ([^\s#]+)/gm)].map(match => match[1]), [
        'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
        'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
        'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9'
    ]);
}

test('package job requires an explicit manual event and the MSBuild17-compatible Windows x64 runner', () => {
    assert.match(workflow, /^  workflow_dispatch:\s*$/m);
    for (const event of ['push', 'pull_request', 'workflow_run', 'pull_request_target', 'workflow_dispatch']) {
        for (const ref of ['refs/heads/main', 'refs/heads/perf/build-inputs', 'refs/tags/reviewed']) {
            for (const mode of [false, true]) {
                assert.equal(routes(manual, event, ref, mode),
                    event === 'workflow_dispatch' && ref !== 'refs/heads/perf/build-inputs' && !mode,
                    'package route: ' + JSON.stringify({event, ref, mode}));
            }
        }
    }
    assert.match(manual, /^    runs-on: windows-2022$/m);
    assert.doesNotMatch(manual, /self-hosted|windows-latest|larger|workflow_run|pull_request_target/);
    assert.match(manual, /^      group: ete-manual-windows-test-package$/m);
    assert.match(manual, /cancel-in-progress: false/);
});

test('manual build keeps read-only token permissions and binds checkout to its event commit', () => {
    assert.match(workflow, /^permissions:\n  contents: read\n/m);
    assert.doesNotMatch(workflow, /(?:contents|actions|id-token): write|write-all|secrets\./);
    assertPinnedSource(manual);
});

test('artifact upload is restricted to the staged package and the shortest supported retention', () => {
    assert.match(manual, /run: \.\/tools\/ci-windows-test-package\.ps1/);
    assert.match(manual, /path: test-output\/manual-windows-package\/\*/);
    assert.match(manual, /if-no-files-found: error/);
    assert.match(manual, /retention-days: 1/);
    assert.match(manual, /include-hidden-files: false/);
    assert.doesNotMatch(manual, /path: (?:\.|dist|vendor|\.work)(?:\/\*\*|$)/m);
});

test('benchmark is branch-scoped and conflicting modes or source SHAs stop before checkout', () => {
    for (const event of ['push', 'pull_request', 'workflow_run', 'pull_request_target', 'workflow_dispatch']) {
        for (const ref of ['refs/heads/main', 'refs/heads/perf/build-inputs', 'refs/tags/reviewed']) {
            for (const mode of [false, true]) {
                assert.equal(routes(benchmark, event, ref, mode),
                    event === 'workflow_dispatch' && ref === 'refs/heads/perf/build-inputs',
                    'benchmark route: ' + JSON.stringify({event, ref, mode}));
            }
        }
    }
    const guardStart = benchmark.indexOf('      - name: Require explicit benchmark mode and the reviewed source\n');
    const checkoutStart = benchmark.indexOf('      - name: Check out exact benchmark source\n');
    assert.ok(guardStart >= 0 && checkoutStart > guardStart);
    const guard = benchmark.slice(guardStart, checkoutStart);
    assert.match(guard, /AB_ENABLED: \$\{\{ inputs\.build_input_benchmark \}\}/);
    assert.match(guard, /AB_RELEASE_PACKAGE: \$\{\{ inputs\.release_package \}\}/);
    assert.match(guard, /AB_EXPECTED_SHA: \$\{\{ inputs\.benchmark_expected_sha \}\}/);
    assert.match(guard, /\$ErrorActionPreference = 'Stop'/);
    assert.match(guard, /if \(\$env:AB_ENABLED -ne 'true' -or \$env:AB_RELEASE_PACKAGE -eq 'true'\) \{\n +throw /);
    assert.match(guard, /if \(\$env:AB_EXPECTED_SHA -and \$env:AB_EXPECTED_SHA -cne \$env:GITHUB_SHA\) \{\n +throw /);
    assert.match(guard, /Unit tests: 0/);
});

test('benchmark retains pinned read-only inputs and uploads only bounded diagnostic output', () => {
    assertPinnedSource(benchmark);
    assert.match(benchmark, /^    runs-on: windows-2022$/m);
    assert.doesNotMatch(benchmark, /self-hosted|windows-latest|larger|concurrency:|ci-windows-test-package|npm (?:ci|install)/);
    assert.match(workflow, /benchmark_trials:\n +description: [^\n]+\n +type: choice\n +default: '4'/);
    assert.match(workflow, /benchmark_warm_calls:\n +description: [^\n]+\n +type: choice\n +default: '3'/);
    assert.match(benchmark, /AB_EXPECTED_SHA: \$\{\{ inputs\.benchmark_expected_sha \|\| github\.sha \}\}/);
    assert.match(benchmark, /benchmark-build-inputs-windows\.ps1 -ExpectedSourceCommit \$env:AB_EXPECTED_SHA -OutputRoot \$benchmarkOutput -Trials \(\[int\]\$env:AB_TRIALS\) -WarmCalls \(\[int\]\$env:AB_WARM_CALLS\)/);
    assert.match(benchmark, /^          path: \$\{\{ runner\.temp \}\}\/ci-input-ab-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}\/artifact$/m);
    assert.match(benchmark, /if: always\(\)/);
    assert.match(benchmark, /if-no-files-found: error/);
    assert.match(benchmark, /retention-days: 1/);
    assert.match(benchmark, /include-hidden-files: false/);
    assert.doesNotMatch(benchmark, /path: (?:\.|dist|vendor|\.work)(?:\/\*\*|$)/m);
});
