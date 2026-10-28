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
function routes(job, event, ref, benchmarkMode, sharedMode = false, diagnosticMode = false, appMode = false) {
    const conditions = [...job.matchAll(/^    if: (.+)$/gm)];
    assert.equal(conditions.length, 1, 'one top-level job condition required');
    return conditions[0][1].split(/\s+&&\s+/).map(clause => {
        const compare = /^github\.(event_name|ref) (==|!=) '([^']+)'$/.exec(clause);
        if (compare) {
            const equal = (compare[1] === 'event_name' ? event : ref) === compare[3];
            return compare[2] === '==' ? equal : !equal;
        }
        const suite=typeof appMode==='string'?appMode:appMode?'app-entry':'native-liveness';
        if (clause === "startsWith(inputs.benchmark_warm_calls, 'app-')") return suite.startsWith('app-');
        if (clause === "!startsWith(inputs.benchmark_warm_calls, 'app-')") return !suite.startsWith('app-');
        const choices=/^contains\(fromJSON\('([^']+)'\), inputs\.benchmark_warm_calls\)$/.exec(clause);
        if(choices){const values=JSON.parse(choices[1]);assert.ok(Array.isArray(values)&&values.every(v=>typeof v==='string'));return values.includes(suite);}
        if (clause === 'inputs.shared_cache_diagnostics') return diagnosticMode;
        if (clause === '!inputs.shared_cache_diagnostics') return !diagnosticMode;
        if (clause === 'inputs.shared_cache_smoke') return sharedMode;
        if (clause === '!inputs.shared_cache_smoke') return !sharedMode;
        assert.ok(['inputs.build_input_benchmark', '!inputs.build_input_benchmark'].includes(clause), 'unsupported route clause');
        return clause.startsWith('!') ? !benchmarkMode : benchmarkMode;
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
                    event === 'workflow_dispatch' && !mode,
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

test('explicit benchmark mode rejects conflicting release or source SHAs before checkout', () => {
    for (const event of ['push', 'pull_request', 'workflow_run', 'pull_request_target', 'workflow_dispatch']) {
        for (const ref of ['refs/heads/main', 'refs/heads/perf/build-inputs', 'refs/tags/reviewed']) {
            for (const mode of [false, true]) {
                assert.equal(routes(benchmark, event, ref, mode),
                    event === 'workflow_dispatch' && mode,
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

test('default manual test and release dispatches preserve the normal package route', () => {
    const setting = /^      build_input_benchmark:\n((?:        [^\n]*\n)+)/m.exec(workflow);
    assert.ok(setting, 'benchmark input declaration required');
    assert.match(setting[1], /^        type: boolean$/m);
    const declaredDefault = /^        default: (true|false)$/m.exec(setting[1]);
    assert.ok(declaredDefault, 'explicit boolean default required');
    const defaultMode = declaredDefault[1] === 'true';
    assert.equal(defaultMode, false, 'ordinary manual dispatch must remain the default');
    assert.match(workflow, /release_package:\n +description: [^\n]+\n +type: boolean\n +default: false/);
    assert.match(manual, /ETE_RELEASE_PACKAGE: \$\{\{ inputs\.release_package \}\}/);
    assert.match(manual, /run: \.\/tools\/ci-windows-test-package\.ps1 -ReleasePackage:\(\$env:ETE_RELEASE_PACKAGE -eq 'true'\)/);
    for (const ref of ['refs/heads/main', 'refs/heads/perf/build-inputs', 'refs/heads/reviewed-feature']) {
        for (const releasePackage of [false, true]) {
            const context = JSON.stringify({ref, releasePackage, benchmarkMode: defaultMode});
            assert.equal(routes(manual, 'workflow_dispatch', ref, defaultMode), true, context);
            assert.equal(routes(benchmark, 'workflow_dispatch', ref, defaultMode), false, context);
            assert.equal(routes(manual, 'workflow_dispatch', ref, true), false, 'explicit benchmark cannot fall back: ' + context);
            assert.equal(routes(benchmark, 'workflow_dispatch', ref, true), true, 'explicit benchmark gate must execute: ' + context);
        }
    }
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


test('shared cache smoke is explicit, independent and cannot fall through to package or benchmark', () => {
    const smoke = jobBlock('windows-shared-cache-smoke');
    assertPinnedSource(smoke);
    for (const event of ['push', 'pull_request', 'workflow_dispatch']) for (const mode of [false, true]) {
        assert.equal(routes(smoke, event, 'refs/heads/experiment/shared-playback-cache', false, mode), event === 'workflow_dispatch' && mode);
        if (mode) {
            assert.equal(routes(manual, event, 'refs/heads/experiment/shared-playback-cache', false, mode), false);
            assert.equal(routes(benchmark, event, 'refs/heads/experiment/shared-playback-cache', true, mode), false);
        }
    }
    assert.match(smoke, /permissions:\n      contents: read\n      actions: read/);
    assert.match(smoke, /group: ete-shared-cache-native-smoke/);
    assert.match(smoke, /cancel-in-progress: false/);
    assert.match(smoke, /windows-ci\.ps1/);
    assert.doesNotMatch(smoke, /ci-windows-test-package|prepare-ci-build-inputs|build\.ps1/);
    assert.match(smoke, /safe-receipts\/\*/);
    assert.match(workflow, /shared_cache_smoke:\n +description: [^\n]+\n +type: boolean\n +default: false/);
});


test('bounded offline diagnostic mode cannot dispatch a package, native smoke or benchmark', () => {
    const diagnostics = jobBlock('windows-shared-cache-diagnostics'), smoke = jobBlock('windows-shared-cache-smoke'),
        liveness = jobBlock('windows-shared-cache-liveness');
    assertPinnedSource(diagnostics);
    for (const event of ['push', 'pull_request', 'workflow_dispatch']) {
        for (const benchmarkMode of [false, true]) for (const smokeMode of [false, true]) for (const diagnosticMode of [false, true]) {
            const expectedLiveness = event === 'workflow_dispatch' && smokeMode && diagnosticMode;
            assert.equal(routes(liveness, event, 'refs/heads/experiment/shared-playback-cache', benchmarkMode, smokeMode, diagnosticMode), expectedLiveness);
            assert.equal(routes(diagnostics, event, 'refs/heads/experiment/shared-playback-cache', false, smokeMode, diagnosticMode),
                event === 'workflow_dispatch' && diagnosticMode && !smokeMode);
            assert.equal(routes(smoke, event, 'refs/heads/experiment/shared-playback-cache', false, smokeMode, diagnosticMode),
                event === 'workflow_dispatch' && smokeMode && !diagnosticMode);
            assert.equal(routes(manual, event, 'refs/heads/experiment/shared-playback-cache', benchmarkMode, smokeMode, diagnosticMode),
                event === 'workflow_dispatch' && !benchmarkMode && !smokeMode && !diagnosticMode);
            assert.equal(routes(benchmark, event, 'refs/heads/experiment/shared-playback-cache', benchmarkMode, smokeMode, diagnosticMode),
                event === 'workflow_dispatch' && benchmarkMode && !smokeMode && !diagnosticMode);
        }
    }
    assert.match(diagnostics, /timeout-minutes: 10/);
    assert.match(diagnostics, /windows-stability\.cjs/);
    assert.match(diagnostics, /SHARED_STABILITY_REPEATS: \$\{\{ inputs\.benchmark_trials \}\}/);
    assert.doesNotMatch(diagnostics, /GH_TOKEN|actions: read|ci-windows-test-package|windows-ci\.ps1|build\.ps1/);
});

test('combined smoke and diagnostics dispatch only the owned runtime liveness job', () => {
    const liveness = jobBlock('windows-shared-cache-liveness');
    const ciScript = fs.readFileSync(path.join(__dirname, '../tools/shared-playback-cache/windows-ci.ps1'), 'utf8').replace(/\r\n/g, '\n');
    assertPinnedSource(liveness);
    for (const event of ['push', 'pull_request', 'workflow_run', 'pull_request_target', 'workflow_dispatch']) {
        for (const benchmarkMode of [false, true]) for (const smokeMode of [false, true]) for (const diagnosticMode of [false, true]) {
            const selected = event === 'workflow_dispatch' && smokeMode && diagnosticMode;
            assert.equal(routes(liveness, event, 'refs/heads/experiment/shared-playback-cache', benchmarkMode, smokeMode, diagnosticMode), selected);
            assert.equal(routes(jobBlock('windows-shared-cache-smoke'), event, 'refs/heads/experiment/shared-playback-cache', benchmarkMode, smokeMode, diagnosticMode),
                event === 'workflow_dispatch' && smokeMode && !diagnosticMode);
            assert.equal(routes(jobBlock('windows-shared-cache-diagnostics'), event, 'refs/heads/experiment/shared-playback-cache', benchmarkMode, smokeMode, diagnosticMode),
                event === 'workflow_dispatch' && diagnosticMode && !smokeMode);
            assert.equal(routes(manual, event, 'refs/heads/experiment/shared-playback-cache', benchmarkMode, smokeMode, diagnosticMode),
                event === 'workflow_dispatch' && !benchmarkMode && !smokeMode && !diagnosticMode);
            assert.equal(routes(benchmark, event, 'refs/heads/experiment/shared-playback-cache', benchmarkMode, smokeMode, diagnosticMode),
                event === 'workflow_dispatch' && benchmarkMode && !smokeMode && !diagnosticMode);
        }
    }
    assert.match(liveness, /^    runs-on: windows-2022$/m);
    assert.match(liveness, /^    timeout-minutes: 10$/m);
    assert.match(liveness, /permissions:\n      contents: read\n      actions: read/);
    assert.match(liveness, /group: ete-shared-cache-runtime-liveness/);
    assert.match(liveness, /cancel-in-progress: false/);
    assert.match(liveness, /GH_TOKEN: \$\{\{ github\.token \}\}/);
    assert.match(liveness, /windows-ci\.ps1 .* -LivenessOnly/);
    assert.doesNotMatch(liveness, /ci-windows-test-package|npm (?:ci|install)|build\.ps1/);
    assert.match(liveness, /AUDIT_RELEASE: \$\{\{ inputs\.release_package \}\}/);
    assert.match(liveness, /AUDIT_BENCHMARK: \$\{\{ inputs\.build_input_benchmark \}\}/);
    assert.match(liveness, /AUDIT_TOOL_SHA: \$\{\{ inputs\.benchmark_expected_sha \}\}/);
    assert.match(liveness, /if \(\$env:AUDIT_SMOKE -ne 'true' -or \$env:AUDIT_DIAGNOSTICS -ne 'true' -or \$env:AUDIT_BENCHMARK -eq 'true' -or \$env:AUDIT_RELEASE -eq 'true'/);
    assert.match(liveness, /\$env:AUDIT_TOOL_SHA -cnotmatch '\^\[a-f0-9\]\{40\}\$' -or \$env:AUDIT_TOOL_SHA -cne \$env:GITHUB_SHA/);
    assert.match(ciScript, /finally \{ \$headers\.Clear\(\); Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue \}/);
    const tokenRemoval = ciScript.indexOf('finally { $headers.Clear(); Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue }');
    const livenessInvocation = ciScript.indexOf("'windows-liveness.cjs'");
    assert.ok(tokenRemoval >= 0 && livenessInvocation > tokenRemoval, 'artifact token must be cleared before liveness child launch');
});


test('ordinary app verification is explicit and cannot start other manual jobs or rebuild', () => {
    const app = jobBlock('windows-shared-cache-app-performance'); assertPinnedSource(app);
    for (const event of ['push','pull_request','workflow_dispatch']) for (const enabled of [false,true]) {
        assert.equal(routes(app,event,'refs/heads/verify/shared-cache-app-performance',false,true,true,enabled),event==='workflow_dispatch'&&enabled);
        if(enabled) for(const name of ['manual-windows-test-package','windows-build-input-benchmark','windows-shared-cache-smoke','windows-shared-cache-diagnostics','windows-shared-cache-liveness']) {
            assert.equal(routes(jobBlock(name),event,'refs/heads/verify/shared-cache-app-performance',true,true,true,true),false);
        }
    }
    assert.match(app,/-AppPerformanceOnly -AppPerformanceMode/);assert.match(app,/actions: read/);
    assert.doesNotMatch(app,/build\.ps1|ci-windows-test-package|prepare-ci-build-inputs/);
    assert.match(app,/cancel-in-progress: false/);assert.match(app,/safe-receipts\/\*/);
});


test('layered entry/matrix select one isolated reviewed job and cannot dispatch any package or old suite',()=>{
 const strict=jobBlock('windows-shared-cache-app-performance'),layered=jobBlock('windows-shared-cache-layered');assertPinnedSource(layered);
 for(const event of ['push','pull_request','workflow_dispatch'])for(const smoke of [false,true])for(const diagnostics of [false,true])for(const suite of ['app-entry','app-matrix','app-layered-entry','app-layered-matrix','app-layered-minimal-entry','app-layered-minimal-matrix','app-other']){
  const ready=event==='workflow_dispatch'&&smoke&&diagnostics;
  assert.equal(routes(strict,event,'refs/heads/verify/local',false,smoke,diagnostics,suite),ready&&['app-entry','app-matrix'].includes(suite));
  assert.equal(routes(layered,event,'refs/heads/verify/local',false,smoke,diagnostics,suite),ready&&['app-layered-entry','app-layered-matrix','app-layered-minimal-entry','app-layered-minimal-matrix'].includes(suite));
  if(smoke&&diagnostics)for(const name of ['manual-windows-test-package','windows-build-input-benchmark','windows-shared-cache-smoke','windows-shared-cache-diagnostics','windows-shared-cache-liveness'])assert.equal(routes(jobBlock(name),event,'refs/heads/verify/local',true,true,true,suite),false);
 }
 assert.match(layered,/group: ete-shared-cache-ordinary-app-performance/);assert.match(layered,/cancel-in-progress: false/);assert.match(layered,/layered-ci\.ps1/);assert.doesNotMatch(layered,/ci-windows-test-package|prepare-ci-build-inputs|build\.ps1/);
});
