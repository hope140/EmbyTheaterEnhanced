# Public offline CI

2026-10-10 hosted follow-up: [push run 38040747159](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38040747159) at db9ccde actually passed **657/657** (zero failure/cancellation/skipped/todo), temporary-path diagnostics and all four static gates. JavaScript 220, PowerShell 25, finite credential scan 268 and diff check all succeeded; no required step was skipped. Runner diagnostics observed actual short aliases and PS5.1 code page 1252 (legacy no-BOM parse/execution failed; BOM passed). The original RED and prior local NOT_EXECUTED records remain historical. Subsequent documentation and PR checks are verified at their own HEAD. See [hosted acceptance](CI028_HOSTED_VALIDATION.md).

2026-10-10 CI028 follow-up: hosted aa86ddc run [38036913645](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38036913645) failed 26 of 652 tests; later static gates were skipped. Local fixed code `5b1e092` passed **657/657** using an owned external NTFS 8.3 TEMP (87 files discovered, 81 executed, the same six material-required files NOT_EXECUTED). Independent targeted review passed 6/6. JavaScript 220, PowerShell 5.1 and 7 each 25, finite scan 268, and diff gates passed. The product/build inputs remain identical to b139d87; no runtime rebuild. The fixed hosted workflow remains **NOT_EXECUTED**, awaiting separate push authorization. See [Windows compatibility evidence](CI028_WINDOWS_COMPAT.md). Earlier records below retain their own source identity and status.

2026-10-10 unified candidate b139d87: the local public runner passed 652/652 (85 discovered files, 79 executed, six material-required files NOT_EXECUTED). Execution HEAD was c603251; the only subsequent change was the excluded manager test file, with selected source/tool/fixture inputs unchanged and recorded fingerprints. The complete material-enabled candidate suite passed 723/723. Current local syntax/diff/finite-scan gates passed; hosted GitHub Actions remain NOT_EXECUTED. See [candidate acceptance](INTEGRATION_028_CANDIDATE.md). The original branch record below retains its own identity.

The GitHub Actions workflow in `.github/workflows/public-ci.yml` runs on pull requests and pushes. It uses a Windows runner, grants `contents: read`, disables persisted checkout credentials, pins both Actions to full commit SHAs, and installs the locked JavaScript dependency tree with `npm ci --ignore-scripts`. It does not need repository secrets or build/runtime binaries.

The pinned actions are `actions/checkout` v4.4.0 at `11d5960a326750d5838078e36cf38b85af677262` and `actions/setup-node` v4.4.0 at `49933ea5288caeca8642d1e84afbd3f7d6820020`. Their release pages show GitHub verified signatures: [checkout v4.4.0](https://github.com/actions/checkout/releases/tag/v4.4.0) and [setup-node v4.4.0](https://github.com/actions/setup-node/releases/tag/v4.4.0). Node.js is pinned to 24.18.1.

## Checks

The public test runner discovers every `tests/*.test.cjs` file and excludes only the following six material-required tests. All other discovered tests run serially; a failure outside this list fails the job.

| Excluded test | Why local vendor material is required |
| --- | --- |
| `tests/device-identity.test.cjs` | Reads the Carnival `app.js` and `connectionmanager.js` sources plus the patched `apiclient.js`; those source/payload files are not in the public checkout. |
| `tests/external-player-process-chain.test.cjs` | Reads `src/electronapp/preload.js`, an ignored generated file prepared from the unavailable Carnival preload. |
| `tests/playback-route-stats.test.cjs` | Reads Carnival's `modules/playerstats/playerstats.js`, which is not in the public checkout. |
| `tests/playbackmanager-request-session.test.cjs` | Applies the maintained patch to Carnival's `modules/common/playback/playbackmanager.js`; that source is not in the public checkout. |
| `tests/runtime-provenance.test.cjs` | Builds fixtures from the vendor manifests, canonical Carnival files, patch payloads, and generated preload contract; the required source trees and payloads are not present. |
| `tests/web-overlay-preparation.test.cjs` | Copies the frozen web overlay bases and patch payload inputs from `vendor/carnival` and `vendor/patch`, which are not present in the public checkout. |

These cases are reported as `material-required` and `NOT EXECUTED`; their exclusion is not a pass. The local inventory used to establish these reasons found the listed vendor source paths and generated preload absent. A previous audit recorded a separate 632-test baseline with 623 passing and 9 missing-input failures; that historical run is not repeated or treated as this CI result.

The other gates perform these checks:

- `tools/ci-windows-path-diagnostics.cjs` runs before tests and records raw/native temporary path identity, short-name flags, lstat and ancestor relationships. All path values use stable opaque labels; it reads no credentials or file contents and cleans only its own physical temporary directory. This diagnostic has been validated locally; a new hosted result is still pending.
- `tools/ci-syntax.cjs` runs `node --check` on every tracked `.js`, `.cjs`, and `.mjs` file under maintained `src/`, `tools/`, and `tests/` paths.
- `tools/ci-powershell-syntax.ps1` parses every tracked `.ps1` and `.psm1` file in those paths using PowerShell's parser.
- `tools/ci-secret-scan.cjs` checks tracked text in maintained source, CI workflow files, and this document for a small fixed set of private-key, AWS, GitHub token, and OpenAI key patterns. Findings contain only path and rule identifiers. This finite pattern scan is not a complete secret scan.
- `tools/ci-diff-check.cjs` runs `git diff --check` from the PR base to `HEAD` or from the push's before SHA to `HEAD`. On a newly created branch, it resolves the merge-base with `origin/<default_branch>`; a missing tracking ref fails closed. Its regression tests use temporary Git repositories and verify that bad whitespace fails and clean changes pass for PR, ordinary push, and new-branch push events.

## Local commands

Run from the repository root in PowerShell:

```powershell
npm ci --ignore-scripts
node tools/ci-public-tests.cjs
node tools/ci-syntax.cjs
pwsh -NoProfile -File tools/ci-powershell-syntax.ps1
node tools/ci-secret-scan.cjs
$env:CI_EVENT_NAME = 'push'
$env:CI_PUSH_BEFORE = '<base-commit-sha>'
$env:CI_DEFAULT_BRANCH = 'main'
node tools/ci-diff-check.cjs
```

For a pull request diff check, set `CI_EVENT_NAME` to `pull_request` and `CI_PULL_REQUEST_BASE` to the base commit SHA. GitHub Actions supplies those event values automatically. For a new-branch push, GitHub Actions supplies the zero before SHA and repository default branch; the checker compares only the branch's contribution after its default-branch merge-base.

## Verification record

Local implementation baseline: `d875ba5b69ef75bcc6ba439182700f3fb865f70c` on `codex/ci-public-offline`, Node.js v24.18.1. The final public run discovered 81 test files, ran 75 and passed **622/622** tests with zero failed, cancelled or skipped tests (exit 0, 261613.0865 ms). The six excluded material-required files remain **NOT_EXECUTED**. Raw output and exit receipt are `.work/ci/public-tests.log` and `public-tests-exit.txt`. An earlier run interrupted by the worker session limit had only its discovery header; it is retained as `public-tests-interrupted.log` and has no completed result.

JavaScript syntax passed for 206 tracked files, PowerShell syntax for 25 files, and the finite credential scan for 253 tracked text files. Their logs, dependency installation result and diff-check result are retained in `.work/ci/`. The test set includes seven temporary-Git regression cases for the PR/push/new-branch diff gate, one test-discovery contract case and two credential-scanner cases. GitHub Actions itself was **NOT_EXECUTED** for this local branch. There is no hosted-runner result in this record.
