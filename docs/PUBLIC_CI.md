# Public offline CI

The workflow in `.github/workflows/public-ci.yml` runs on pull requests and pushes using a Windows runner. It grants `contents: read`, disables persisted checkout credentials, and pins Actions to full commit SHAs. The full route installs the locked JavaScript dependencies with `npm ci --ignore-scripts`; the documentation route uses Node built-ins without installing dependencies. It requires no repository secrets, external runtime archives, or built binaries. Node.js is pinned to 24.18.1.

Pinned actions are `actions/checkout` v4.4.0 (`11d5960a326750d5838078e36cf38b85af677262`) and `actions/setup-node` v4.4.0 (`49933ea5288caeca8642d1e84afbd3f7d6820020`).

## Conservative documentation routing

`tools/ci-change-scope.cjs` permits the lightweight route only for this audited prose allowlist:

- Root `README.md`, `CHANGELOG.md`, `TODO.md`.
- Under `docs/`: `README.md`, `USER_GUIDE.md`, `KNOWN_ISSUES.md`, `CONTRIBUTING.md`, `PUBLIC_CI.md`, `PROJECT_STATUS.md`, `DEVELOPMENT_LOG.md`, `ROADMAP.md`, `NEXT_RELEASE_SCOPE.md`, `RELEASE_CONVENTIONS.md`, and `templates/RELEASE_TEMPLATE.md`.

All other paths require the existing full public regression, including new/unknown Markdown documents, code, tests and fixtures, workflows, dependencies/lockfiles, build configuration, vendor inputs, installer and native paths. Markdown extension alone grants no exemption. `tools/build-input-contract.cjs` consumes Markdown notices and component/source contracts such as `THIRD_PARTY_NOTICES.md`, `docs/LICENSING.md` and `docs/LIBMPV_INPUT.md`; they stay on the full route. The routing test asserts that the allowlist never overlaps declared build inputs. Audit consumers before expanding the list.

PR classification compares the event's exact `pull_request.base.sha` to `pull_request.head.sha`, covering the whole PR rather than its final commit or the synthetic merge commit's last parent. The checkout must include the event head. Push classification compares exact `before` to `after`, including force pushes. Both rename endpoints and deleted paths are classified. A new-branch zero `before`, missing/invalid/unavailable commit, empty change list, shallow history, unexpected status, truncated diff, unknown event or mismatched checkout selects **full regression**. There is no path-filtered workflow trigger or API file-list pagination.

`tools/ci-docs-check.cjs` checks patch whitespace, valid UTF-8 text/final newline, finite credential patterns, and newly added/changed local Markdown file destinations (inline links/images and reference definitions). It also rejects links from audited prose to documents removed by the change. Fenced/inline code examples are ignored. Existing unrelated archive-link debt is preserved; HTTP availability, heading anchors and a complete Markdown grammar are outside this finite offline check. Broken new links or failed format/pattern checks fail the job.

The existing workflow/job identity `Public offline CI / windows-public-offline` remains present on every push/PR. On the documentation route its result represents the actual lightweight checks; the regression step is skipped and the summary explicitly says **NOT EXECUTED**. On the full route all previous gates remain required in that job. Failures/cancellation are not converted into success by the reporting step; no `continue-on-error` or synthetic passing test status is used. Repository protection settings remain unchanged.

`workflow_dispatch` runs the separately documented complete `manual-windows-test-package` job; documentation routing does not apply to manual packaging. No Actions, permissions, secrets, dependency upgrades or additional services are introduced.

Routing and lightweight-check fixtures can be tested without vendor inputs or npm installation:

```powershell
node --test tests/ci-change-scope.test.cjs tests/ci-diff-check.test.cjs tests/ci-public-tests.test.cjs tests/ci-secret-scan.test.cjs
```

For a local routing dry run, supply `CI_EVENT_NAME` and the full exact SHAs in `CI_PULL_REQUEST_BASE` / `CI_PULL_REQUEST_HEAD`, or `CI_PUSH_BEFORE` / `CI_PUSH_HEAD`, then run `node tools/ci-change-scope.cjs`. Missing values safely print `mode: full`. With a documentation-only result, `node tools/ci-docs-check.cjs` runs the lightweight gate against the checked-out files.

## Checks

The public runner discovers `tests/*.test.cjs` and retains the following six exclusions. Their old missing-Carnival explanations are historical: current contracts use fixed components and generated artifacts. This documentation update does not change the exclusion list or claim those tests execute on the public route. They remain reported as `material-required` / `NOT EXECUTED`; the prepared manual Windows route separately executes all test files.

| Excluded test | Current contract / prepared input |
| --- | --- |
| `tests/device-identity.test.cjs` | Fixed Web app/CM bodies and the generated maintained ApiClient selection. |
| `tests/external-player-process-chain.test.cjs` | Generated `src/electronapp/preload.js` from its maintained template and generator. |
| `tests/playback-route-stats.test.cjs` | Fixed Web `modules/playerstats/playerstats.js` and maintained consumer source. |
| `tests/playbackmanager-request-session.test.cjs` | Fixed Web playback template materialized through its production overlay. |
| `tests/runtime-provenance.test.cjs` | Independent fixture manifests, fixed components and generated preload/provenance. |
| `tests/web-overlay-preparation.test.cjs` | Fixed Web bases, explicit patch inputs and maintained overlay generators. |

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

Plugin Alameda identity and actual frozen app/view-manager alias-order checks are explicit material tests in `tests/plugin-amd-identity-material-selftest.cjs` and `tests/plugin-dialogclose-material-selftest.cjs`. They retain the original assertions and read the fixed `vendor/web-snapshot/www` inputs; they are not discovered by the public `tests/*.test.cjs` runner. The historical 1-failure/39-skip material result belongs to an earlier fixture stage. Later independent-component fixtures have a separate local21-file/135-case all-pass record; that does not convert the six public exclusions into passes or establish a new release package. The successful manual test build `39974691780` ran all1609 ordinary tests plus its explicit Host material check. A `release_package=true` run additionally executes all explicit material selftests and must record its own result. The synthetic close-button tests remain in the public set. A prepared local checkout runs both explicitly:

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

The independent range-cache branch also offers an explicit manual `range_smoke` input (`off`, `entry`, `native`). The separate Windows job reuses a hash-locked existing artifact and immutable smoke tools without rebuilding. It adds only job-local Actions read permission for the standard token, keeps existing jobs/concurrency unchanged, fails closed on expired/unavailable inputs and uploads bounded receipts. It is not a release route and is not dispatched by source changes. See [the fixed runner method](PLAYBACK_RANGE_WINDOWS_RUNNER.md).
