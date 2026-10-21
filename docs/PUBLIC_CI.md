# Public offline CI

The workflow in `.github/workflows/public-ci.yml` runs on pull requests and pushes using a Windows runner. It grants `contents: read`, disables persisted checkout credentials, pins Actions to full commit SHAs, and installs the locked JavaScript dependencies with `npm ci --ignore-scripts`. It requires no repository secrets, external runtime archives, or built binaries. Node.js is pinned to 24.18.1.

Pinned actions are `actions/checkout` v4.4.0 (`11d5960a326750d5838078e36cf38b85af677262`) and `actions/setup-node` v4.4.0 (`49933ea5288caeca8642d1e84afbd3f7d6820020`).

## Checks

The public runner discovers `tests/*.test.cjs` and excludes only these six tests because their required vendor inputs are not in the public checkout. They are reported as `material-required` / `NOT EXECUTED`, not as passing:

| Excluded test | Required material |
| --- | --- |
| `tests/device-identity.test.cjs` | Carnival `app.js` and `connectionmanager.js`, plus patched `apiclient.js`. |
| `tests/external-player-process-chain.test.cjs` | Generated `src/electronapp/preload.js`, prepared from the unavailable Carnival preload. |
| `tests/playback-route-stats.test.cjs` | Carnival `modules/playerstats/playerstats.js`. |
| `tests/playbackmanager-request-session.test.cjs` | Carnival `modules/common/playback/playbackmanager.js`. |
| `tests/runtime-provenance.test.cjs` | Vendor manifests, canonical Carnival files, patch payloads, and generated preload contract. |
| `tests/web-overlay-preparation.test.cjs` | Frozen Web overlay bases and payloads from `vendor/carnival` and `vendor/patch`. |

### Linux source development

The same public runner can run on Linux with Node.js 24.18.1, the locked npm dependencies and PowerShell 7 (`pwsh`) on PATH. Portable PowerShell helper probes use `pwsh` there; Windows retains `powershell.exe` and the explicit `pwsh.exe` checks. Missing executables fail the probes rather than causing skips.

Five integration cases explicitly skip on non-Windows hosts and remain required by the existing Windows CI job:

| Test | Windows requirement |
| --- | --- |
| `cd2-cold-warm-observer`: black-box contract | Nested Windows PowerShell 5.1 paths in the observer selftest. |
| `diagnostics-collector`: black-box contract | Nested Windows shell calls and hidden process windows. |
| `report-playback-issue`: snapshot black-box contract | Windows reporter and nested collector shell calls. |
| `report-playback-issue-encoding`: encoding compatibility | Real Windows PowerShell 5.1 and PowerShell 7 ANSI/BOM behavior. |
| `v029-diagnostics-privacy`: actual snapshot and collector ZIP | Windows reporter/collector integration; portable serialization and redaction probes still run on Linux. |

The four existing Windows-specific skips in `compare-transition-runner.test.cjs` retain their individual reasons. All nine cases stay discovered; `tests/test-platform.test.cjs` checks that the five new registrations execute on `win32` and have explicit skip reasons on Linux. These registration checks do not execute Windows integrations.

Mount tests use Windows client path identities on every host. They retain real filesystem fixtures on Windows and exact-path synthetic filesystem fixtures elsewhere. Native-helper service fixtures use host-absolute paths. Product path validation, POSIX local-probe refusal and existing assertions remain intact.

Linux source tests do not validate Windows playback, Host, installation, hardware, or the unavailable material contracts. A Linux pass does not replace the Windows CI job or material validation.

Plugin Alameda identity and actual frozen app/view-manager alias-order checks are explicit material tests in `tests/plugin-amd-identity-material-selftest.cjs` and `tests/plugin-dialogclose-material-selftest.cjs`. They retain the original assertions and require the unavailable Carnival Web inputs; they are not discovered by the public `tests/*.test.cjs` runner. The synthetic close-button tests remain in the public set. A prepared local checkout runs both explicitly:

```powershell
node --test tests/plugin-amd-identity-material-selftest.cjs tests/plugin-dialogclose-material-selftest.cjs
```

Other gates run these checks:

- `tools/ci-syntax.cjs` checks tracked JavaScript files under maintained `src/`, `tools/`, and `tests/` paths.
- `tools/ci-powershell-syntax.ps1` parses tracked PowerShell files in those paths.
- `tools/ci-secret-scan.cjs` scans tracked text in maintained source, CI workflow files, and this document for a fixed set of credential patterns. It reports paths and rule identifiers only; this finite scan is not comprehensive.
- `tools/ci-diff-check.cjs` checks the PR base or push contribution against its base commit and fails closed if the required tracking reference is missing.
- `tools/ci-windows-path-diagnostics.cjs` records opaque temporary-path diagnostics before tests and cleans only its own temporary directory.

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

For a pull request, set `CI_EVENT_NAME` to `pull_request` and `CI_PULL_REQUEST_BASE` to the base commit SHA. GitHub Actions supplies these values automatically. On a new-branch push, the checker compares the branch contribution after its merge-base with the default branch.
